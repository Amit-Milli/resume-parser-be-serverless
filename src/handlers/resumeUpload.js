import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import handler from '../libs/handler';
import Logger from '../libs/logger';
import { sendResumeForProcessing } from '../libs/queue.lib';
import { RESUME_STATUS } from '../constants/tableName.constants';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Parse multipart form data efficiently
 * @param {string} body - Request body
 * @param {string} boundary - Multipart boundary
 * @returns {Object} - Parsed form data
 */
const parseMultipartData = (body, boundary) => {
  try {
    const parts = body.split(`--${boundary}`);
    const formData = {
      file: null,
      jobId: null,
      candidateEmail: null,
    };

    for (const part of parts) {
      if (!part.trim() || part.includes('--')) continue;

      const headerEnd = part.indexOf('\r\n\r\n');
      const header = part.substring(0, headerEnd);
      const content = part.substring(headerEnd + 4, part.lastIndexOf('\r\n'));

      if (header.includes('name="resume"')) {
        const filenameMatch = header.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          formData.file = {
            buffer: Buffer.from(content, 'binary'),
            name: filenameMatch[1],
            size: Buffer.byteLength(content, 'binary'),
          };
        }
      } else if (header.includes('name="jobId"')) {
        formData.jobId = content.trim();
      } else if (header.includes('name="candidateEmail"')) {
        formData.candidateEmail = content.trim();
      }
    }

    return formData;
  } catch (error) {
    Logger.error('Error parsing multipart data:', error);
    throw new Error('Invalid form data format');
  }
};

/**
 * Upload file to S3 with optimized settings
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} resumeId - Resume ID
 * @returns {Promise<string>} - S3 key
 */
const uploadToS3 = async (fileBuffer, fileName, resumeId) => {
  try {
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const s3Key = `resumes/${resumeId}.${fileExtension}`;

    const params = {
      Bucket: process.env.RESUME_S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${fileName}"`,
      Metadata: {
        originalName: fileName,
        resumeId,
        uploadedAt: new Date().toISOString(),
      },
      // Optimized settings
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA', // Cost optimization for infrequently accessed files
    };

    await s3Client.send(new PutObjectCommand(params));
    Logger.log(`File uploaded to S3: ${s3Key}`);

    return s3Key;
  } catch (error) {
    Logger.error('Error uploading to S3:', error);
    throw error;
  }
};

/**
 * Store resume record in DynamoDB with TTL
 * @param {Object} resumeData - Resume data
 * @returns {Promise<Object>} - Stored resume data
 */
const storeResumeRecord = async (resumeData) => {
  try {
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + (30 * 24 * 60 * 60); // 30 days TTL

    const params = {
      TableName: process.env.RESUMES_TABLE_NAME,
      Item: {
        id: resumeData.id,
        jobId: resumeData.jobId,
        candidateEmail: resumeData.candidateEmail,
        fileName: resumeData.fileName,
        s3Key: resumeData.s3Key,
        status: RESUME_STATUS.UPLOADED,
        uploadedAt: now.toISOString(),
        fileSize: resumeData.fileSize,
        ttl, // Auto-delete after 30 days
      },
    };

    await dynamoDb.send(new PutCommand(params));
    Logger.log(`Stored resume record: ${resumeData.id}`);

    return params.Item;
  } catch (error) {
    Logger.error('Error storing resume record:', error);
    throw error;
  }
};

/**
 * Validate file type and size with enhanced checks
 * @param {Object} file - File object
 * @returns {boolean} - Is valid
 */
const validateFile = (file) => {
  const allowedTypes = ['application/pdf'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  const minSize = 1024; // 1KB minimum

  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Only PDF files are allowed');
  }

  if (file.size > maxSize) {
    throw new Error('File size must be less than 10MB');
  }

  if (file.size < minSize) {
    throw new Error('File size must be at least 1KB');
  }

  // Check file header for PDF magic number
  const pdfHeader = file.buffer.toString('ascii', 0, 4);
  if (pdfHeader !== '%PDF') {
    throw new Error('Invalid PDF file format');
  }

  return true;
};

/**
 * Main resume upload handler
 */
export const main = handler(async (event) => {
  try {
    Logger.log('Resume upload request received', { event });

    // Determine content type
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    let formData;

    if (contentType.startsWith('application/json')) {
      // Handle JSON body
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (!body.file || !body.fileName || !body.jobId || !body.candidateEmail) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify({
            error: 'Missing required fields: file (base64), fileName, jobId, or candidateEmail',
          }),
        };
      }
      formData = {
        file: {
          buffer: Buffer.from(body.file, 'base64'),
          name: body.fileName,
          size: Buffer.from(body.file, 'base64').length,
        },
        jobId: body.jobId,
        candidateEmail: body.candidateEmail,
      };
    } else {
      // Parse multipart form data
      const body = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('binary')
        : event.body;
      const boundaryMatch = contentType.match(/boundary=([^;]+)/);

      if (!boundaryMatch) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
          },
          body: JSON.stringify({ error: 'Invalid content type' }),
        };
      }

      const boundary = boundaryMatch[1];
      formData = parseMultipartData(body, boundary);
    }

    // Validate required fields
    if (!formData.file || !formData.jobId || !formData.candidateEmail) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({
          error: 'Missing required fields: resume file, jobId, or candidateEmail',
        }),
      };
    }

    Logger.log('Resume datafwefewewfewfwe:', 'comes here');

    // Validate file
    const file = {
      mimetype: 'application/pdf',
      size: formData.file.size,
      buffer: formData.file.buffer,
    };
    validateFile(file);

    Logger.log('Resume datafwefewewfewfwe:', 'comes here 2');

    // Generate resume ID
    const resumeId = uuidv4();

    // Upload file to S3
    const s3Key = await uploadToS3(formData.file.buffer, formData.file.name, resumeId);

    // Store resume record in DynamoDB
    const resumeData = {
      id: resumeId,
      jobId: formData.jobId,
      candidateEmail: formData.candidateEmail,
      fileName: formData.file.name,
      s3Key,
      fileSize: formData.file.size,
    };

    Logger.log('Resume datafwefewewfewfwe:', resumeData);

    await storeResumeRecord(resumeData);

    // Send to processing queue
    await sendResumeForProcessing({
      resumeId,
      jobId: formData.jobId,
      s3Key,
      candidateEmail: formData.candidateEmail,
    });

    Logger.log(`Resume uploaded successfully: ${resumeId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        message: 'Resume uploaded successfully',
        resumeId,
        status: 'processing',
      }),
    };
  } catch (error) {
    Logger.error('Resume upload handler error:', error);

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
