// // import { wait } from './batche.lib';
// import Logger from './logger';
// import StopWatch from './stopWatch';

// const QUEUE_ARRAYS = {
//   ACTIONS: 'actions',
//   FAILED_ACTIONS: 'failedActions',
// };

// export const getQueue = async ({ accountId, id = 'queue' }) => {
//   const gParams = getParams(CUSTOM_FIELDS_TABLE, { accountId, id });
//   return (await retryWithExponentialBackoffSingle({ dynamoOperation: 'get', funcPayload: gParams }))?.Item;
// };

// export const pushToQueue = async ({
//   accountId, action, pushToArray = QUEUE_ARRAYS.ACTIONS, queueId = 'queue',
// }) => {
//   Logger.log(`PUSHING TO QUEUE, ${accountId}, ${JSON.stringify(action)}`);
//   const uParams = updateParams(CUSTOM_FIELDS_TABLE, {}, { accountId, id: queueId });
//   uParams.UpdateExpression += ', #actions = list_append(#actions, :newItemList)';
//   uParams.ExpressionAttributeNames['#actions'] = pushToArray;
//   uParams.ExpressionAttributeValues[':newItemList'] = [action];
//   return (await retryWithExponentialBackoffSingle({ dynamoOperation: 'update', funcPayload: uParams }))?.Attributes;
// };

// export const removeFromQueue = async ({ accountId, /* actionId, */ id = 'queue' }) => {
//   const uParams = updateParams(CUSTOM_FIELDS_TABLE, {}, { accountId, id });
//   // Start TODO: For debugging purpose only. Remove later
//   // uParams.UpdateExpression += `, #debugQueue = list_append(#debugQueue, :newItemList)`;
//   // uParams.ExpressionAttributeNames['#debugQueue'] = 'debugQueue';
//   // uParams.ExpressionAttributeValues[':newItemList'] = [action];
//   // End TODO
//   uParams.UpdateExpression += ' REMOVE actions[0]';
//   // uParams.ConditionExpression += ' AND actions[0].id = :actionId';
//   // uParams.ExpressionAttributeValues[':actionId'] = actionId;
//   return (await retryWithExponentialBackoffSingle({
//     dynamoOperation: 'update',
//     funcPayload: uParams,
//     // ignoreConditionalException: true
//   }))?.Attributes;
// };

// export const markQueueAsActive = async ({
//   accountId, action, prevActionId, queueId = 'queue',
// }) => {
//   const uParams = updateParams(CUSTOM_FIELDS_TABLE, { activeActionId: action.id }, { accountId, id: queueId });
//   uParams.ConditionExpression += ' AND activeActionId = :actionId';
//   uParams.ExpressionAttributeValues[':actionId'] = prevActionId;
//   return (await retryWithExponentialBackoffSingle({ dynamoOperation: 'update', funcPayload: uParams }))?.Attributes;
// };

// export const markQueueAsFinished = async ({ accountId, queueId = 'queue' }) => {
//   const uParams = updateParams(CUSTOM_FIELDS_TABLE, { activeActionId: '' }, { accountId, id: queueId });
//   uParams.ConditionExpression += ' AND size(actions) = :actionsLength';
//   uParams.ExpressionAttributeValues[':actionsLength'] = 0;
//   return (await retryWithExponentialBackoffSingle({ dynamoOperation: 'update', funcPayload: uParams }))?.Attributes;
// };

// export const triggerQueueExecution = async ({
//   accountId, action, StateMachineArn, prevActionId = '', queueId = 'queue',
// }) => {
//   Logger.log(`Trigger queue execution, ${accountId}, ${queueId} ${JSON.stringify(action)}, ${prevActionId}, ${StateMachineArn}`);
//   // const stateMachine = action?.environments?.BULK_OPERATIONS_STATEMACHINE_ARN || BULK_OPERATIONS_STATEMACHINE_ARN || StateMachineArn;
//   try {
//     const { activeActionId, actions: [latestAc] } = await markQueueAsActive({
//       accountId, action, prevActionId, queueId,
//     });
//     Logger.log(`MARKED QUEUE ACTIVE - ${activeActionId}, ${JSON.stringify(latestAc)}`);
//     if (activeActionId !== latestAc?.id) {
//       Logger.error(`Error ActiveActionId doesnot match first action's id - ${activeActionId}-${latestAc}`);
//     }
//     // return backgroundOperations({
//     //   eventBody: { operation: BACKGROUND_OPERATION.EXECUTE_QUEUE_ACTIONS, body: { accountId, triggeredBy: activeActionId } },
//     //   stateMachineArn: stateMachine,
//     // });
//     return {};
//   } catch (error) {
//     if (error.code === 'ConditionalCheckFailedException') Logger.error(`Execution already in progress, ${prevActionId}, ${action?.id}`);
//     else throw error;
//   }
// };

// export const pushToQueueAndStartExecution = async ({ accountId, action, queueId = 'queue' }) => {
//   try {
//     const waitTime = Math.random() * 200;
//     // await wait(waitTime);
//     const watch = new StopWatch();
//     watch.start();
//     action.pushedAt = Date.now();
//     const { activeActionId, actions } = await pushToQueue({ accountId, action, queueId });
//     if (!activeActionId && actions.length) await triggerQueueExecution({ accountId, action: actions[0], queueId });
//     watch.stop();
//     Logger.log(`StopWatch queue waitTime - ${accountId} - ${watch.getElapsedMilliseconds()} - ${waitTime}`);
//   } catch (e) {
//     Logger.error('ERROR WHILE STARTING EXECUTION', e);
//     throw e;
//   }
// };

