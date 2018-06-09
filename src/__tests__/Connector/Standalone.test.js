/* eslint-env jest */

const StandaloneConnector = require('./../../Connector/Standalone');
const Commander = require('./../../Commander/Commander');

const DEFAULT_OPTIONS = { host: '127.0.0.1', port: 6379 };

describe('StandaloneConnector', () => {
  test('creates commander instance if none specified in options', () => {
    const redis = new StandaloneConnector(DEFAULT_OPTIONS);
    expect(redis.commander).toBeInstanceOf(Commander);
    redis.disconnect();
  });

  test('uses existing commander if provided in options', () => {
    const commander = new Commander();
    const redis = new StandaloneConnector({ ...DEFAULT_OPTIONS, commander });
    expect(redis.commander).toBe(commander);
    redis.disconnect();
  });

  test('is an event emitter', () => {
    const redis = new StandaloneConnector({ ...DEFAULT_OPTIONS });
    expect(typeof redis.on).toBe('function');
    expect(typeof redis.emit).toBe('function');
    expect(typeof redis.once).toBe('function');
    redis.disconnect();
  });

  test.skip('Queues commands prior to connecting', () => {
    const redis = new StandaloneConnector(DEFAULT_OPTIONS);
    redis.commander.set('moo', 'bar');
    redis.commander.set('moo', 'bar');
    redis.commander.get('moo');
    redis.commander.info();
    redis.commander.ping();
    redis.commander.ping();
    redis.commander.ping();
    redis.commander.ping();
    redis.commander.set('moo', 'bar');
    redis.commander.set('moo', 'bar');
    redis.commander.set('moo', 'bar');
    redis.connect();
  });
});
