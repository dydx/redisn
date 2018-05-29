const tls = require('tls');
const { Socket } = require('net');
const Parser = require('redis-parser');
const toWritable = require('redis-writable');

const Commander = require('./../Commander/Commander');

const MAX_BUFFER_SIZE = 4 * 1024 * 1024; // ~4 mb
const MAX_QUEUED = 120; // appears to be a good a number

const STATUS_CONNECTED = 'connected';
const STATUS_CONNECTING = 'connecting';
const STATUS_DISCONNECTED = 'disconnected';
const STATUS_DISCONNECTING = 'disconnecting';

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
 * Built in auto-pipelining
 */
class Standalone {
  status:
    | 'disconnected'
    | 'disconnecting'
    | 'connecting'
    | 'connected'
    | 'error';

  constructor(options: StandaloneOptionsType) {
    this.options = {};
    this.status = STATUS_DISCONNECTED;

    this.commander = options.commander || new Commander();

    // tls accepts an existing socket so
    // we can always just create one here
    this.socket = new Socket();

    // create a new RESP parser for this connection
    // we can parse it the commander instance as the options
    // because this already implements the required return
    // reply/error methods.
    this.parser = new Parser(this.commander);

    // auto pipeline
    this.pipelineBuffer = '';
    this.pipelineQueued = 0;
    this.pipelineImmediate = null;

    // cheap re-use of the sockets event emitter.
    this.on = this.socket.on.bind(this.socket);
    this.emit = this.socket.emit.bind(this.socket);
    this.once = this.socket.once.bind(this.socket);

    if (options.path) {
      this.options.path = options.path;
    } else {
      this.options.port = options.port;
      this.options.host = options.host;
      this.options.family = options.family;
    }

    if (options.tls) {
      Object.assign(this.options, { tls: options.tls });
      this.options.socket = this.socket;
    }
  }

  /**
   * Synchronous connect
   * @returns {*}
   */
  connect() {
    if (this.status === STATUS_CONNECTED || this.status === STATUS_CONNECTING) {
      throw new Error('Connector is already connecting or connected!');
    }

    this.status = STATUS_CONNECTING;

    this.once('close', this._onClose);
    this.once('connect', this._onConnect);
    // TODO connect timeout checks

    if (this.options.tls) {
      tls.connect(Object.assign({ socket: this.socket }, this.options));
    } else {
      this.socket.connect(this.options);
    }

    this.on('data', this.parser.execute.bind(this.parser));
  }

  /**
   *
   */
  disconnect() {
    if (this.socket && this.status === STATUS_CONNECTED) {
      this.status = STATUS_DISCONNECTED;
      this.socket.end();
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
    // writes any buffered commands
    this.writePipeline();
  }

  _onClose(error) {
    if (this.status === STATUS_DISCONNECTING) {
      this.status = STATUS_DISCONNECTED;
    } else {
      // TODO handle error logic & reconnect logic
      this.status = error ? 'error' : 'disconnected';
    }
  }
}

module.exports = Standalone;

// const redis = new StandaloneConnector({ host: '127.0.0.1', port: 6379 });
// redis.commander
//   .set('moo', 'bar')
//   .then(console.log)
//   .catch(console.error);
// redis.once('connect', r => {
//   console.log('connected', r);
// });
// // redis.once('error', (err) => {
// //   console.error(err);
// // });
// //
// // redis.connect();
// redis.commander
//   .set('moo', 'bar')
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .get('moo')
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .info()
//   .then(console.log)
//   .catch(console.error);

// redis.commander
//   .ping()
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .ping()
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .ping()
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .ping()
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .set('moo', 'bar')
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .set('moo', 'bar')
//   .then(console.log)
//   .catch(console.error);
// redis.commander
//   .set('moo', 'bar')
//   .then(console.log)
//   .catch(console.error);

// redis.connect();
