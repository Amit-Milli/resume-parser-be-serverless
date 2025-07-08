import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import handler from '../libs/handler';
import Logger from '../libs/logger';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

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

    return result.Items;
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

    return result.Items;
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

    return result.Items;
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

    return result.Items;
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
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
  } catch (error) {
    Logger.error('Match scores handler error:', error);

    return {
      statusCode: error.statusCode || 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
});
