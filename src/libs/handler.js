import Logger from './logger';

/**
 * handler - Simple Lambda wrapper for error handling and logging
 * @param {function} lambda - Lambda function
 * @returns {function} - Wrapped Lambda function
 */
export default function handler(lambda) {
  return async function (event, context) {
    try {
      Logger.log('Lambda execution started', {
        functionName: context?.functionName,
        requestId: context?.awsRequestId,
        eventType: event?.Records ? 'SQS' : 'HTTP',
      });

      // Execute the Lambda function
      const result = await lambda(event, context);

      Logger.log('Lambda execution completed successfully', {
        requestId: context?.awsRequestId,
        result: result?.statusCode ? 'HTTP Response' : 'SQS Response',
      });

      return result;
    } catch (error) {
      Logger.error('Lambda execution failed', {
        requestId: context?.awsRequestId,
        error: error.message,
        stack: error.stack,
      });

      // Re-throw the error to let AWS Lambda handle it
      throw error;
    }
  };
}
