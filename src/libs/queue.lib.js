import {
  SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import Logger from './logger';

// Configure AWS clients
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

// Queue URLs (will be set from environment variables)
const QUEUE_URLS = {
  RESUME_PROCESSING: process.env.RESUME_PROCESSING_QUEUE_URL,
  SKILL_EXTRACTION: process.env.SKILL_EXTRACTION_QUEUE_URL,
  SCORING: process.env.SCORING_QUEUE_URL,
};

/**
 * Send message to SQS queue
 * @param {string} queueUrl - SQS queue URL
 * @param {Object} messageBody - Message body
 * @param {Object} attributes - Message attributes
 * @returns {Promise<Object>} - SQS send result
 */
export const sendMessage = async (queueUrl, messageBody, attributes = {}) => {
  try {
    const params = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        ...attributes,
        timestamp: {
          DataType: 'String',
          StringValue: new Date().toISOString(),
        },
        messageId: {
          DataType: 'String',
          StringValue: uuidv4(),
        },
      },
    };

    Logger.log(`Sending message to queue: ${queueUrl}`, { messageBody });
    const result = await sqsClient.send(new SendMessageCommand(params));
    Logger.log(`Message sent successfully: ${result.MessageId}`);

    return result;
  } catch (error) {
    Logger.error('Error sending message to SQS:', error);
    throw error;
  }
};

/**
 * Receive messages from SQS queue
 * @param {string} queueUrl - SQS queue URL
 * @param {number} maxMessages - Maximum number of messages to receive
 * @returns {Promise<Array>} - Array of messages
 */
export const receiveMessages = async (queueUrl, maxMessages = 10) => {
  try {
    const params = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20, // Long polling
      MessageAttributeNames: ['All'],
    };

    Logger.log(`Receiving messages from queue: ${queueUrl}`);
    const result = await sqsClient.send(new ReceiveMessageCommand(params));

    if (result.Messages) {
      Logger.log(`Received ${result.Messages.length} messages`);
      return result.Messages.map((msg) => ({
        ...msg,
        Body: JSON.parse(msg.Body),
      }));
    }

    return [];
  } catch (error) {
    Logger.error('Error receiving messages from SQS:', error);
    throw error;
  }
};

/**
 * Delete message from SQS queue
 * @param {string} queueUrl - SQS queue URL
 * @param {string} receiptHandle - Message receipt handle
 * @returns {Promise<Object>} - Delete result
 */
export const deleteMessage = async (queueUrl, receiptHandle) => {
  try {
    const params = {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    };

    Logger.log(`Deleting message from queue: ${queueUrl}`);
    const result = await sqsClient.send(new DeleteMessageCommand(params));
    Logger.log('Message deleted successfully');

    return result;
  } catch (error) {
    Logger.error('Error deleting message from SQS:', error);
    throw error;
  }
};

/**
 * Update processing status in DynamoDB
 * @param {string} tableName - DynamoDB table name
 * @param {string} id - Record ID
 * @param {string} status - New status
 * @param {Object} additionalData - Additional data to update
 * @returns {Promise<Object>} - Update result
 */
export const updateProcessingStatus = async (tableName, id, status, additionalData = {}) => {
  try {
    const updateExpression = ['SET #status = :status, updatedAt = :updatedAt'];
    const expressionAttributeNames = { '#status': 'status' };
    const expressionAttributeValues = {
      ':status': status,
      ':updatedAt': new Date().toISOString(),
    };

    // Add additional fields to update expression
    Object.keys(additionalData).forEach((key) => {
      if (key !== 'id') {
        updateExpression.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = additionalData[key];
      }
    });

    const params = {
      TableName: tableName,
      Key: { id },
      UpdateExpression: updateExpression.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    Logger.log(`Updating status to ${status} for ID: ${id}`);
    const result = await dynamoDb.send(new UpdateCommand(params));
    Logger.log('Status updated successfully');

    return result;
  } catch (error) {
    Logger.error('Error updating processing status:', error);
    throw error;
  }
};

/**
 * Send resume for processing
 * @param {Object} resumeData - Resume data
 * @returns {Promise<Object>} - Processing result
 */
export const sendResumeForProcessing = async (resumeData) => {
  try {
    const messageBody = {
      type: 'RESUME_PROCESSING',
      resumeId: resumeData.resumeId,
      jobId: resumeData.jobId,
      s3Key: resumeData.s3Key,
      candidateEmail: resumeData.candidateEmail,
      timestamp: new Date().toISOString(),
    };

    const result = await sendMessage(QUEUE_URLS.RESUME_PROCESSING, messageBody, {
      messageType: {
        DataType: 'String',
        StringValue: 'RESUME_PROCESSING',
      },
    });

    // Update resume status to processing
    await updateProcessingStatus(
      process.env.RESUMES_TABLE_NAME,
      resumeData.resumeId,
      'PROCESSING',
      { processingStartedAt: new Date().toISOString() },
    );

    return result;
  } catch (error) {
    Logger.error('Error sending resume for processing:', error);
    throw error;
  }
};

/**
 * Send parsed resume for skill extraction
 * @param {Object} parsedResumeData - Parsed resume data
 * @returns {Promise<Object>} - Processing result
 */
export const sendForSkillExtraction = async (parsedResumeData) => {
  try {
    const messageBody = {
      type: 'SKILL_EXTRACTION',
      resumeId: parsedResumeData.resumeId,
      jobId: parsedResumeData.jobId,
      parsedContent: parsedResumeData.parsedContent,
      candidateEmail: parsedResumeData.candidateEmail,
      processingId: parsedResumeData.processingId,
      timestamp: new Date().toISOString(),
    };

    const result = await sendMessage(QUEUE_URLS.SKILL_EXTRACTION, messageBody, {
      messageType: {
        DataType: 'String',
        StringValue: 'SKILL_EXTRACTION',
      },
    });

    // Update resume status to skill extraction
    await updateProcessingStatus(
      process.env.RESUMES_TABLE_NAME,
      parsedResumeData.resumeId,
      'SKILL_EXTRACTION',
      { skillExtractionStartedAt: new Date().toISOString() },
    );

    return result;
  } catch (error) {
    Logger.error('Error sending for skill extraction:', error);
    throw error;
  }
};

/**
 * Send skill data for scoring
 * @param {Object} skillData - Skill data
 * @returns {Promise<Object>} - Processing result
 */
export const sendForScoring = async (skillData) => {
  try {
    const messageBody = {
      type: 'SCORING',
      resumeId: skillData.resumeId,
      jobId: skillData.jobId,
      extractedSkills: skillData.extractedSkills,
      jobRequirements: skillData.jobRequirements,
      processingId: skillData.processingId,
      timestamp: new Date().toISOString(),
    };

    const result = await sendMessage(QUEUE_URLS.SCORING, messageBody, {
      messageType: {
        DataType: 'String',
        StringValue: 'SCORING',
      },
    });

    // Update resume status to scoring
    await updateProcessingStatus(
      process.env.RESUMES_TABLE_NAME,
      skillData.resumeId,
      'SCORING',
      { scoringStartedAt: new Date().toISOString() },
    );

    return result;
  } catch (error) {
    Logger.error('Error sending for scoring:', error);
    throw error;
  }
};

/**
 * Get queue metrics
 * @param {string} queueUrl - SQS queue URL
 * @returns {Promise<Object>} - Queue metrics
 */
export const getQueueMetrics = async (queueUrl) => {
  try {
    // Note: SQS metrics are available through CloudWatch
    // This is a placeholder for queue monitoring
    Logger.log(`Getting metrics for queue: ${queueUrl}`);

    return {
      queueUrl,
      timestamp: new Date().toISOString(),
      // Add actual metrics here if needed
    };
  } catch (error) {
    Logger.error('Error getting queue metrics:', error);
    throw error;
  }
};

/**
 * Monitor all queues
 * @returns {Promise<Object>} - All queue metrics
 */
export const monitorAllQueues = async () => {
  try {
    const metrics = {};

    for (const [queueName, queueUrl] of Object.entries(QUEUE_URLS)) {
      if (queueUrl) {
        metrics[queueName] = await getQueueMetrics(queueUrl);
      }
    }

    return metrics;
  } catch (error) {
    Logger.error('Error monitoring queues:', error);
    throw error;
  }
};

export default {
  sendMessage,
  receiveMessages,
  deleteMessage,
  updateProcessingStatus,
  sendResumeForProcessing,
  sendForSkillExtraction,
  sendForScoring,
  getQueueMetrics,
  monitorAllQueues,
};

