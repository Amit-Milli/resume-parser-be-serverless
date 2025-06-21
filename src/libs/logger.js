/* eslint-disable no-console */
import { isLowerEnv } from '../constants';
// import { generateEncryptedObject } from "./util";
export default class Logger {
  static log(...params) {
    console.log(isLowerEnv ? params : params[0]);
  }

  static debug(...params) {
    console.debug(isLowerEnv ? params : params[0]);
  }

  static warn(...params) {
    console.warn(isLowerEnv ? params : params[0]);
  }

  static info(...params) {
    console.info(isLowerEnv ? params : params[0]);
  }

  static error(...params) {
    console.info('Error -', params);
    // console.info('Error -', isLowerEnv ? params : params[0]);
    // if (!isLowerEnv) {
    //   params.forEach(param => {
    //     console.warn(generateEncryptedObject(JSON.stringify(param, Object.getOwnPropertyNames(param))), '******');
    //   });
    // }
  }
}
