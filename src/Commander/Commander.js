import type { PendingPromiseType } from './../Utils';

const Denque = require('denque');
const Parser = require('./../Parser/Parser');
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

class Commander extends Parser {
  queue: CommandQueueType;
  pending: () => PendingPromiseType;
  constructor() {
    super();
    this.queue = new Denque();
  }

  /**
   * Handles parser errors.
   * @param error
   * @private
   */
  returnError(error: Error) {
    this.queue.shift().deferred.reject(error);
  }

  /**
   * Handles parser replies.
   * @param reply
   * @private
   */
  returnReply(reply: string | Array) {
    // TODO custom response parsers
    this.queue.shift().deferred.resolve(reply);
  }

  /**
   * Handles fatal parser errors.
   *
   * @param error
   * @private
   */
  returnFatalError(error: Error) {
    // TODO clear queue and re-connect?
    this.queue.shift().deferred.reject(error);
  }
}

Object.assign(Commander.prototype, { pending: promisePending });
module.exports = Commander;
