/* eslint-disable flowtype/require-parameter-type,no-shadow,no-param-reassign,prefer-destructuring,no-new */
/* eslint-env jest */
const assert = require('assert');
const { Buffer } = require('buffer');

const {
  ReplyError,
  RedisError,
  ParserError,
  AbortError,
  InterruptError,
} = require('./../../Parser/ParserErrors');

describe('errors', () => {
  const redisError = new RedisError('test');
  const replyError = new ReplyError('test');
  const parserError = new ParserError('test', Buffer.from('\r\nt+est\r\n'), 3);
  const abortError = new AbortError('test');
  const interruptError = new InterruptError('test');

  it('errors should have a stack trace with error message', () => {
    assert(redisError.stack);
    assert(replyError.stack);
    assert(parserError.stack);
    assert(abortError.stack);
    assert(interruptError.stack);
    assert(/RedisError: test/.test(redisError.stack));
    assert(/ReplyError: test/.test(replyError.stack));
    assert(/ParserError: test/.test(parserError.stack));
    assert(/AbortError: test/.test(abortError.stack));
    assert(/InterruptError: test/.test(interruptError.stack));
  });

  it('should properly inherit from each other', () => {
    assert(redisError instanceof Error);
    assert(replyError instanceof RedisError);
    assert(parserError instanceof RedisError);
    assert(abortError instanceof RedisError);
    assert(interruptError instanceof Error);
    assert(interruptError instanceof RedisError);
    assert(interruptError instanceof AbortError);
  });

  it('parser errors should contain properties', () => {
    assert(parserError.offset);
    assert(parserError.buffer);
  });

  it('first stack line should be the error itself', () => {
    assert(/at Suite/.test(redisError.stack.split('\n')[1]));
    assert(/at Suite/.test(replyError.stack.split('\n')[1]));
    assert(/at Suite/.test(parserError.stack.split('\n')[1]));
    assert(/at Suite/.test(abortError.stack.split('\n')[1]));
    assert(/at Suite/.test(interruptError.stack.split('\n')[1]));
  });
});
