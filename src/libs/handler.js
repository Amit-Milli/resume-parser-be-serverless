/* eslint-disable no-unused-vars */
import * as debug from './debug-lib';
import { buildResponse } from './response-lib';
import { isObject, isArray } from './util';
// import { backgroundBulkSendNotification } from './stepFunction';
// import { BULK_OPERATION_TYPE } from '../constants/bulkOperations.constant';
import Logger from './logger';

/**
 * handler - Passes event through a sequence of operations like initialize debugger, logging, lambda function
 * @param  {function} lambda - Lambda function
 * @returns {object}
 */
export default function handler(lambda) {
  return function (event, context) {
    return Promise.resolve()
      // Start debugger
      .then(() => debug.init(event, context))
      // Run the Lambda
      .then(() => lambda(event, context))
      // On success
      .then(async (responseBody) => {
        Logger.log('RESPONSE SUCCESS', JSON.stringify(responseBody));
        if (isObject(responseBody) && !isArray(responseBody)) {
          const {
            activity, activities = null, webSocketEvents, overrideStateMachineArn, maxRetryCount, notifications = null,
          } = responseBody;
          if (isObject(activity) || (isArray(activities) && activities.length) || (isArray(webSocketEvents) && webSocketEvents.length)
            || (isArray(notifications) && notifications.length)) {
            Logger.log('ACTIVIT & NOTI', JSON.stringify(activities), JSON.stringify(notifications));
            // await backgroundBulkSendNotification({
            //   eventBody: {
            //     body: {
            //       activity, activities, notifications, webSocketEvents, maxRetryCount,
            //     },
            //     operation: BULK_OPERATION_TYPE.LOG_ACTIVITY_AND_FIRE_EVENTS,
            //   },
            //   overrideStateMachineArn,
            // });
            delete responseBody.webSocketEvents;
            delete responseBody.activities;
            delete responseBody.activity;
          }
        }
        return [200, { data: responseBody }];
      })
      // On failure
      .catch((e) => {
        // Print debug messages
        debug.flush(e);
        return [500, { error: e.message }];
      })
      // Return HTTP response
      .then(([statusCode, body]) => {
        const responseFormatter = body?.data?.responseFormatter || body?.error?.responseFormatter || buildResponse;
        statusCode = body?.data?.statusCode || body?.error?.statusCode || statusCode;
        return responseFormatter(statusCode, body);
      })
      // Cleanup debugger
      .finally(debug.end);
  };
}
