import AWS from './awsWrapped';
import Logger from './logger';

const sqs = new AWS.SQS({
  apiVersion: 'latest',
  region: process.env.AWS_REGION,
});

export const sendMessageInFifo = ({
  queueUrl, data, uniqueId, groupId,
}) => sqs.sendMessage({
  QueueUrl: queueUrl,
  // Any message data we want to send
  MessageBody: JSON.stringify({
    data,
    uniqueId,
  }),
  MessageDeduplicationId: uniqueId,
  MessageGroupId: groupId,
}).promise().catch((e) => Logger.error('Error ON SEND MESSAGE _', e));

export const sendMessageInStandardQueue = ({
  queueUrl, data, uniqueId,
}) => sqs.sendMessage({
  QueueUrl: queueUrl,
  // Any message data we want to send
  MessageBody: JSON.stringify({
    data,
    uniqueId,
  }),
}).promise().catch((e) => Logger.error('Error ON SEND MESSAGE _', e));

export const batchSendMessages = async ({ items, queueUrl }) => {
  const promises = [];
  for (let index = 0; index < items.length; index++) {
    const { data, uniqueId, groupId } = items[index];
    promises.push(sendMessageInStandardQueue({
      data,
      queueUrl,
      uniqueId,
      groupId,
    }));
  }
  return Promise.allSettled(promises);
};
