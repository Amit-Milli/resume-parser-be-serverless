import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, ScanCommand, QueryCommand, BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import handler from '../libs/handler';
import Logger from '../libs/logger';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Get multiple job details efficiently
 * @param {Array<string>} jobIds - Array of job IDs
 * @returns {Promise<Object>} - Map of job details
 */
const getMultipleJobDetails = async (jobIds) => {
  try {
    if (!jobIds || jobIds.length === 0) return {};

    const uniqueJobIds = [...new Set(jobIds)];
    const jobDetailsMap = {};

    // Process in batches of 100 (DynamoDB limit)
    const batchSize = 100;
    for (let i = 0; i < uniqueJobIds.length; i += batchSize) {
      const batch = uniqueJobIds.slice(i, i + batchSize);

      const params = {
        RequestItems: {
          [process.env.JOBS_TABLE_NAME]: {
            Keys: batch.map((id) => ({ id })),
          },
        },
      };

      const result = await dynamoDb.send(new BatchGetCommand(params));

      if (result.Responses && result.Responses[process.env.JOBS_TABLE_NAME]) {
        result.Responses[process.env.JOBS_TABLE_NAME].forEach((job) => {
          jobDetailsMap[job.id] = job;
        });
      }
    }

    return jobDetailsMap;
  } catch (error) {
    Logger.error('Error getting multiple job details:', error);
    return {};
  }
};

/**
 * Get multiple resume details efficiently
 * @param {Array<string>} resumeIds - Array of resume IDs
 * @returns {Promise<Object>} - Map of resume details
 */
const getMultipleResumeDetails = async (resumeIds) => {
  try {
    if (!resumeIds || resumeIds.length === 0) return {};

    const uniqueResumeIds = [...new Set(resumeIds)];
    const resumeDetailsMap = {};

    // Process in batches of 100 (DynamoDB limit)
    const batchSize = 100;
    for (let i = 0; i < uniqueResumeIds.length; i += batchSize) {
      const batch = uniqueResumeIds.slice(i, i + batchSize);

      const params = {
        RequestItems: {
          [process.env.RESUMES_TABLE_NAME]: {
            Keys: batch.map((id) => ({ id })),
          },
        },
      };

      const result = await dynamoDb.send(new BatchGetCommand(params));

      if (result.Responses && result.Responses[process.env.RESUMES_TABLE_NAME]) {
        result.Responses[process.env.RESUMES_TABLE_NAME].forEach((resume) => {
          resumeDetailsMap[resume.id] = resume;
        });
      }
    }

    return resumeDetailsMap;
  } catch (error) {
    Logger.error('Error getting multiple resume details:', error);
    return {};
  }
};

/**
 * Enhance match scores with job and resume details
 * @param {Array} matchScores - Array of match scores
 * @returns {Promise<Array>} - Enhanced match scores
 */
const enhanceMatchScores = async (matchScores) => {
  try {
    if (!matchScores || matchScores.length === 0) return [];

    // Extract unique job and resume IDs
    const jobIds = [...new Set(matchScores.map((score) => score.jobId).filter(Boolean))];
    const resumeIds = [...new Set(matchScores.map((score) => score.resumeId).filter(Boolean))];

    // Get job and resume details in parallel
    const [jobDetailsMap, resumeDetailsMap] = await Promise.all([
      getMultipleJobDetails(jobIds),
      getMultipleResumeDetails(resumeIds),
    ]);

    // Enhance match scores with details
    const enhancedScores = matchScores.map((score) => {
      const jobDetails = jobDetailsMap[score.jobId] || {};
      const resumeDetails = resumeDetailsMap[score.resumeId] || {};

      // Debug logging
      Logger.log('Processing match score:', {
        scoreId: score.id,
        jobId: score.jobId,
        resumeId: score.resumeId,
        jobDetails: jobDetails.title ? 'Found' : 'Not found',
        resumeDetails: resumeDetails.candidateEmail ? 'Found' : 'Not found',
        candidateEmail: resumeDetails.candidateEmail,
      });

      return {
        ...score,
        job: {
          id: jobDetails.id,
          title: jobDetails.title,
          company: jobDetails.company,
          description: jobDetails.description,
          requirements: jobDetails.requirements || [],
          location: jobDetails.location,
          salary: jobDetails.salary,
        },
        resume: {
          id: resumeDetails.id,
          fileName: resumeDetails.fileName,
          candidateEmail: resumeDetails.candidateEmail,
          uploadedAt: resumeDetails.uploadedAt,
          status: resumeDetails.status,
        },
        jobTitle: jobDetails.title || 'Unknown Job',
        company: jobDetails.company || 'Unknown Company',
        resumeFileName: resumeDetails.fileName || 'Unknown File',
        uploadedAt: resumeDetails.uploadedAt,
      };
    });

    return enhancedScores;
  } catch (error) {
    Logger.error('Error enhancing match scores:', error);
    // Return original scores if enhancement fails
    return matchScores;
  }
};

/**
 * Get all match scores
 * @returns {Promise<Array>} - List of match scores
 */
const getAllMatchScores = async () => {
  try {
    const params = {
      TableName: process.env.MATCH_SCORES_TABLE_NAME,
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    Logger.log(`Retrieved ${result.Items.length} match scores`);

    // Enhance with job and resume details
    const enhancedScores = await enhanceMatchScores(result.Items);
    return enhancedScores;
  } catch (error) {
    Logger.error('Error getting match scores:', error);
    throw error;
  }
};

/**
 * Get match scores for a specific job
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>} - List of match scores for the job
 */
const getMatchScoresByJob = async (jobId) => {
  try {
    const params = {
      TableName: process.env.MATCH_SCORES_TABLE_NAME,
      IndexName: 'JobScoresIndex',
      KeyConditionExpression: 'jobId = :jobId',
      ExpressionAttributeValues: {
        ':jobId': jobId,
      },
      ScanIndexForward: false, // Sort by score descending
    };

    const result = await dynamoDb.send(new QueryCommand(params));
    Logger.log(`Retrieved ${result.Items.length} match scores for job: ${jobId}`);

    // Enhance with job and resume details
    const enhancedScores = await enhanceMatchScores(result.Items);
    return enhancedScores;
  } catch (error) {
    Logger.error('Error getting match scores by job:', error);
    throw error;
  }
};

/**
 * Get top match scores
 * @param {number} limit - Number of top scores to return
 * @returns {Promise<Array>} - List of top match scores
 */
const getTopMatchScores = async (limit = 10) => {
  try {
    const params = {
      TableName: process.env.MATCH_SCORES_TABLE_NAME,
      IndexName: 'TopScoresIndex',
      ScanIndexForward: false, // Sort by score descending
      Limit: limit,
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    Logger.log(`Retrieved top ${result.Items.length} match scores`);

    // Enhance with job and resume details
    const enhancedScores = await enhanceMatchScores(result.Items);
    return enhancedScores;
  } catch (error) {
    Logger.error('Error getting top match scores:', error);
    throw error;
  }
};

/**
 * Get match scores for a specific resume
 * @param {string} resumeId - Resume ID
 * @returns {Promise<Array>} - List of match scores for the resume
 */
const getMatchScoresByResume = async (resumeId) => {
  try {
    const params = {
      TableName: process.env.MATCH_SCORES_TABLE_NAME,
      IndexName: 'ResumeScoresIndex',
      KeyConditionExpression: 'resumeId = :resumeId',
      ExpressionAttributeValues: {
        ':resumeId': resumeId,
      },
    };

    const result = await dynamoDb.send(new QueryCommand(params));
    Logger.log(`Retrieved ${result.Items.length} match scores for resume: ${resumeId}`);

    // Enhance with job and resume details
    const enhancedScores = await enhanceMatchScores(result.Items);
    return enhancedScores;
  } catch (error) {
    Logger.error('Error getting match scores by resume:', error);
    throw error;
  }
};

/**
 * Main match scores handler
 */
export const main = handler(async (event) => {
  try {
    Logger.log('Match scores request received', { event });

    // Handle different API Gateway event structures
    const httpMethod = event.httpMethod || event.method;
    const { pathParameters, queryStringParameters } = event;
    const jobId = pathParameters?.jobId;
    const { limit, resumeId } = queryStringParameters || {};

    switch (httpMethod) {
      case 'GET': {
        if (jobId) {
          // Get match scores for specific job
          const matchScores = await getMatchScoresByJob(jobId);

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({
              jobId,
              matchScores,
              count: matchScores.length,
            }),
          };
        }

        if (resumeId) {
          // Get match scores for specific resume
          const matchScores = await getMatchScoresByResume(resumeId);

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({
              resumeId,
              matchScores,
              count: matchScores.length,
            }),
          };
        }

        if (limit) {
          // Get top match scores
          const topScores = await getTopMatchScores(parseInt(limit, 10));

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({
              topScores,
              count: topScores.length,
            }),
          };
        }

        // Get all match scores
        const matchScores = await getAllMatchScores();

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify({
            matchScores,
            count: matchScores.length,
          }),
        };
      }

      default:
        Logger.log('Method not allowed:', httpMethod);
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify({
            error: 'Method not allowed',
          }),
        };
    }
  } catch (error) {
    Logger.error('Match scores handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
});
