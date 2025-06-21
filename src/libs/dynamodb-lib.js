import AWS from './awsWrapped';
/**
 * DocumentClient -
 * The document client affords developers the use of native JavaScript types instead of
 * AttributeValues to simplify the JavaScript development experience with Amazon DynamoDB.
 * Reference - https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
 */
const client = new AWS.DynamoDB.DocumentClient({ region: process.env.region });

export default {
  get: (params) => client.get(params).promise(),
  put: (params) => client.put(params).promise(),
  query: (params) => client.query(params).promise(),
  update: (params) => client.update(params).promise(),
  delete: (params) => client.delete(params).promise(),
  list: (params) => client.scan(params).promise(),
  batchWrite: (params) => client.batchWrite(params).promise(),
  transactWrite: (params) => client.transactWrite(params).promise(),
  scan: (params) => client.scan(params).promise(),
  batchGet: (params) => client.batchGet(params).promise(),
};
