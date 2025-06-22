/* eslint-disable no-console */
export default class Logger {
  static log(...params) {
    console.log(...params);
  }

  static debug(...params) {
    console.debug(...params);
  }

  static warn(...params) {
    console.warn(...params);
  }

  static info(...params) {
    console.info(...params);
  }

  static error(...params) {
    console.error('Error -', ...params);
  }
}
