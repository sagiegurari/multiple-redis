# multiple-redis

[![NPM Version](http://img.shields.io/npm/v/multiple-redis.svg?style=flat)](https://www.npmjs.org/package/multiple-redis) [![Build Status](https://img.shields.io/travis/sagiegurari/multiple-redis.svg?style=flat)](http://travis-ci.org/sagiegurari/multiple-redis) [![Coverage Status](https://img.shields.io/coveralls/sagiegurari/multiple-redis.svg?style=flat)](https://coveralls.io/r/sagiegurari/multiple-redis) [![Code Climate](https://codeclimate.com/github/sagiegurari/multiple-redis/badges/gpa.svg)](https://codeclimate.com/github/sagiegurari/multiple-redis) [![bitHound Score](https://www.bithound.io/sagiegurari/multiple-redis/badges/score.svg)](https://www.bithound.io/sagiegurari/multiple-redis) [![Inline docs](http://inch-ci.org/github/sagiegurari/multiple-redis.svg?branch=master)](http://inch-ci.org/github/sagiegurari/multiple-redis)<br>
[![License](https://img.shields.io/npm/l/multiple-redis.svg?style=flat)](https://github.com/sagiegurari/multiple-redis/blob/master/LICENSE) [![Dependencies](http://img.shields.io/david/sagiegurari/multiple-redis.svg?style=flat)](https://david-dm.org/sagiegurari/multiple-redis) [![devDependency Status](https://img.shields.io/david/dev/sagiegurari/multiple-redis.svg?style=flat)](https://david-dm.org/sagiegurari/multiple-redis#info=devDependencies)<br>
[![Retire Status](http://retire.insecurity.today/api/image?uri=https://raw.githubusercontent.com/sagiegurari/multiple-redis/master/package.json)](http://retire.insecurity.today/api/image?uri=https://raw.githubusercontent.com/sagiegurari/multiple-redis/master/package.json)

> Run redis commands against multiple redis instances.

* [Overview](#overview)
  * [When To Use](#whentouse)
  * [How This Library Works](#howlibworks)
  * [Simple Scenario](#scenario)
* [Usage](#usage)
* [Installation](#installation)
* [Limitations](#limitations)
* [API Documentation](docs/api.md)
* [Release History](#history)
* [License](#license)

<a name="overview"></a>
## Overview
This library enables to submit redis commands to multiple redis instances.<br>
The client interface is the same as the 'redis' node package at: https://github.com/NodeRedis/node_redis<br>
However, every command actually invokes multiple redis backends.

<a name="whentouse"></a>
### When To Use
Generally in production you would like a failover capability for your redis server.<br>
Working with only 1 redis instance can cause your entire production system to fail in case redis goes down for any reason.<br>
For example, when using redis as an express session store and redis is down, users HTTP requests will be rejected.<br>
Redis does come with a built in failover and clustering capabilities via master/slave solution and monitoring via redis sentinel.<br>
However, those solutions sometimes might cause other issues, for example, express redis works with only 1 redis client.<br>
If that redis client is not available, it will not failover to the slave redis.<br>
There are other libraries to resolve the issue, but the basic library does not provide any solution.<br>
Other issues might be if you failover to the slave redis but it is only readonly mode (by default slave redis is read only).<br>
<br>
**This does not mean that I do not support the Redis master/slave + sentinal solution** but sometimes using multiple<br>
independent Redis servers for none critical data serves as a better solution which is much more simple to deploy and manage in production. 

<a name="howlibworks"></a>
### How This Library Works
This library basically does 2 main things.
* Get commands - When a get (which does not modify data) command is called, the redis client will go redis by redis in a sequence until
it finds a redis which provides data for the get command.<br>
Any error, or any redis which is unable to provide the data is ignored.<br>
Once a specific redis provides the data, the next redis servers are skipped and the command callback is invoked with that data.
* Set/Other commands - When a non get command is called, all redis servers are invoked in parallel with the same command to 
ensure that all redis servers are updated.<br>
If any redis server was able to process the command, the original command callback will receive a valid response.<br>
<br>
This means that at least once redis server needs to work good for the main client to notify the calling code that everything works ok.
<br>
A side affect of this solution is that every publish event would be received multiple times by the subscribers, 
so you need to code accordingly and prevent any possible issues.

<a name="scenario"></a>
### Simple Scenario
Let us take the express redis session store as an example.<br>
Since this library provides the same redis interface as the common redis client, you can provide this library to the 
redis session store.<br>
When a new session is created, it will be created in all redis servers (in this example, lets assume we have 2).<br>
In case the first redis server suddenly fails, the session store is still able to fetch and update the session data from the
second redis server.<br>
When the first redis server comes back up, the session is still available to the session store from the second redis server and<br>
any session modification (due to some HTTP request) will cause both redis servers to now hold the latest express session data.
<br>
It is by no means, not a perfect solution, but it does has its advantages.<br>
First and formost, its simple deployment.

<a name="usage"></a>
## Usage
In order to use this library, you need to either create the redis clients or provide the redis connection data as follows:

```js
//create multiple redis clients
var redis = require('redis');
var client1 = redis.createClient(...);
var client2 = redis.createClient(...);

//create the wrapper client
var MultipleRedis = require('multiple-redis');
var multiClient = MultipleRedis.createClient([client1, client2]);

//run any command on the multi client instead of the original clients
multiClient.set("string key", "string val", callback);
```

Or

```js
//create the wrapper client with connection info
var MultipleRedis = require('multiple-redis');
var multiClient = MultipleRedis.createClient([{
    host: host1,
    port: 6379
}, {
   host: host2,
   port: 6379
}], options);

//run any command on the multi client instead of the original clients
multiClient.set("string key", "string val", callback);
```
<br>
The rest of the API is the same as defined in the redis node library.
<br>
<a name="installation"></a>
## Installation
In order to use this library, just run the following npm install command:

```sh
npm install --save multiple-redis
```

<a name="limitations"></a>
## Limitations
Not all of the original redis client attributes are available (for example: redis.debug_mode).<br>
Also Multi is currently not supported.

## API Documentation
See full docs at: [API Docs](docs/api.md)

<a name="history"></a>
## Release History

| Date        | Version | Description |
| ----------- | ------- | ----------- |
| 2015-09-03  | v0.0.2   | Initial release. |

<a name="license"></a>
## License
Developed by Sagie Gur-Ari and licensed under the Apache 2 open source license.
