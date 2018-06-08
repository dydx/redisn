const tls = require('tls');
const { Socket } = require('net');
const toWritable = require('redis-writable');

const { merge, defaults, strings, proxyThisAndThat } = require('./../Utils');
const Commander = require('./../Commander/Commander');

const MAX_QUEUED = 120;
const MAX_BUFFER_SIZE = 4 * 1024 * 1024; // ~4 mb

const {
  STATUS_CONNECTED,
  STATUS_CONNECTING,
  STATUS_DISCONNECTED,
  STATUS_DISCONNECTING,
  ERROR_ALREADY_CONNECTED,
} = strings;

export type StandaloneOptionsType = {
  host: ?string,
  port: ?number,
  path: ?string,
  family: ?string,
  tls: ?{ [string]: any },
  commander: ?Commander,
};

/**
 * Handles all communication with a single redis server
 * this includes connecting, writing resp and parsing resp.
 *
 * Auto-pipelined
 */
module.exports = class Standalone {
  status:
    | STATUS_CONNECTED
    | STATUS_CONNECTING
    | STATUS_DISCONNECTED
    | STATUS_DISCONNECTING;

  constructor(options: StandaloneOptionsType = {}) {
    this.status = STATUS_DISCONNECTED;

    // merge in default Standalone Connector options
    this.options = merge(defaults.StandaloneConnection, options);

    // allow specifying customer commander instance or create a new one
    this.commander = this.options.commander || new Commander();

    // tls accepts an existing socket so we can
    // always just create one here in all cases
    this.socket = new Socket();

    // auto pipeline
    this.pipelineBuffer = '';
    this.pipelineQueued = 0;
    this.pipelineImmediate = null;

    // cheap re-use of socket event emitter
    this.on = this.socket.on.bind(this.socket);
    this.emit = this.socket.emit.bind(this.socket);
    this.once = this.socket.once.bind(this.socket);
    this.socket.on('data', this.commander.execute.bind(this.commander));

    if (this.options.connector.autoConnect) {
      process.nextTick(() => this.connect());
    }

    if (this.options.connector.proxyCommander) {
      return proxyThisAndThat(this, this.commander);
    }
  }

  /**
   * Synchronous connect
   * @returns {*}
   */
  connect() {
    if (this.status === STATUS_CONNECTED || this.status === STATUS_CONNECTING) {
      throw new Error(ERROR_ALREADY_CONNECTED);
    }

    this.status = STATUS_CONNECTING;
    this.emit(this.status);

    this.socket.once('close', this._onClose);
    this.socket.once('connect', this._onConnect);

    if (this.options.tls) {
      tls.connect({ socket: this.socket, ...this.options });
    } else {
      this.socket.connect(this.options);
    }
  }

  /**
   *
   */
  disconnect() {
    if (this.socket && this.status === STATUS_CONNECTED) {
      this.status = STATUS_DISCONNECTED;
      this.socket.end();
      this.emit(this.status);
    }
  }

  /**
   *
   * @param cmd
   * @param args
   * @param forceWrite
   * @returns {string}
   */
  write(cmd: string, args: Array, forceWrite: boolean = false) {
    this.pipelineBuffer += toWritable(cmd, args);

    this.pipelineQueued++;

    // queue the write for the next event loop if this is the first command
    if (this.pipelineQueued < 2) {
      this.pipelineImmediate = setImmediate(this.writePipeline.bind(this));
    }

    // write pipeline if limits have been exceeded or this is a forced write
    if (
      forceWrite ||
      this.pipelineQueued > MAX_QUEUED ||
      this.pipelineBuffer.length > MAX_BUFFER_SIZE
    ) {
      clearImmediate(this.pipelineImmediate);
      this.writePipeline();
    }
  }

  /**
   * Writes the current pipeline buffer and resets.
   */
  writePipeline() {
    if (this.status === 'connected') {
      this.socket.write(this.pipelineBuffer);
      this.pipelineBuffer = '';
      this.pipelineQueued = 0;
    }
  }

  _onConnect() {
    this.status = STATUS_CONNECTED;
    this.writePipeline();
    this.emit(this.status);
  }

  _onClose(error: Error) {
    if (this.status === STATUS_DISCONNECTING) {
      this.status = STATUS_DISCONNECTED;
    } else {
      // TODO handle error logic & reconnect logic
      this.status = error ? 'error' : 'disconnected';
    }

    this.emit(this.status);
  }
};
