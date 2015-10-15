# multiple-redis

[![NPM Version](http://img.shields.io/npm/v/multiple-redis.svg?style=flat)](https://www.npmjs.org/package/multiple-redis) [![Build Status](https://travis-ci.org/sagiegurari/multiple-redis.svg)](http://travis-ci.org/sagiegurari/multiple-redis) [![Coverage Status](https://coveralls.io/repos/sagiegurari/multiple-redis/badge.svg)](https://coveralls.io/r/sagiegurari/multiple-redis) [![Code Climate](https://codeclimate.com/github/sagiegurari/multiple-redis/badges/gpa.svg)](https://codeclimate.com/github/sagiegurari/multiple-redis) [![bitHound Score](https://www.bithound.io/sagiegurari/multiple-redis/badges/score.svg)](https://www.bithound.io/sagiegurari/multiple-redis) [![Inline docs](http://inch-ci.org/github/sagiegurari/multiple-redis.svg?branch=master)](http://inch-ci.org/github/sagiegurari/multiple-redis)<br>
[![License](https://img.shields.io/npm/l/multiple-redis.svg?style=flat)](https://github.com/sagiegurari/multiple-redis/blob/master/LICENSE) [![Total Downloads](https://img.shields.io/npm/dt/multiple-redis.svg?style=flat)](https://www.npmjs.org/package/multiple-redis) [![Dependency Status](https://david-dm.org/sagiegurari/multiple-redis.svg)](https://david-dm.org/sagiegurari/multiple-redis) [![devDependency Status](https://david-dm.org/sagiegurari/multiple-redis/dev-status.svg)](https://david-dm.org/sagiegurari/multiple-redis#info=devDependencies)<br>
[![Retire Status](http://retire.insecurity.today/api/image?uri=https://raw.githubusercontent.com/sagiegurari/multiple-redis/master/package.json)](http://retire.insecurity.today/api/image?uri=https://raw.githubusercontent.com/sagiegurari/multiple-redis/master/package.json)

> Run redis commands against multiple redis instances.

* [Overview](#overview)
  * [Why?](#why)
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

<a name="why"></a>
### Why?
Generally in production you would like a failover capability for your redis server.<br>
Working with only 1 redis instance can cause your entire production system to fail in case redis goes down for any reason.<br>
For example, when using redis as an express session store and redis is down, users HTTP requests will be rejected.<br>
So how can we setup high availability?<br>
You could setup redis master and redis slave. That would have those 2 redis servers sync data between them and you can read it from both.<br>
But what if the master redis goes down? If you didn't setup the slave as writable, you are in a possible problem until the master is up.<br>
If you did, again there is an issue when master goes back up.<br>
Not to mention you have to setup a deployment installation process to set 1 redis for master and 1 for slave (well... at least one).
So one solution is to be able to change the master in runtime in such a scenario, so now you have a choice to deploy sentinal.<br>
But that is even more work on the production team and what if sentinal goes down? Who monitors the monitor?<br>
So another choice is to let the app code detect that the master is down and let it send the commands to select a new master from the existing slaves.<br>
But you have multiple instances of your app, and they can all try to select a new master and cause issues for your redis servers.<br>
So existing solutions don't work? Of course they do. But they are a pain to configure, manage and monitor in production.<br>
This is where this library comes in.<br>
What if you had multiple standalone redis servers that didn't know of each other?<br>
Your app ensures they are sync or at least it knows to pick up the data from the correct place.<br>
If one goes down, no problem. You are running with the redis servers that are still up and they too hold the data you need.<br>
**Important to explain, this does not mean that I do not support the Redis master/slave + sentinal solution** but sometimes using multiple
independent Redis servers serves as a better solution which is much more simple to deploy and manage in production. 

<a name="howlibworks"></a>
### How This Library Works
This library basically does 2 main things.
* Get commands - When a get (which does not modify data) command is called, the redis client will go redis by redis in a sequence until
it finds a redis which provides data for the get command.<br>
Any error, or any redis which is unable to provide the data is ignored.<br>
Once a specific redis provides the data, the next redis servers are skipped and the command callback is invoked with that data.
* Set/Other commands - When a non 'get' command is called, all redis servers are invoked in parallel with the same command to 
ensure that all redis servers are updated with latest data.<br>
If at least redis server was able to process the command, the original command callback will receive a valid response.<br>
This means that at least once redis server needs to work good for the main client to notify the calling code that everything works ok.<br>
To ensure you don't get outdated data, the redis servers should work without persistence to disk.<br>
So when a redis server goes back up, it is empty. But you still get the data from the other redis that was up and holds that data.<br>
When that key gets updated with new data, both redis servers are now holding the latest version.<br>
A side affect of this solution is that every publish event would be received multiple times by the subscribers, 
so you need to code accordingly and prevent any possible issues from handling duplicate published messages.

<a name="scenario"></a>
### Simple Scenario
Let us take the express redis session store as an example.<br>
Since this library provides the same redis interface as the common redis client, you can provide this library to the 
redis session store.<br>
When a new session is created, it will be created in all redis servers (in this example, lets assume we have 2).<br>
In case the first redis server suddenly fails, the session store is still able to fetch and update the session data from the
second redis server.<br>
When the first redis server comes back up, the session is still available to the session store from the second redis server and
any session modification (due to some HTTP request) will cause both redis servers to now hold the latest express session data.<br>
It is by no means, not a perfect solution, but it does has its advantages.<br>
First and foremost, its simple deployment requirements.

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
multiClient.set('string key', 'string val', callback);
```

Or

```js
//create the wrapper client with connection info
var MultipleRedis = require('multiple-redis');
var multiClient = MultipleRedis.createClient([{
    host: 'host1',
    port: 6379
}, {
   host: 'host2',
   port: 6379
}], options);

//run any command on the multi client instead of the original clients
multiClient.set('string key', 'string val', callback);
```
The rest of the API is the same as defined in the redis node library: https://github.com/NodeRedis/node_redis#api
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
| 2015-10-15  | v0.0.11 | Maintenance |
| 2015-09-23  | v0.0.7  | Upgrade to redis 2.0 |
| 2015-09-08  | v0.0.6  | Maintenance |
| 2015-09-03  | v0.0.3  | Added support for connected and server_info attributes. |
| 2015-09-03  | v0.0.2  | Initial release. |

<a name="license"></a>
## License
Developed by Sagie Gur-Ari and licensed under the Apache 2 open source license.
