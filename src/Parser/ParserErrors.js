const assert = require('assert');

class RedisError extends Error {
  get name(): string {
    return this.constructor.name;
  }
}

class ParserError extends RedisError {
  constructor(message: string, buffer: Buffer, offset: number) {
    assert(buffer);
    assert.strictEqual(typeof offset, 'number');

    const tmp = Error.stackTraceLimit;
    Error.stackTraceLimit = 2;
    super(message);
    Error.stackTraceLimit = tmp;
    this.offset = offset;
    this.buffer = buffer;
  }

  get name(): string {
    return this.constructor.name;
  }
}

class ReplyError extends RedisError {
  constructor(message: string) {
    const tmp = Error.stackTraceLimit;
    Error.stackTraceLimit = 2;
    super(message);
    Error.stackTraceLimit = tmp;
  }
  get name() {
    return this.constructor.name;
  }
}

class AbortError extends RedisError {
  get name() {
    return this.constructor.name;
  }
}

class InterruptError extends AbortError {
  get name() {
    return this.constructor.name;
  }
}

module.exports = {
  RedisError,
  ParserError,
  ReplyError,
  AbortError,
  InterruptError,
};
