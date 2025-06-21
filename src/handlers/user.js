/* eslint-disable no-unused-vars */
import handler from '../libs/handler';
import dynamoDb from '../libs/dynamodb-lib';
import { USERS_TABLE_NAME } from '../constants/tableName.constants';
import Logger from '../libs/logger';

export const main = handler(async (event) => {
  const { httpMethod, params, constraints } = event;
  const method = '';
  let parameters;
  const activity = null;
  const { path } = params;
  const { querystring } = params;
  let response;
  // eslint-disable-next-line no-useless-catch
  try {
    const { operation } = querystring;

    switch (httpMethod) {
      case 'GET': {
        Logger.log('**QUERY STRING', querystring, path);
        // parameters = queryParams(USERS_TABLE_NAME, querystring);
        break;
      }
      case 'POST': {
        switch (operation) {
          case 'batchGet': {
            return;
          }
          case 'createUser': {
            return;
          }
          default: {
            throw new Error('Bad request');
          }
        }
      }
      default:
        break;
    }
    response = await dynamoDb[method](parameters);
    return response;
  } catch (error) {
    throw error;
  }
});
