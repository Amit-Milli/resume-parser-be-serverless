export const ERROR_CODE_NAME = {
  TWILIO_USAGE_TRANSACTION_FAILED: 'TWILIO_USAGE_TRANSACTION_FAILED',
};

export const ErrorObjectInstance = ({ code, name, message }) => {
  const err = new Error();
  err.code = code;
  err.name = name;
  err.message = message;
  return err;
};

export class CustomError extends Error {
  constructor(entityType = 'prospect', name = 'CustomError', retryable = true, ...params) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError);
    }

    this.name = name;
    // Custom debugging information
    this.entityType = entityType;
    this.date = new Date();
    this.retryable = retryable;
    this.code = '400';
  }
}

