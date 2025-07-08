import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import handler from '../libs/handler';
import Logger from '../libs/logger';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Create a new job
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} - Created job
 */
const createJob = async (jobData) => {
  try {
    const jobId = uuidv4();
    const params = {
      TableName: process.env.JOBS_TABLE_NAME,
      Item: {
        id: jobId,
        title: jobData.title,
        company: jobData.company,
        description: jobData.description,
        requirements: jobData.requirements || [],
        location: jobData.location,
        salary: jobData.salary,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    await dynamoDb.send(new PutCommand(params));
    Logger.log(`Created job: ${jobId}`);

    return params.Item;
  } catch (error) {
    Logger.error('Error creating job:', error);
    throw error;
  }
};

/**
 * Get all jobs
 * @returns {Promise<Array>} - List of jobs
 */
const getAllJobs = async () => {
  try {
    const params = {
      TableName: process.env.JOBS_TABLE_NAME,
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    Logger.log(`Retrieved ${result.Items.length} jobs`);

    return result.Items;
  } catch (error) {
    Logger.error('Error getting jobs:', error);
    throw error;
  }
};

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job data
 */
const getJobById = async (jobId) => {
  try {
    const params = {
      TableName: process.env.JOBS_TABLE_NAME,
      Key: { id: jobId },
    };

    const result = await dynamoDb.send(new GetCommand(params));

    if (!result.Item) {
      throw new Error(`Job not found: ${jobId}`);
    }

    Logger.log(`Retrieved job: ${jobId}`);
    return result.Item;
  } catch (error) {
    Logger.error('Error getting job:', error);
    throw error;
  }
};

/**
 * Update job
 * @param {string} jobId - Job ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} - Updated job
 */
const updateJob = async (jobId, updateData) => {
  try {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updateData).forEach((key) => {
      if (key !== 'id') {
        updateExpression.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = updateData[key];
      }
    });

    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const params = {
      TableName: process.env.JOBS_TABLE_NAME,
      Key: { id: jobId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };

    const result = await dynamoDb.send(new UpdateCommand(params));
    Logger.log(`Updated job: ${jobId}`);

    return result.Attributes;
  } catch (error) {
    Logger.error('Error updating job:', error);
    throw error;
  }
};

/**
 * Delete job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Delete result
 */
const deleteJob = async (jobId) => {
  try {
    const params = {
      TableName: process.env.JOBS_TABLE_NAME,
      Key: { id: jobId },
    };

    await dynamoDb.send(new DeleteCommand(params));
    Logger.log(`Deleted job: ${jobId}`);

    return { message: 'Job deleted successfully' };
  } catch (error) {
    Logger.error('Error deleting job:', error);
    throw error;
  }
};

/**
 * Main jobs handler
 */
export const main = handler(async (event) => {
  try {
    Logger.log('Jobs request received', { event });

    // Handle different API Gateway event structures
    const httpMethod = event.httpMethod || event.method;
    const { pathParameters } = event;
    const jobId = pathParameters?.jobId;

    switch (httpMethod) {
      case 'POST': {
        const jobData = event.body;
        const newJob = await createJob(jobData);
        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify(newJob),
        };
      }

      case 'GET': {
        if (jobId) {
          const job = await getJobById(jobId);

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(job),
          };
        }
        const jobs = await getAllJobs();

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify(jobs),
        };
      }

      case 'PUT': {
        if (!jobId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ error: 'Job ID is required' }),
          };
        }

        const updateData = event.body;
        const updatedJob = await updateJob(jobId, updateData);

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify(updatedJob),
        };
      }

      case 'DELETE': {
        if (!jobId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ error: 'Job ID is required' }),
          };
        }

        const result = await deleteJob(jobId);

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify(result),
        };
      }

      default:
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
    Logger.error('Jobs handler error:', error);

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
