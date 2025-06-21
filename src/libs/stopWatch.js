import Logger from './logger';

/**
 * Function - StopWatch function to log/debug the processing time
 * @example
 * const watch = new StopWatch();
 * watch.start();
 * watch.stop();
 */
const StopWatch = function () {
  this.startTime = 0;
  this.stopTime = 0;
  this.running = false;
};

StopWatch.prototype.currentTime = function () {
  return Date.now();
};

StopWatch.prototype.start = function () {
  this.startTime = this.currentTime();
  this.running = true;
};

StopWatch.prototype.stop = function () {
  this.stopTime = this.currentTime();
  this.running = false;
};

StopWatch.prototype.getElapsedMilliseconds = function () {
  if (this.running) {
    this.stopTime = this.currentTime();
  }

  return this.stopTime - this.startTime;
};

StopWatch.prototype.getElapsedSeconds = function () {
  return this.getElapsedMilliseconds() / 1000;
};

StopWatch.prototype.printElapsed = function (name) {
  const currentName = name || 'Elapsed:';

  Logger.log('stopwatch', currentName, `[${this.getElapsedMilliseconds()}ms]`, `[${this.getElapsedSeconds()}s]`);
};

export default StopWatch;
