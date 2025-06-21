import { WHITELISTED_ORIGINS } from '../../constants';
import Logger from '../../libs/logger';

const originCheck = (event) => {
  const { params: { header: { origin } } } = event;
  if ([WHITELISTED_ORIGINS].includes(origin)) return { statusCode: 200 };
  throw new Error('Unauthorized');
};

const websiteFormHandler = async (event) => {
  const {
    params: {
      path: { route },
    },
  } = event;
  Logger.log(event.params);

  switch (route) {
    case 'contactUs': {
      break;
    }
    case 'career': {
      break;
    }
    default:
      return {
        statusCode: 400,
        msg: 'Bad request',
      };
  }
};

const websiteFormHandlerWrapper = () => function (event) {
  return Promise.resolve()
    .then(() => originCheck(event))
    // Run the Lambda
    .then(async () => websiteFormHandler(event))
    // On failure
    .catch((e) => {
      // Print debug messages
      Logger.error('Error', e.message);
      return {
        statusCode: 500,
        error: e.message,
      };
    });
};

export const main = websiteFormHandlerWrapper();
