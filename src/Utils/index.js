export type PendingPromiseType = {
  promise: Promise<any>,
  resolve: (?any) => ?any,
  reject: (?any) => ?any,
};

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

module.exports.promisePending = promisePending;
