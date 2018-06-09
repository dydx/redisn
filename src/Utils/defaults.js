module.exports.Parser = {
  returnBuffers: false,
  stringNumbers: false,
};

module.exports.StandaloneConnection = {
  host: '127.0.0.1',
  port: 6379,
  connector: {
    autoConnect: true,
    proxyCommander: true,
  },
};
