const tls = require('tls');
const { Socket } = require('net');

const {
  merge,
  defaults,
  strings,
  eventSubscriptionWrapper,
  proxyThisAndThat,
} = require('./../Utils');

const Commander = require('./../Commander/Commander');

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

export type ConnectionStatusType =
  | STATUS_CONNECTED
  | STATUS_CONNECTING
  | STATUS_DISCONNECTED
  | STATUS_DISCONNECTING;

const Internals = new WeakMap();

/**
 * Handles all communication with a single redis server
 * this includes connecting, writing resp and parsing resp.
 *
 */
module.exports = class Standalone {
  constructor(options: StandaloneOptionsType = {}) {
    Internals.set(this, {
      eventSubscriptions: [],
      status: STATUS_DISCONNECTED,
    });

    // merge in default Standalone Connector options
    this.options = merge(defaults.StandaloneConnection, options);

    // allow specifying custom commander instance
    this.commander = options.commander;
    //  or create a new one if none provided
    if (!this.commander) {
      this.commander = new Commander();
      this.commander.setConnector(this);
    }

    // tls accepts an existing socket so we can
    // always just create one here in all cases
    this.socket = new Socket();

    // cheap re-use of socket event emitter
    this.on = eventSubscriptionWrapper(
      this.socket,
      this.socket.on.bind(this.socket),
    );

    this.once = eventSubscriptionWrapper(
      this.socket,
      this.socket.once.bind(this.socket),
    );

    this.emit = this.socket.emit.bind(this.socket);

    if (this.options.connector.autoConnect) {
      process.nextTick(this.connect);
    }

    if (this.options.connector.proxyCommander) {
      return proxyThisAndThat(this, this.commander);
    }
  }

  /**
   * Get current connection status
   */
  get status(): ConnectionStatusType {
    return Internals.get(this).status;
  }

  /**
   * Set and emit connection status
   * @param status
   */
  set status(status: ConnectionStatusType) {
    Internals.get(this).status = status;
    this.emit(this.status);
  }

  /**
   * Synchronous connect
   * @returns {*}
   */
  connect = () => {
    if (this.status === STATUS_CONNECTED || this.status === STATUS_CONNECTING) {
      throw new Error(ERROR_ALREADY_CONNECTED);
    }

    this._reset();
    this.socket.ref();
    this.status = STATUS_CONNECTING;

    Internals.get(this).eventSubscriptions.push(
      this.once('close', this._onClose),
    );
    Internals.get(this).eventSubscriptions.push(
      this.once('connect', this._onConnect),
    );

    if (this.options.tls) {
      tls.connect({ socket: this.socket, ...this.options });
    } else {
      this.socket.connect(this.options);
    }
  };

  /**
   *
   */
  disconnect = () => {
    this.socket.unref();
    this.socket.destroy();
    process.nextTick(this._reset);
    this.status = STATUS_DISCONNECTED;
  };

  /** --------------
   *     PRIVATE
   ** --------------
   */

  _onConnect = () => {
    if (this.status === STATUS_CONNECTING) {
      this.status = STATUS_CONNECTED;

      Internals.get(this).eventSubscriptions.push(
        this.socket.on('data', this.commander.execute.bind(this.commander)),
      );

      this.commander._writePipeline();
    }
  };

  _onClose = (error: Error) => {
    if (this.status === STATUS_DISCONNECTING) {
      this.status = STATUS_DISCONNECTED;
    } else {
      // TODO handle error logic & reconnect logic
      this.status = error ? 'error' : 'disconnected';
    }
  };

  _reset = () => {
    const { eventSubscriptions } = Internals.get(this);
    for (let i = 0; i < eventSubscriptions.length; i++) {
      eventSubscriptions[i]();
    }

    this.commander.reset();
  };
};
