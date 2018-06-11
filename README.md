# Redis Next

[![Coverage Status](https://coveralls.io/repos/github/Salakar/redisn/badge.svg?branch=master)](https://coveralls.io/github/Salakar/redisn?branch=master)
[![build](https://travis-ci.org/Salakar/redisn.svg)](https://travis-ci.org/Salakar/redisn)
[![npm version](https://img.shields.io/npm/v/redisn.svg)](https://www.npmjs.com/package/redisn)
[![License](https://img.shields.io/npm/l/redisn.svg)](/LICENSE)
<a href="https://twitter.com/mikediarmid"><img src="https://img.shields.io/twitter/follow/mikediarmid.svg?style=social&label=Follow" alt="Follow on Twitter"></a>

> A work in progress next generation of redis client for Node.js. A modern, ultra performant and feature rich implementation.

## Planned Features

### Connectors

 - [x] Standalone
 - [ ] Sentinel
 - [ ] Cluster
 - [ ] Need something custom? The standalone connector is built to be extended upon, both Sentinel and Cluster connectors extend from Standalone - so you can do the same for your custom connection / command routing logic.
 
### Prefixing

- [ ] String or Function key prefixing
- [ ] String or Function pubsub event prefixing

### Extensibility

- [ ] Build custom Hooks to extend/provide functionality
- [ ] Advanced custom LUA scripting functionality
- [ ] Human friendly PUBSUB, losely based on node's Event Emitter API

`Features list is WIP. Make an issue for any other features you'd like to see.`

## Install

```
$ yarn add redisn
```

## Usage

```js
const redisn = require('redisn');

// TODO
```

## Benchmarks

Benchmarks below are from early alpha code / experiments:

![screenshot](https://i.imgur.com/i3RfBih.png)

## License

[APACHE-2.0](./LICENSE)
