// TODO; TBF
// eslint-disable-next-line no-promise-executor-return
const message = ({ time, ...rest }) => new Promise((resolve) => setTimeout(() => {
  resolve(`${rest.copy} (with a delay)`);
}, time * 1000));

const healthCheck = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    message: `Go Serverless v1.0! ${(await message({ time: 1, copy: 'Services are Up' }))}`,
  }),
});

export default healthCheck;
