// DynamoDB Table Names
export const tableNames = {
  jobsTable: `${process.env.STAGE || process.env.SERVERLESS_DATA_MODEL_STAGE || 'dev'}-jobs`,
  resumesTable: `${process.env.STAGE || process.env.SERVERLESS_DATA_MODEL_STAGE || 'dev'}-resumes`,
  matchScoresTable: `${process.env.STAGE || process.env.SERVERLESS_DATA_MODEL_STAGE || 'dev'}-match-scores`,
  processingQueueTable: `${process.env.STAGE || process.env.SERVERLESS_DATA_MODEL_STAGE || 'dev'}-processing-queue`,
};

// Processing status constants
export const PROCESSING_STATUS = {
  PENDING: 'PENDING',
  PARSING: 'PARSING',
  EXTRACTING_SKILLS: 'EXTRACTING_SKILLS',
  SCORING: 'SCORING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

// Resume status constants
export const RESUME_STATUS = {
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  SKILL_EXTRACTION: 'SKILL_EXTRACTION',
  SCORING: 'SCORING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

// SQS Queue URLs
export const SQS_QUEUES = {
  RESUME_PROCESSING_QUEUE_URL: process.env.RESUME_PROCESSING_QUEUE_URL,
  SKILL_EXTRACTION_QUEUE_URL: process.env.SKILL_EXTRACTION_QUEUE_URL,
  SCORING_QUEUE_URL: process.env.SCORING_QUEUE_URL,
};

// S3 Bucket
export const S3_BUCKETS = {
  RESUME_S3_BUCKET: process.env.RESUME_S3_BUCKET,
};

// MAX_DYNAMODB_ITEM_SIZE = 400 * 1024 (400 KB)
export const MAX_DYNAMODB_ITEM_SIZE = 350 * 1024; // 350 KB for safety as dynamodb does not allow size bigger than 400K

// Export all constants
export default {
  ...tableNames,
  PROCESSING_STATUS,
  RESUME_STATUS,
  SQS_QUEUES,
  S3_BUCKETS,
};
