import type { PendingPromiseType } from './../Utils';

const Denque = require('denque');
const toWritable = require('redis-writable');

const Parser = require('./../Parser/Parser');
const { promisePending, strings } = require('./../Utils');

const { STATUS_CONNECTED } = strings;

export type CommandQueueItemType = {
  cmd: string,
  args: Array,
  deferred: PendingPromiseType,
};

export type CommandQueueType = {
  shift: () => CommandQueueItemType | void,
  push: CommandQueueItemType => void,
};

const MAX_QUEUED = 120;
const MAX_BUFFER_SIZE = 4 * 1024 * 1024; // ~4 mb

class Commander extends Parser {
  _queue: CommandQueueType;
  _pending: () => PendingPromiseType;

  // TODO any options for commander or parser
  constructor() {
    super();
    this._connector = null;
    this._pipelineQueued = 0;
    this._pipelineBuffer = '';
    this._queue = new Denque();
    this._pipelineImmediate = null;
  }

  setConnector(connector: Object) {
    this._connector = connector;
  }

  /**
   * Reset commander to it's initial state
   *
   * @returns {undefined}
   */
  reset() {
    super.reset();
    this._pipelineBuffer = '';
    this._pipelineQueued = 0;
    clearImmediate(this._pipelineImmediate);
    this._pipelineImmediate = null;
  }

  /**
   *
   * @param cmd
   * @param args
   * @param forceWrite
   * @returns {string}
   */
  _write(cmd: string, args: Array, forceWrite: boolean = false) {
    this._pipelineBuffer += toWritable(cmd, args);

    this._pipelineQueued++;

    // _queue the write for the next event loop if this is the first command
    if (this._pipelineQueued < 2) {
      this._pipelineImmediate = setImmediate(this._writePipeline.bind(this));
    }

    // write pipeline if limits have been exceeded or this is a forced write
    if (
      forceWrite ||
      this._pipelineQueued > MAX_QUEUED ||
      this._pipelineBuffer.length > MAX_BUFFER_SIZE
    ) {
      clearImmediate(this._pipelineImmediate);
      this._writePipeline();
    }
  }

  /**
   * Writes the current pipeline buffer and resets.
   */
  _writePipeline() {
    if (this._connector && this._connector.status === STATUS_CONNECTED) {
      this._connector.socket.write(this._pipelineBuffer);
      this._pipelineBuffer = '';
      this._pipelineQueued = 0;
    }
  }

  /**
   * Handles parser errors.
   * @param error
   * @private
   */
  _returnError(error: Error) {
    this._queue.shift().deferred.reject(error);
  }

  /**
   * Handles parser replies.
   * @param reply
   * @private
   */
  _returnReply(reply: string | Array) {
    // TODO custom response parsers
    this._queue.shift().deferred.resolve(reply);
  }

  /**
   * Handles fatal parser errors.
   *
   * @param error
   * @private
   */
  _returnFatalError(error: Error) {
    // TODO clear _queue and re-connect?
    this._queue.shift().deferred.reject(error);
  }
}

Object.assign(Commander.prototype, { _pending: promisePending });
module.exports = Commander;
