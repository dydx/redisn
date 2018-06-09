const { EventEmitter } = require('events');
const { flatten, unflatten } = require('deeps');

const strings = require('./strings');
const defaults = require('./defaults');

export type PendingPromiseType = {
  promise: Promise<any>,
  resolve: (?any) => ?any,
  reject: (?any) => ?any,
};

/**
 * Equivalent to legacy Promise.pending() util
 */
function promisePending(): PendingPromiseType {
  const deferred = {};

  deferred.promise = new Promise(
    (resolve: (?any) => any, reject: (?any) => any) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    },
  );

  return deferred;
}

/**
 *
 * @param emitter
 * @param subscribeFn
 * @returns {function(string, Function): function(): *}
 */
function eventSubscriptionWrapper(
  emitter: EventEmitter,
  subscribeFn: Function,
) {
  return function wrapper(event: string, fn: Function) {
    subscribeFn(event, fn);
    return () => emitter.removeListener(event, fn);
  };
}

/**
 *
 * @param item
 * @returns {Object|boolean}
 */
function isObject(item: Object): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 *
 * @param target
 * @param source
 * @returns {*}
 */
function merge(target: Object = {}, source: Object = {}): Object {
  return unflatten(Object.assign({}, flatten(target), flatten(source)));
}

/**
 *
 * @param _this
 * @param _that
 * @returns {*}
 */
function proxyThisAndThat(_this: Object, _that: Object) {
  return new Proxy(_this, {
    get(target: Object, name: string) {
      if (name in target) {
        return target[name];
      }
      if (name in _that) {
        return _that[name];
      }
      return undefined;
    },
  });
}

module.exports = {
  merge,
  strings,
  defaults,
  promisePending,
  proxyThisAndThat,
  eventSubscriptionWrapper,
};
