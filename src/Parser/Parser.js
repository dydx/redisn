/* eslint-disable no-param-reassign,block-scoped-var,no-var,vars-on-top,consistent-return,prefer-destructuring */

const { Buffer } = require('buffer');
const { StringDecoder } = require('string_decoder');

const { ReplyError, ParserError } = require('./ParserErrors');
const { defaults, merge } = require('./../Utils');

let counter = 0;
let interval = null;
let bufferOffset = 0;
let notDecreased = 0;
const decoder = new StringDecoder();
let bufferPool = Buffer.allocUnsafe(32 * 1024);

/**
 * Used for integer numbers only
 * @param {Parser} parser
 * @returns {undefined|number}
 */
function parseSimpleNumbers(parser: Parser) {
  const length = parser.buffer.length - 1;
  let offset = parser.offset;
  let number = 0;
  let sign = 1;

  if (parser.buffer[offset] === 45) {
    sign = -1;
    offset++;
  }

  while (offset < length) {
    const c1 = parser.buffer[offset++];
    if (c1 === 13) {
      // \r\n
      parser.offset = offset + 1;
      return sign * number;
    }
    number = number * 10 + (c1 - 48);
  }
}

/**
 * Used for integer numbers in case of the returnNumbers option
 *
 * Reading the string as parts of n SMI is more efficient than
 * using a string directly.
 *
 * @param {Parser} parser
 * @returns {undefined|string}
 */
function parseStringNumbers(parser: Parser) {
  const length = parser.buffer.length - 1;
  let offset = parser.offset;
  let number = 0;
  let res = '';

  if (parser.buffer[offset] === 45) {
    res += '-';
    offset++;
  }

  while (offset < length) {
    const c1 = parser.buffer[offset++];
    if (c1 === 13) {
      // \r\n
      parser.offset = offset + 1;
      if (number !== 0) {
        res += number;
      }
      return res;
    } else if (number > 429496728) {
      res += number * 10 + (c1 - 48);
      number = 0;
    } else if (c1 === 48 && number === 0) {
      res += 0;
    } else {
      number = number * 10 + (c1 - 48);
    }
  }
}

/**
 * Parse a '+' redis simple string response but forward the offsets
 * onto convertBufferRange to generate a string.
 * @param {Parser} parser
 * @returns {undefined|string|Buffer}
 */
function parseSimpleString(parser: Parser) {
  const start = parser.offset;
  const buffer = parser.buffer;
  const length = buffer.length - 1;
  let offset = start;

  while (offset < length) {
    if (buffer[offset++] === 13) {
      // \r\n
      parser.offset = offset + 1;
      if (parser.options.returnBuffers === true) {
        return parser.buffer.slice(start, offset - 1);
      }
      return parser.buffer.toString('utf8', start, offset - 1);
    }
  }
}

/**
 * Returns the read length
 * @param {Parser} parser
 * @returns {undefined|number}
 */
function parseLength(parser: Parser) {
  const length = parser.buffer.length - 1;
  let offset = parser.offset;
  let number = 0;

  while (offset < length) {
    const c1 = parser.buffer[offset++];
    if (c1 === 13) {
      parser.offset = offset + 1;
      return number;
    }
    number = number * 10 + (c1 - 48);
  }
}

/**
 * Parse a ':' redis integer response
 *
 * If stringNumbers is activated the parser always returns numbers as string
 * This is important for big numbers (number > Math.pow(2, 53)) as js numbers
 * are 64bit floating point numbers with reduced precision
 *
 * @param {Parser} parser
 * @returns {undefined|number|string}
 */
function parseInteger(parser: Parser) {
  if (parser.options.stringNumbers === true) {
    return parseStringNumbers(parser);
  }
  return parseSimpleNumbers(parser);
}

/**
 * Parse a '$' redis bulk string response
 * @param {Parser} parser
 * @returns {undefined|null|string}
 */
function parseBulkString(parser: Parser) {
  const length = parseLength(parser);
  if (length === undefined) {
    return;
  }
  if (length < 0) {
    return null;
  }
  const offset = parser.offset + length;
  if (offset + 2 > parser.buffer.length) {
    parser.bigStrSize = offset + 2;
    parser.totalChunkSize = parser.buffer.length;
    parser.bufferCache.push(parser.buffer);
    return;
  }
  const start = parser.offset;
  parser.offset = offset + 2;
  if (parser.options.returnBuffers === true) {
    return parser.buffer.slice(start, offset);
  }
  return parser.buffer.toString('utf8', start, offset);
}

/**
 * Parse a '-' redis error response
 * @param {Parser} parser
 * @returns {ReplyError}
 */
function parseError(parser: Parser) {
  let string = parseSimpleString(parser);
  if (string !== undefined) {
    if (parser.options.returnBuffers === true) {
      string = string.toString();
    }
    return new ReplyError(string);
  }
}

/**
 * Parsing error handler, resets parser buffer
 * @param {Parser} parser
 * @param {number} type
 * @returns {undefined}
 */
function handleError(parser: Parser, type: number) {
  const err = new ParserError(
    `Protocol error, got ${JSON.stringify(
      String.fromCharCode(type),
    )} as reply type byte`,
    JSON.stringify(parser.buffer),
    parser.offset,
  );
  parser.buffer = null;
  parser._returnFatalError(err);
}

/**
 * Parse a '*' redis array response
 * @param {Parser} parser
 * @returns {undefined|null|any[]}
 */
function parseArray(parser: Parser) {
  const length = parseLength(parser);
  if (length === undefined) {
    return;
  }
  if (length < 0) {
    return null;
  }
  const responses = new Array(length);
  return parseArrayElements(parser, responses, 0);
}

/**
 * Push a partly parsed array to the stack
 *
 * @param {Parser} parser
 * @param {any[]} array
 * @param {number} pos
 * @returns {undefined}
 */
function pushArrayCache(parser: Parser, array: string[], pos: number) {
  parser.arrayCache.push(array);
  parser.arrayPos.push(pos);
}

/**
 * Parse chunked redis array response
 * @param {Parser} parser
 * @returns {undefined|any[]}
 */
function parseArrayChunks(parser: Parser) {
  const arr = parser.arrayCache.pop();
  let pos = parser.arrayPos.pop();
  if (parser.arrayCache.length) {
    const res = parseArrayChunks(parser);
    if (res === undefined) {
      pushArrayCache(parser, arr, pos);
      return;
    }
    arr[pos++] = res;
  }
  return parseArrayElements(parser, arr, pos);
}

/**
 * Parse redis array response elements
 * @param {Parser} parser
 * @param {Array} responses
 * @param {number} i
 * @returns {undefined|null|any[]}
 */
function parseArrayElements(parser: Parser, responses: string[], i: number) {
  const bufferLength = parser.buffer.length;
  while (i < responses.length) {
    const offset = parser.offset;
    if (parser.offset >= bufferLength) {
      pushArrayCache(parser, responses, i);
      return;
    }
    const response = parseType(parser, parser.buffer[parser.offset++]);
    if (response === undefined) {
      if (!(parser.arrayCache.length || parser.bufferCache.length)) {
        parser.offset = offset;
      }
      pushArrayCache(parser, responses, i);
      return;
    }
    responses[i] = response;
    i++;
  }

  return responses;
}

/**
 * Called the appropriate parser for the specified type.
 *
 * 36: $
 * 43: +
 * 42: *
 * 58: :
 * 45: -
 *
 * @param {Parser} parser
 * @param {number} type
 * @returns {*}
 */
function parseType(parser: Parser, type: number) {
  switch (type) {
    case 36:
      return parseBulkString(parser);
    case 43:
      return parseSimpleString(parser);
    case 42:
      return parseArray(parser);
    case 58:
      return parseInteger(parser);
    case 45:
      return parseError(parser);
    default:
      return handleError(parser, type);
  }
}

/**
 * Decrease the bufferPool size over time
 *
 * Balance between increasing and decreasing the bufferPool.
 * Decrease the bufferPool by 10% by removing the first 10% of the current pool.
 * @returns {undefined}
 */
function decreaseBufferPool() {
  if (bufferPool.length > 50 * 1024) {
    if (counter === 1 || notDecreased > counter * 2) {
      const minSliceLen = Math.floor(bufferPool.length / 10);
      const sliceLength =
        minSliceLen < bufferOffset ? bufferOffset : minSliceLen;
      bufferOffset = 0;
      bufferPool = bufferPool.slice(sliceLength, bufferPool.length);
    } else {
      notDecreased++;
      counter--;
    }
  } else {
    clearInterval(interval);
    counter = 0;
    notDecreased = 0;
    interval = null;
  }
}

/**
 * Check if the requested size fits in the current bufferPool.
 * If it does not, reset and increase the bufferPool accordingly.
 *
 * @param {number} length
 * @returns {undefined}
 */
function resizeBuffer(length: number) {
  if (bufferPool.length < length + bufferOffset) {
    const multiplier = length > 1024 * 1024 * 75 ? 2 : 3;
    if (bufferOffset > 1024 * 1024 * 111) {
      bufferOffset = 1024 * 1024 * 50;
    }
    bufferPool = Buffer.allocUnsafe(length * multiplier + bufferOffset);
    bufferOffset = 0;
    counter++;
    if (interval === null) {
      interval = setInterval(decreaseBufferPool, 50);
    }
  }
}

/**
 * Concat a bulk string containing multiple chunks
 *
 * Notes:
 * 1) The first chunk might contain the whole bulk string including the \r
 * 2) We are only safe to fully add up elements that are neither the first nor any of the last two elements
 *
 * @param {Parser} parser
 * @returns {String}
 */
function concatBulkString(parser: Parser) {
  const list = parser.bufferCache;
  const oldOffset = parser.offset;
  let chunks = list.length;
  let offset = parser.bigStrSize - parser.totalChunkSize;
  parser.offset = offset;
  if (offset <= 2) {
    if (chunks === 2) {
      return list[0].toString('utf8', oldOffset, list[0].length + offset - 2);
    }
    chunks--;
    offset = list[list.length - 2].length + offset;
  }
  let res = decoder.write(list[0].slice(oldOffset));
  for (var i = 1; i < chunks - 1; i++) {
    res += decoder.write(list[i]);
  }
  res += decoder.end(list[i].slice(0, offset - 2));
  return res;
}

/**
 * Concat the collected chunks from parser.bufferCache.
 *
 * Increases the bufferPool size beforehand if necessary.
 *
 * @param {Parser} parser
 * @returns {Buffer}
 */
function concatBulkBuffer(parser: Parser) {
  const list = parser.bufferCache;
  const oldOffset = parser.offset;
  const length = parser.bigStrSize - oldOffset - 2;
  let chunks = list.length;
  let offset = parser.bigStrSize - parser.totalChunkSize;
  parser.offset = offset;
  if (offset <= 2) {
    if (chunks === 2) {
      return list[0].slice(oldOffset, list[0].length + offset - 2);
    }
    chunks--;
    offset = list[list.length - 2].length + offset;
  }
  resizeBuffer(length);
  const start = bufferOffset;
  list[0].copy(bufferPool, start, oldOffset, list[0].length);
  bufferOffset += list[0].length - oldOffset;
  for (var i = 1; i < chunks - 1; i++) {
    list[i].copy(bufferPool, bufferOffset);
    bufferOffset += list[i].length;
  }
  list[i].copy(bufferPool, bufferOffset, 0, offset - 2);
  bufferOffset += offset - 2;
  return bufferPool.slice(start, bufferOffset);
}

class Parser {
  /**
   * Javascript Redis Parser constructor
   * @constructor
   */
  constructor(options?: Object) {
    this.options = merge(defaults.Parser, options || {});
    this.reset();
  }

  /**
   * Reset the parser values to the initial state
   *
   * @returns {undefined}
   */
  reset() {
    this.offset = 0;
    this.buffer = null;
    this.bigStrSize = 0;
    this.totalChunkSize = 0;
    this.bufferCache = [];
    this.arrayCache = [];
    this.arrayPos = [];
    clearInterval(interval);
  }

  /**
   * Parse the redis buffer
   * @param {Buffer} buffer
   * @returns {undefined}
   */
  execute(buffer: Buffer) {
    if (this.buffer === null) {
      this.buffer = buffer;
      this.offset = 0;
    } else if (this.bigStrSize === 0) {
      const oldLength = this.buffer.length;
      const remainingLength = oldLength - this.offset;
      const newBuffer = Buffer.allocUnsafe(remainingLength + buffer.length);
      this.buffer.copy(newBuffer, 0, this.offset, oldLength);
      buffer.copy(newBuffer, remainingLength, 0, buffer.length);
      this.buffer = newBuffer;
      this.offset = 0;
      if (this.arrayCache.length) {
        const arr = parseArrayChunks(this);
        if (arr === undefined) {
          return;
        }
        this._returnReply(arr);
      }
    } else if (this.totalChunkSize + buffer.length >= this.bigStrSize) {
      this.bufferCache.push(buffer);
      let tmp = this.options.returnBuffers
        ? concatBulkBuffer(this)
        : concatBulkString(this);
      this.bigStrSize = 0;
      this.bufferCache = [];
      this.buffer = buffer;
      if (this.arrayCache.length) {
        this.arrayCache[0][this.arrayPos[0]++] = tmp;
        tmp = parseArrayChunks(this);
        if (tmp === undefined) {
          return;
        }
      }
      this._returnReply(tmp);
    } else {
      this.bufferCache.push(buffer);
      this.totalChunkSize += buffer.length;
      return;
    }

    while (this.offset < this.buffer.length) {
      const offset = this.offset;
      const type = this.buffer[this.offset++];
      const response = parseType(this, type);
      if (response === undefined) {
        if (!(this.arrayCache.length || this.bufferCache.length)) {
          this.offset = offset;
        }
        return;
      }

      if (type === 45) {
        this._returnError(response);
      } else {
        this._returnReply(response);
      }
    }

    this.buffer = null;
  }
}

module.exports = Parser;
