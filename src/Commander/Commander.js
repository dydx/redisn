import type { PendingPromiseType } from './../Utils';

const Denque = require('denque');
const { promisePending } = require('./../Utils');

export type CommandQueueItemType = {
  cmd: string,
  args: Array,
  deferred: PendingPromiseType,
};

export type CommandQueueType = {
  shift: () => CommandQueueItemType | void,
  push: CommandQueueItemType => void,
};

class Commander {
  queue: CommandQueueType;
  pending: () => PendingPromiseType;

  constructor() {
    this.queue = new Denque();

    // TODO hide these
    this.returnReply = this._returnReply.bind(this);
    this.returnError = this._returnError.bind(this);
    this.returnFatalError = this._returnFatalError.bind(this);
  }

  /**
   * Handles parser errors.
   * @param error
   * @private
   */
  _returnError(error: Error) {
    this.queue.shift().deferred.reject(error);
  }

  /**
   * Handles parser replies.
   * @param reply
   * @private
   */
  _returnReply(reply: string | Array) {
    // TODO custom response parsers
    this.queue.shift().deferred.resolve(reply);
  }

  /**
   * Handles fatal parser errors.
   *
   * @param error
   * @private
   */
  _returnFatalError(error: Error) {
    // TODO clear queue and re-connect?
    this.queue.shift().deferred.reject(error);
  }
}

Object.assign(Commander.prototype, { pending: promisePending });
module.exports = Commander;
