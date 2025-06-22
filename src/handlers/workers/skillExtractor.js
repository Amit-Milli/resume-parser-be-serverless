import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import handler from '../../libs/handler';
import Logger from '../../libs/logger';
import { sendForScoring } from '../../libs/queue.lib';
import { PROCESSING_STATUS } from '../../constants/tableName.constants';

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

// Initialize OpenAI model with optimized settings
const model = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo',
  temperature: 0.1,
  maxTokens: 2000, // Limit tokens for cost optimization
  openAIApiKey: process.env.OPENAI_API_KEY,
  // Add retry configuration
  maxRetries: 3,
  timeout: 30000,
});

// Optimized skill extraction prompt template
const skillExtractionPrompt = PromptTemplate.fromTemplate(`
You are an expert HR professional and technical recruiter. Extract technical skills from the resume text below.

RESUME TEXT:
{resumeText}

EXTRACTION RULES:
1. Only extract skills explicitly mentioned or strongly implied
2. Be conservative and accurate
3. Categorize skills properly
4. Estimate experience based on content
5. Return valid JSON only

REQUIRED OUTPUT FORMAT:
{
  "programmingLanguages": ["language1", "language2"],
  "frameworks": ["framework1", "framework2"],
  "databases": ["database1", "database2"],
  "cloudPlatforms": ["platform1", "platform2"],
  "tools": ["tool1", "tool2"],
  "softSkills": ["skill1", "skill2"],
  "estimatedExperience": "X years",
  "confidence": 0.85
}

Extract skills now:
`);

/**
 * Extract skills from resume text using LangChain with optimization
 * @param {string} resumeText - Parsed resume text
 * @returns {Promise<Object>} - Extracted skills
 */
const extractSkillsFromText = async (resumeText) => {
  try {
    Logger.log('Extracting skills from resume text');

    // Optimize text length for token efficiency
    const maxLength = 3000; // Reduced from 4000 for cost optimization
    const truncatedText = resumeText.length > maxLength
      ? `${resumeText.substring(0, maxLength)}...`
      : resumeText;

    // Add retry logic for LLM calls
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const prompt = await skillExtractionPrompt.format({
          resumeText: truncatedText,
        });

        const response = await model.invoke(prompt);
        const extractedSkills = JSON.parse(response.content);

        // Validate extracted skills
        if (!extractedSkills || typeof extractedSkills !== 'object') {
          throw new Error('Invalid skills format returned');
        }

        Logger.log('Successfully extracted skills:', extractedSkills);
        return extractedSkills;
      } catch (error) {
        attempts += 1;
        if (attempts === maxAttempts) {
          throw error;
        }
        Logger.warn(`LLM attempt ${attempts} failed, retrying...`, error.message);
        await new Promise((resolve) => {
          setTimeout(resolve, 1000 * attempts);
        }); // Exponential backoff
      }
    }
  } catch (error) {
    Logger.error('Error extracting skills:', error);
    throw error;
  }
};

/**
 * Get job requirements from DynamoDB with caching
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job requirements
 */
const getJobRequirements = async (jobId) => {
  try {
    const params = {
      TableName: process.env.JOBS_TABLE_NAME,
      Key: { id: jobId },
      ConsistentRead: false, // Use eventually consistent reads for better performance
    };

    const result = await dynamoDb.send(new GetCommand(params));

    if (!result.Item) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return result.Item;
  } catch (error) {
    Logger.error('Error getting job requirements:', error);
    throw error;
  }
};

/**
 * Update resume with extracted skills using batch operations
 * @param {Array} resumeUpdates - Array of resume updates
 * @returns {Promise<Array>} - Update results
 */
const updateResumesWithSkills = async (resumeUpdates) => {
  try {
    const batchSize = 25; // DynamoDB batch write limit
    const batches = [];

    for (let i = 0; i < resumeUpdates.length; i += batchSize) {
      batches.push(resumeUpdates.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const writeRequests = batch.map(({ resumeId, skills }) => ({
        PutRequest: {
          Item: {
            id: resumeId,
            extractedSkills: skills,
            skillsExtractedAt: new Date().toISOString(),
            status: 'SKILLS_EXTRACTED',
          },
        },
      }));

      const params = {
        RequestItems: {
          [process.env.RESUMES_TABLE_NAME]: writeRequests,
        },
      };

      const result = await dynamoDb.send(new PutCommand(params));
      results.push(result);
    }

    Logger.log(`Updated ${resumeUpdates.length} resumes with extracted skills`);
    return results;
  } catch (error) {
    Logger.error('Error updating resumes with skills:', error);
    throw error;
  }
};

/**
 * Update processing status with batch optimization
 * @param {Array} statusUpdates - Array of status updates
 * @returns {Promise<Array>} - Update results
 */
const updateProcessingStatuses = async (statusUpdates) => {
  try {
    const batchSize = 25; // DynamoDB batch write limit
    const batches = [];

    for (let i = 0; i < statusUpdates.length; i += batchSize) {
      batches.push(statusUpdates.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const writeRequests = batch.map(({ processingId, status, additionalData }) => ({
        PutRequest: {
          Item: {
            id: processingId,
            status,
            updatedAt: new Date().toISOString(),
            ...additionalData,
          },
        },
      }));

      const params = {
        RequestItems: {
          [process.env.PROCESSING_QUEUE_TABLE_NAME]: writeRequests,
        },
      };

      const result = await dynamoDb.send(new PutCommand(params));
      results.push(result);
    }

    Logger.log(`Updated ${statusUpdates.length} processing statuses`);
    return results;
  } catch (error) {
    Logger.error('Error updating processing statuses:', error);
    throw error;
  }
};

/**
 * Main skill extraction worker function with batch processing
 */
export const main = handler(async (event) => {
  try {
    Logger.log('Skill Extraction Worker started', { event });

    const batchItemFailures = [];
    const processingResults = [];

    // Process each message from SQS batch
    for (let i = 0; i < event.Records.length; i++) {
      const record = event.Records[i];
      const messageBody = JSON.parse(record.body);

      try {
        Logger.log(`Processing skill extraction message ${i + 1}/${event.Records.length}:`, messageBody);

        if (messageBody.type !== 'SKILL_EXTRACTION') {
          Logger.warn(`Skipping message with type: ${messageBody.type}`);
          continue;
        }

        const {
          resumeId,
          jobId,
          parsedText,
          processingId,
        } = messageBody;

        // Update status to extracting skills
        await updateProcessingStatuses([{
          processingId,
          status: PROCESSING_STATUS.EXTRACTING_SKILLS,
          additionalData: {
            skillExtractionStartedAt: new Date().toISOString(),
          },
        }]);

        // Extract skills from resume text
        const extractedSkills = await extractSkillsFromText(parsedText);

        // Get job requirements for comparison
        const jobRequirements = await getJobRequirements(jobId);

        // Prepare resume update for batch processing
        processingResults.push({
          resumeId,
          skills: extractedSkills,
        });

        // Update status to completed
        await updateProcessingStatuses([{
          processingId,
          status: PROCESSING_STATUS.COMPLETED,
          additionalData: {
            skillExtractionCompletedAt: new Date().toISOString(),
            skillsCount: Object.keys(extractedSkills).length,
          },
        }]);

        // Send to scoring queue
        await sendForScoring({
          resumeId,
          jobId,
          extractedSkills,
          jobRequirements: jobRequirements.requirements || [],
          processingId,
        });

        Logger.log(`Successfully extracted skills for resume: ${resumeId}`);
      } catch (error) {
        Logger.error(`Error extracting skills for message ${i + 1}:`, error);

        // Add to batch item failures for SQS
        batchItemFailures.push({
          itemIdentifier: record.messageId,
        });

        // Update status to failed if we have processing ID
        if (messageBody.processingId) {
          try {
            await updateProcessingStatuses([{
              processingId: messageBody.processingId,
              status: PROCESSING_STATUS.FAILED,
              additionalData: {
                error: error.message,
                failedAt: new Date().toISOString(),
              },
            }]);
          } catch (statusError) {
            Logger.error('Error updating failed status:', statusError);
          }
        }
      }
    }

    // Batch update all successfully processed resumes
    if (processingResults.length > 0) {
      await updateResumesWithSkills(processingResults);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Skill extraction completed',
        processedCount: event.Records.length - batchItemFailures.length,
        failedCount: batchItemFailures.length,
        batchItemFailures,
      }),
    };
  } catch (error) {
    Logger.error('Skill Extraction Worker error:', error);
    throw error;
  }
});
