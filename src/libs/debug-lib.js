import util from 'util';
import AWS from './awsWrapped';
import Logger from './logger';

// Log AWS SDK calls
// eslint-disable-next-line no-use-before-define
AWS.config.logger = { log: debug };

let logs;
let timeoutTimer;

export function flush(e) {
  logs.forEach(({ date, string }) => Logger.debug(date, string));
  Logger.error('FLUSH', e);
}

export default function debug() {
  if (typeof logs === 'object') {
    logs.push({
      date: new Date(),
      // eslint-disable-next-line prefer-rest-params
      string: util.format.apply(null, arguments),
    });
  }
}

/**
 * Initialize the custom debugger, logs all the event related information.
 * @param {object} event
 * @param {object} context
 */
export function init(event, context) {
  logs = [];

  // Log API event
  debug('API event', {
    body: event.body,
    pathParameters: event.pathParameters,
    queryStringParameters: event.queryStringParameters,
  });

  // Start timeout timer
  timeoutTimer = setTimeout(() => {
    if (timeoutTimer) {
      flush(new Error('Lambda will timeout in 100 ms'));
    }
  }, context.getRemainingTimeInMillis() - 100);
}

export function end() {
  // Clear timeout timer
  clearTimeout(timeoutTimer);
  timeoutTimer = null;
}
