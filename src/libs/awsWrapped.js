import AWS from 'aws-sdk';
// import xray from 'aws-xray-sdk';

// Do not enable tracing for 'invoke local'
// const awsWrapped = process.env.stage === 'production' ? xray.captureAWS(AWS) : AWS;

// export default awsWrapped;

export default AWS;
