import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import pdf from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import handler from '../../libs/handler';
import Logger from '../../libs/logger';
import { sendForSkillExtraction } from '../../libs/queue.lib';
import { PROCESSING_STATUS } from '../../constants/tableName.constants';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Parse PDF content from S3 with caching
 * @param {string} s3Key - S3 object key
 * @returns {Promise<string>} - Parsed text content
 */
const parsePDFFromS3 = async (s3Key) => {
  try {
    Logger.log(`Parsing PDF from S3: ${s3Key}`);

    const params = {
      Bucket: process.env.RESUME_S3_BUCKET,
      Key: s3Key,
    };

    const s3Object = await s3Client.send(new GetObjectCommand(params));
    const pdfBuffer = await s3Object.Body.transformToByteArray();

    // Optimize PDF parsing with timeout
    const pdfData = await Promise.race([
      pdf(Buffer.from(pdfBuffer)),
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('PDF parsing timeout')), 30000);
      }),
    ]);

    const parsedText = pdfData.text;

    Logger.log(`Successfully parsed PDF. Text length: ${parsedText.length}`);
    return parsedText;
  } catch (error) {
    Logger.error('Error parsing PDF from S3:', error);
    throw error;
  }
};

/**
 * Store parsed resume data in DynamoDB with batch optimization
 * @param {Array} resumeDataArray - Array of resume data to store
 * @returns {Promise<Array>} - Stored resume data
 */
const storeParsedResumes = async (resumeDataArray) => {
  try {
    const batchSize = 25; // DynamoDB batch write limit
    const batches = [];

    for (let i = 0; i < resumeDataArray.length; i += batchSize) {
      batches.push(resumeDataArray.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const writeRequests = batch.map((resumeData) => ({
        PutRequest: {
          Item: {
            id: resumeData.resumeId,
            jobId: resumeData.jobId,
            candidateEmail: resumeData.candidateEmail,
            s3Key: resumeData.s3Key,
            parsedText: resumeData.parsedText,
            status: 'PARSED',
            uploadedAt: new Date().toISOString(),
            parsedAt: new Date().toISOString(),
            processingId: resumeData.processingId,
          },
        },
      }));

      const params = {
        RequestItems: {
          [process.env.RESUMES_TABLE_NAME]: writeRequests,
        },
      };

      const result = await dynamoDb.send(new BatchWriteCommand(params));
      results.push(result);

      Logger.log(`Stored ${batch.length} parsed resume records`);
    }

    return results;
  } catch (error) {
    Logger.error('Error storing parsed resumes:', error);
    throw error;
  }
};

/**
 * Update processing queue status with batch optimization
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

      const result = await dynamoDb.send(new BatchWriteCommand(params));
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
 * Main resume parser worker function with batch processing
 */
export const main = handler(async (event) => {
  try {
    Logger.log('Resume Parser Worker started', { event });

    const batchItemFailures = [];
    const processingResults = [];

    // Process each message from SQS batch
    for (let i = 0; i < event.Records.length; i++) {
      const record = event.Records[i];
      const messageBody = JSON.parse(record.body);

      try {
        Logger.log(`Processing message ${i + 1}/${event.Records.length}:`, messageBody);

        if (messageBody.type !== 'RESUME_PROCESSING') {
          Logger.warn(`Skipping message with type: ${messageBody.type}`);
          continue;
        }

        const {
          resumeId,
          jobId,
          s3Key,
          candidateEmail,
        } = messageBody;

        const processingId = uuidv4();

        // Update status to parsing
        await updateProcessingStatuses([{
          processingId,
          status: PROCESSING_STATUS.PARSING,
          additionalData: {
            resumeId,
            jobId,
            parsingStartedAt: new Date().toISOString(),
          },
        }]);

        // Parse PDF content
        const parsedText = await parsePDFFromS3(s3Key);

        // Prepare resume data for batch storage
        const resumeData = {
          resumeId,
          jobId,
          candidateEmail,
          s3Key,
          parsedText,
          processingId,
        };

        processingResults.push(resumeData);

        // Send for skill extraction
        await sendForSkillExtraction({
          resumeId,
          jobId,
          parsedContent: parsedText,
          candidateEmail,
        });

        Logger.log(`Successfully processed resume: ${resumeId}`);
      } catch (error) {
        Logger.error(`Error processing message ${i + 1}:`, error);
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    // Batch store all parsed resumes
    if (processingResults.length > 0) {
      await storeParsedResumes(processingResults);
    }

    // Update final processing statuses
    const finalStatusUpdates = processingResults.map(({ processingId }) => ({
      processingId,
      status: PROCESSING_STATUS.EXTRACTING_SKILLS,
      additionalData: {
        parsingCompletedAt: new Date().toISOString(),
      },
    }));

    if (finalStatusUpdates.length > 0) {
      await updateProcessingStatuses(finalStatusUpdates);
    }

    Logger.log('Resume Parser Worker completed', {
      processedCount: processingResults.length,
      failureCount: batchItemFailures.length,
    });

    return {
      batchItemFailures,
    };
  } catch (error) {
    Logger.error('Resume Parser Worker error:', error);
    throw error;
  }
});
