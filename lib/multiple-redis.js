'use strict';

//load external modules
var events = require('events');
var util = require('util');
var path = require('path');
var redis = require('redis');
var asyncLib = require('async');

/**
 * Proxies requests to one or more redis clients.
 *
 * @author Sagie Gur-Ari
 * @class MultiRedisClient
 * @extends {EventEmitter}
 * @public
 * @param {object} params - The client init params
 * @param {Array|redis} [params.clients] - The redis client/s (if not provided, the connection info must be provided instead)
 * @param {Array|object} [params.connectionInfo] - The redis client/s connection info (if not provided, the redis clients must be provided)
 * @param {string} [params.connectionInfo.host] - The redis host
 * @param {number} [params.connectionInfo.port] - The redis port
 * @param {Array} [params.options] - Used when this client creates the redis clients (see redis module for more details)
 * @param {number} [params.options.childCommandTimeout=1000] - The per client command timeout
 * @param {boolean} [params.options.mergeDuplicateEndpoints=true] - True to merge duplicate endpoint configurations and prevent needless redis client connections
 */
function MultiRedisClient(params) {
    var self = this;

    //call super constructor
    events.EventEmitter.call(self);

    var options = params.options || {};
    self.childCommandTimeout = Math.max(options.childCommandTimeout || 1000, 1);

    /*jshint camelcase: false*/
    //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
    /*eslint-disable camelcase*/
    //disable offline queue to prevent old data in redis clients from being sent
    if (options.enable_offline_queue === undefined) {
        options.enable_offline_queue = false;
    }
    /*eslint-enable camelcase*/
    //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
    /*jshint camelcase: true*/

    if (params.clients) {
        if (Array.isArray(params.clients)) {
            self.clients = params.clients;
        } else {
            self.clients = [params.clients];
        }
    } else {
        if (options.mergeDuplicateEndpoints === undefined) {
            options.mergeDuplicateEndpoints = true;
        }

        var connectionInfo = params.connectionInfo;
        if (!Array.isArray(connectionInfo)) {
            connectionInfo = [connectionInfo];
        } else if (options.mergeDuplicateEndpoints) {
            connectionInfo = self.getUniqueEndpoints(connectionInfo);
        }

        self.clients = [];
        connectionInfo.forEach(function createSingleClient(info) {
            self.clients.push(redis.createClient(info.port, info.host, options));
        });
    }

    self.resetState();

    //proxy events
    ['ready', 'connect', 'error', 'end', 'drain', 'idle', 'message', 'pmessage', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe'].forEach(function createProxy(event) {
        self.clients.forEach(function onClientEvent(client) {
            client.on(event, function onEvent() {
                var argumentsArray = Array.prototype.slice.call(arguments, 0);
                argumentsArray.unshift(event);
                self.emit.apply(self, argumentsArray);
            });
        });
    });

    var onStateChange = function () {
        self.resetState();
    };
    self.on('connect', onStateChange);
    self.on('ready', onStateChange);
    self.on('error', onStateChange);
    self.on('end', onStateChange);
}

//setup MessageSocket as an event emitter
util.inherits(MultiRedisClient, events.EventEmitter);

/**
 * True when at least one internal redis client is connected.
 *
 * @member {boolean}
 * @alias MultiRedisClient.connected
 * @memberof! MultiRedisClient
 * @public
 */
MultiRedisClient.prototype.connected = false;

/*jshint camelcase: false*/
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
/*eslint-disable camelcase*/
/**
 * After the ready probe completes, the results from the INFO command are saved in this attribute.
 *
 * @member {object}
 * @alias MultiRedisClient.server_info
 * @memberof! MultiRedisClient
 * @public
 */
MultiRedisClient.prototype.server_info = null;
/*eslint-enable camelcase*/
//jscs:enable requireCamelCaseOrUpperCaseIdentifiers
/*jshint camelcase: true*/

/**
 * Returns the connection info array without duplicates.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @param {Array} connectionInfo - The redis client/s connection info
 * @param {string} connectionInfo.host - The redis host
 * @param {number} connectionInfo.port - The redis port
 * @returns {Array} The connection info array without duplicates
 */
MultiRedisClient.prototype.getUniqueEndpoints = function (connectionInfo) {
    var endpoints = [];

    var keys = {};
    var index;
    var key;
    for (index = 0; index < connectionInfo.length; index++) {
        key = connectionInfo[index].host + '-' + connectionInfo[index].port;
        if (!keys[key]) {
            keys[key] = true;

            endpoints.push(connectionInfo[index]);
        }
    }

    return endpoints;
};

/**
 * Resets the redis attributes based on the status of the internal redis clients.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 */
MultiRedisClient.prototype.resetState = function () {
    this.connected = false;

    var index;
    for (index = 0; index < this.clients.length; index++) {
        if (this.clients[index].connected) {
            this.connected = true;

            /*jshint camelcase: false*/
            //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
            /*eslint-disable camelcase*/
            this.server_info = this.clients[index].server_info;
            /*eslint-enable camelcase*/
            //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
            /*jshint camelcase: true*/

            break;
        }
    }
};

/**
 * Adds all functions with proxy capabilities.
 *
 * @function
 * @memberof! MultiRedisClient
 * @alias MultiRedisClient.setupPrototype
 * @private
 */
function setupPrototype() {
    var redisJS = require.resolve('redis');
    var commandsFile = path.join(redisJS, '../lib/commands');
    var commands = require(commandsFile);

    commands.forEach(function (command) {
        MultiRedisClient.prototype[command] = function (args, callback) {
            var self = this;

            if ((!Array.isArray(args)) || (typeof callback !== 'function')) {
                args = Array.prototype.slice.call(arguments, 0);
                if (args.length && (typeof args[args.length - 1] === 'function')) {
                    callback = args.pop();
                } else {
                    callback = null;
                }
            }
            var getCommand = ((command !== 'getset') && (command.indexOf('get') !== -1));

            var redisOutput;
            var redisError;
            var onRedisFlowEnd = function onRedisFlowEnd() {
                if (callback) {
                    if (redisOutput) {
                        return callback(null, redisOutput);
                    }

                    return callback(redisError);
                }
            };

            var actions = [];
            var done = false;
            self.clients.forEach(function (client) {
                actions.push(function runRedisCommand(asyncCallback) {
                    if (done) {
                        return asyncCallback();
                    }

                    var originalAsyncCallback = asyncCallback;
                    var ignore = false;
                    var timeoutID;
                    asyncCallback = function onWrappedCallback(error, output) {
                        if (timeoutID) {
                            clearTimeout(timeoutID);
                            timeoutID = null;
                        }

                        if (!ignore) {
                            ignore = true;
                            originalAsyncCallback(error, output);
                            originalAsyncCallback = null;
                        }
                    };

                    timeoutID = setTimeout(function timeoutCommand() {
                        asyncCallback(new Error('Timeout on running command.'));
                    }, self.childCommandTimeout);

                    try {
                        /*jshint camelcase: false*/
                        //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                        /*eslint-disable camelcase*/
                        client.send_command(command, args, function onCommandEnd(error, output) {
                            if (!ignore) {
                                if (error) {
                                    redisError = error;
                                } else if (output) {
                                    if (getCommand) {
                                        done = true;
                                    }
                                    redisOutput = output;
                                }

                                asyncCallback(null, redisOutput);
                            }
                        });
                        /*eslint-enable camelcase*/
                        //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                        /*jshint camelcase: true*/
                    } catch (unhandledError) {
                        if (!ignore) {
                            redisError = unhandledError;
                            asyncCallback();
                        }
                    }
                });
            });

            if (getCommand) {
                asyncLib.series(actions, onRedisFlowEnd);
            } else {
                asyncLib.parallel(actions, onRedisFlowEnd);
            }
        };

        MultiRedisClient.prototype[command.toUpperCase()] = MultiRedisClient.prototype[command];
    });
}

setupPrototype();

module.exports = {
    /*eslint-disable valid-jsdoc*/
    /**
     * Creates and returns a new MultiRedisClient instance.
     *
     * @function
     * @memberof! MultiRedisClient
     * @public
     * @param {Array|redis} clients - The redis client/s
     * @param {Array} [options] - Various options
     * @param {number} [options.childCommandTimeout=1000] - The per client command timeout
     * @returns {MultiRedisClient} The multiple redis client instance
     * @example
     * ```js
     * //create multiple redis clients
     * var redis = require('redis');
     * var client1 = redis.createClient(...);
     * var client2 = redis.createClient(...);
     *
     * //create the wrapper client
     * var MultipleRedis = require('multiple-redis');
     * var multiClient = MultipleRedis.createClient([client1, client2]);
     *
     * //run any command on the multi client instead of the original clients
     * multiClient.set('string key', 'string val', callback);
     * ```
     *
     * @also
     *
     * @function
     * @memberof! MultiRedisClient
     * @public
     * @param {Array|object} connectionInfo - The redis client/s connection info
     * @param {string} connectionInfo.host - The redis host
     * @param {number} connectionInfo.port - The redis port
     * @param {Array} [options] - Used when this client creates the redis clients (see redis module for more details)
     * @param {number} [options.childCommandTimeout=1000] - The per client command timeout
     * @param {boolean} [options.mergeDuplicateEndpoints=true] - True to merge duplicate endpoint configurations and prevent needless redis client connections
     * @returns {MultiRedisClient} The multiple redis client instance
     * @example
     * ```js
     * //create the wrapper client with connection info
     * var MultipleRedis = require('multiple-redis');
     * var multiClient = MultipleRedis.createClient([{
     *   host: 'host1',
     *   port: 6379
     * }, {
     *   host: 'host2',
     *   port: 6379
     * }], options);
     *
     * //run any command on the multi client instead of the original clients
     * multiClient.set('string key', 'string val', callback);
     * ```
     */
    createClient: function createClient() {
        var args = Array.prototype.slice.call(arguments);

        var params = {};

        if (args.length > 2) {
            throw new Error('Wrong arguments count provided.');
        }

        if (args.length > 0) {
            if (args.length === 2) {
                params.options = args[1];
            }

            var arg = args[0];
            if (Array.isArray(arg)) {
                arg = arg[0];
            }

            if (arg.on && (typeof arg.on === 'function')) { //redis client extends event emitter
                params.clients = args[0];
            } else {
                params.connectionInfo = args[0];
            }
        } else {
            throw new Error('Redis clients/Connection info not provided.');
        }

        return new MultiRedisClient(params);
    }
    /*eslint-enable valid-jsdoc*/
};
