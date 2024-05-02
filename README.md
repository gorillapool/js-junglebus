# [Gorilla Pool JungleBus: JS Client](https://www.npmjs.com/package/@GorillaPool/js-junglebus)

[![last commit](https://img.shields.io/github/last-commit/GorillaPool/js-junglebus.svg?style=flat&v=2)](https://github.com/GorillaPool/js-junglebus/commits/master)
[![version](https://img.shields.io/github/release-pre/GorillaPool/js-junglebus.svg?style=flat&v=2)](https://github.com/GorillaPool/js-junglebus/releases)
[![Npm](https://img.shields.io/npm/v/@GorillaPool/js-junglebus?style=flat&v=2)](https://www.npmjs.com/package/@GorillaPool/js-junglebus)
[![license](https://img.shields.io/badge/license-Open%20BSV-brightgreen.svg?style=flat&v=2)](/LICENSE)
[![Mergify Status](https://img.shields.io/endpoint.svg?url=https://api.mergify.com/v1/badges/GorillaPool/js-junglebus&style=flat&v=2)](https://mergify.io)
[![Sponsor](https://img.shields.io/badge/sponsor-GorillaPool-181717.svg?logo=github&style=flat&v=2)](https://github.com/sponsors/GorillaPool)

## Table of Contents
- [Gorilla Pool JungleBus: JS Client](#gorilla-pool-junglebus-js-client)
  - [Table of Contents](#table-of-contents)
  - [What is JungleBus?](#what-is-junglebus)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Lite Mode](#lite-mode)
  - [Documentation](#documentation)
  - [Code Standards](#code-standards)
  - [Contributing](#contributing)
    - [How can I help?](#how-can-i-help)
    - [Contributors ✨](#contributors-)
  - [License](#license)

<br />

## What is JungleBus?
[Read more about JungleBus](https://junglebus.gorillapool.io)

<br />

## Installation

Install the JungleBus library into your project:
```bash
$ npm install @gorillapool/js-junglebus
```

or, with yarn
```bash
$ yarn add @gorillapool/js-junglebus
```

## Usage
Here's the getting started with JungleBus

```javascript
import { JungleBusClient } from '@gorillapool/js-junglebus';

const server = "junglebus.gorillapool.io";
const jungleBusClient = new JungleBusClient(server, {
  onConnected(ctx) {
    // add your own code here
    console.log(ctx);
  },
  onConnecting(ctx) {
    // add your own code here
    console.log(ctx);
  },
  onDisconnected(ctx) {
    // add your own code here
    console.log(ctx);
  },
  onError(ctx) {
    // add your own code here
    console.error(ctx);
  }
});

// create subscriptions in the dashboard of the JungleBus website
const subId = "....";
const fromBlock = 750000;
const subscription = jungleBusClient.Subscribe(
  subId,
  fromBlock,
  onPublish(tx) => {
    // add your own code here
    console.log(tx);

  },
  onStatus(ctx) => {
    // add your own code here
    console.log(ctx);
  },
  onError(ctx) => {
    // add your own code here
    console.log(ctx);
  },
  onMempool(tx) => {
    // add your own code here
    console.log(tx);
  });
```

<br />

## Lite Mode
JungleBus also supports a lite mode, which delivers only the transaction hash and block height. This is useful for applications that only need to know when a transaction is included in a block.

To use lite mode, just pass true as a final argument to the Subscribe method.

```javascript
await client.Subscribe("a5e2fa655c41753331539a2a86546bf9335ff6d9b7a512dc9acddb00ab9985c0", 1550000, onPublish, onStatus, onError, onMempool, true);
```

## Documentation
View more [JungleBus documentation](https://junglebus.gorillapool.io/docs).

## Code Standards
Please read our [code standards document](.github/CODE_STANDARDS.md)

## Contributing
View the [contributing guidelines](.github/CONTRIBUTING.md) and follow the [code of conduct](.github/CODE_OF_CONDUCT.md).

### How can I help?
All kinds of contributions are welcome :raised_hands:!
The most basic way to show your support is to star :star2: the project, or to raise issues :speech_balloon:.
You can also support this project by [becoming a sponsor on GitHub](https://github.com/sponsors/GorillaPool) :clap:

[![Stars](https://img.shields.io/github/stars/GorillaPool/js-junglebus?label=Please%20like%20us&style=social&v=2)](https://github.com/GorillaPool/js-junglebus/stargazers)

<br/>

### Contributors ✨
Thank you to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/icellan"><img src="https://avatars.githubusercontent.com/u/4411176?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Siggi</b></sub></a><br /><a href="#infra-icellan" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/GorillaPool/js-junglebus/commits?author=icellan" title="Code">💻</a> <a href="#security-icellan" title="Security">🛡️</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

> This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification.


<br />

## License
[![License](https://img.shields.io/badge/license-Open%20BSV-brightgreen.svg?style=flat&v=2)](/LICENSE)
