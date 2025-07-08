import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, PutCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
// import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { HuggingFaceInference } from '@langchain/community/llms/hf';
import handler from '../../libs/handler';
import Logger from '../../libs/logger';
import { PROCESSING_STATUS } from '../../constants/tableName.constants';

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

// Initialize OpenAI model
// const model = new ChatOpenAI({
//   modelName: 'gpt-3.5-turbo',
//   openAIApiKey: process.env.OPENAI_API_KEY,
// });

// Initialize HuggingFace model for scoring
const model = new HuggingFaceInference({
  model: 'microsoft/DialoGPT-medium', // Better for conversational/structured output
  apiKey: process.env.HUGGINGFACE_API_TOKEN,
  temperature: 0.1,
  maxTokens: 1500,
  maxRetries: 3,
  timeout: 30000,
});

// Scoring prompt template
const scoringPrompt = PromptTemplate.fromTemplate(`
You are an expert HR professional and technical recruiter. Your task is to evaluate how well a candidate's skills match a job's requirements and provide a comprehensive match score.

Job Requirements:
{jobRequirements}

Candidate's Extracted Skills:
{candidateSkills}

Please evaluate the match and provide:

Overall Match Score (0-100)
Detailed breakdown of matches and gaps
Recommendations

Consider:
Technical skill alignment
Experience level match
Missing critical skills
Bonus skills that add value

Return the results as a JSON object:
{{
  "overallScore": 85,
  "technicalMatch": 90,
  "experienceMatch": 80,
  "missingSkills": ["skill1", "skill2"],
  "bonusSkills": ["skill1", "skill2"],
  "detailedAnalysis": "Detailed explanation of the match...",
  "recommendations": "Recommendations for the hiring team...",
  "confidence": 0.9
}}
`);

/**
 * Calculate match score using LangChain with HuggingFace
 * @param {Array} jobRequirements - Job requirements
 * @param {Object} candidateSkills - Candidate's extracted skills
 * @returns {Promise} - Match score and analysis
 */
const calculateMatchScore = async (jobRequirements, candidateSkills) => {
  try {
    Logger.log('Calculating match score', jobRequirements, candidateSkills);

    const prompt = await scoringPrompt.format({
      jobRequirements: JSON.stringify(jobRequirements, null, 2),
      candidateSkills: JSON.stringify(candidateSkills, null, 2),
    });

    // HuggingFace returns a string, not an object with content property
    const response = await model.invoke(prompt);

    // OpenAI marchscore
    // const matchScore = JSON.parse(response.content);

    // Try to parse the response as JSON
    let matchScore;
    try {
      // Clean the response - remove any markdown formatting
      const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      matchScore = JSON.parse(cleanedResponse);
    } catch (parseError) {
      Logger.warn('Failed to parse LLM response as JSON, using fallback:', parseError.message);
      // Fallback: create a basic structure if parsing fails
      matchScore = {
        overallScore: 50,
        technicalMatch: 50,
        experienceMatch: 50,
        missingSkills: [],
        bonusSkills: [],
        detailedAnalysis: 'Analysis unavailable due to parsing error',
        recommendations: 'Unable to provide recommendations',
        confidence: 0.3,
      };
    }

    Logger.log('Successfully calculated match score:', matchScore);
    return matchScore;
  } catch (error) {
    Logger.error('Error calculating match score:', error);
    throw error;
  }
};

/**
 * Store match score in DynamoDB
 * @param {Object} matchData - Match score data
 * @returns {Promise<Object>} - Stored match data
 */
const storeMatchScore = async (matchData) => {
  try {
    const params = {
      TableName: process.env.MATCH_SCORES_TABLE_NAME,
      Item: {
        id: matchData.id,
        resumeId: matchData.resumeId,
        jobId: matchData.jobId,
        overallScore: matchData.overallScore,
        technicalMatch: matchData.technicalMatch,
        experienceMatch: matchData.experienceMatch,
        missingSkills: matchData.missingSkills,
        bonusSkills: matchData.bonusSkills,
        detailedAnalysis: matchData.detailedAnalysis,
        recommendations: matchData.recommendations,
        confidence: matchData.confidence,
        createdAt: new Date().toISOString(),
        scoredAt: new Date().toISOString(),
      },
    };

    await dynamoDb.send(new PutCommand(params));
    Logger.log(`Stored match score for resume: ${matchData.resumeId}`);

    return params.Item;
  } catch (error) {
    Logger.error('Error storing match score:', error);
    throw error;
  }
};

/**
 * Update resume status to scored
 * @param {string} resumeId - Resume ID
 * @param {number} matchScore - Overall match score
 */
const updateResumeStatus = async (resumeId, matchScore) => {
  try {
    const params = {
      TableName: process.env.RESUMES_TABLE_NAME,
      Key: { id: resumeId },
      UpdateExpression: 'SET status = :status, matchScore = :score, scoredAt = :timestamp',
      ExpressionAttributeValues: {
        ':status': 'SCORED',
        ':score': matchScore,
        ':timestamp': new Date().toISOString(),
      },
    };

    await dynamoDb.send(new UpdateCommand(params));
    Logger.log(`Updated resume ${resumeId} status to SCORED`);
  } catch (error) {
    Logger.error('Error updating resume status:', error);
    throw error;
  }
};

/**
 * Update processing status
 * @param {string} processingId - Processing ID
 * @param {string} status - New status
 * @param {Object} additionalData - Additional data
 */
const updateProcessingStatus = async (processingId, status, additionalData = {}) => {
  try {
    const params = {
      TableName: process.env.PROCESSING_QUEUE_TABLE_NAME,
      Key: { id: processingId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': new Date().toISOString(),
        ...additionalData,
      },
    };

    Object.keys(additionalData).forEach((key) => {
      if (key !== 'id') {
        params.UpdateExpression += `, ${key} = :${key}`;
      }
    });

    await dynamoDb.send(new UpdateCommand(params));
    Logger.log(`Updated processing status to ${status} for ID: ${processingId}`);
  } catch (error) {
    Logger.error('Error updating processing status:', error);
    throw error;
  }
};

/**
 * Main scoring worker function
 */
export const main = handler(async (event) => {
  try {
    Logger.log('Scoring Worker started', { event });

    for (const record of event.Records) {
      const messageBody = JSON.parse(record.body);
      Logger.log('Processing scoring message:', messageBody);

      if (messageBody.type !== 'SCORING') {
        Logger.warn(`Skipping message with type: ${messageBody.type}`);
        continue;
      }

      const {
        resumeId,
        jobId,
        extractedSkills,
        jobRequirements,
        processingId,
      } = messageBody;

      try {
        // Update status to scoring
        await updateProcessingStatus(processingId, PROCESSING_STATUS.SCORING, {
          scoringStartedAt: new Date().toISOString(),
        });

        // Calculate match score
        const matchScore = await calculateMatchScore(jobRequirements, extractedSkills);

        // Store match score
        const matchData = {
          id: `${resumeId}-${jobId}`,
          resumeId,
          jobId,
          ...matchScore,
        };

        await storeMatchScore(matchData);

        // Update resume status
        await updateResumeStatus(resumeId, matchScore.overallScore);

        // Update processing status to completed
        await updateProcessingStatus(processingId, PROCESSING_STATUS.COMPLETED, {
          scoringCompletedAt: new Date().toISOString(),
          finalScore: matchScore.overallScore,
        });

        Logger.log(`Successfully scored resume: ${resumeId} with score: ${matchScore.overallScore}`);
      } catch (error) {
        Logger.error(`Error scoring resume ${resumeId}:`, error);

        await updateProcessingStatus(processingId, PROCESSING_STATUS.FAILED, {
          error: error.message,
          failedAt: new Date().toISOString(),
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scoring completed',
        processedCount: event.Records.length,
      }),
    };
  } catch (error) {
    Logger.error('Scoring Worker error:', error);
    throw error;
  }
});
