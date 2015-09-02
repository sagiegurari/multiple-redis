'use strict';

//load external modules
var events = require('events');
var util = require('util');
var path = require('path');
var redis = require('redis');
var async = require('async');

/**
 * Proxies requests to one or more redis clients.
 *
 * @author Sagie Gur-Ari
 * @class MultiRedisClient
 * @extends {EventEmitter}
 * @public
 * @param {object} params - The client init params
 * @param {redis|Array} [params.clients] - The redis client/s (if not provided, the connection info must be provided instead)
 * @param {Array} [params.connectionInfo] - The redis client/s connection info (if not provided, the redis clients must be provided)
 * @param {string} [params.connectionInfo.host] - The redis host
 * @param {number} [params.connectionInfo.post] - The redis port
 * @param {Array} [params.options] - Used when this client creates the redis clients
 */
function MultiRedisClient(params) {
    var self = this;

    //call super constructor
    events.EventEmitter.call(self);

    if (params.clients) {
        if (Array.isArray(params.clients)) {
            self.clients = params.clients;
        } else {
            self.clients = [params.clients];
        }
    } else {
        var options = params.options || {};
        var connectionInfo = params.connectionInfo;
        if (!Array.isArray(connectionInfo)) {
            connectionInfo = [connectionInfo];
        }

        self.clients = [];
        connectionInfo.forEach(function createSingleClient(info) {
            self.clients.push(redis.createClient(info.port, info.host, options));
        });
    }

    //proxy events
    ['ready', 'connect', 'error', 'end', 'drain', 'idle', 'message', 'pmessage', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe'].forEach(function createProxy(event) {
        self.clients.forEach(function (client) {
            client.on(event, function onEvent() {
                var argumentsArray = Array.prototype.slice.call(arguments, 0);
                argumentsArray.unshift(event);
                self.emit.apply(self, argumentsArray);
            });
        });
    });
}

//setup MessageSocket as an event emitter
util.inherits(MultiRedisClient, events.EventEmitter);

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

                    try {
                        /*jshint camelcase: false*/
                        //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                        /*eslint-disable camelcase*/
                        client.send_command(command, args, function onCommandEnd(error, output) {
                            if (error) {
                                redisError = error;
                            } else if (output) {
                                if (getCommand) {
                                    done = true;
                                }
                                redisOutput = output;
                            }

                            asyncCallback(null, redisOutput);
                        });
                        /*eslint-enable camelcase*/
                        //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                        /*jshint camelcase: true*/
                    } catch (unhandledError) {
                        redisError = unhandledError;
                        asyncCallback();
                    }
                });
            });

            if (getCommand) {
                async.series(actions, onRedisFlowEnd);
            } else {
                async.parallel(actions, onRedisFlowEnd);
            }
        };

        MultiRedisClient.prototype[command.toUpperCase()] = MultiRedisClient.prototype[command];
    });
}

setupPrototype();

module.exports = {
    /**
     * Creates and returns a new MultiRedisClient instance.
     *
     * @function
     * @memberof! MultiRedisClient
     * @public
     * @param {redis|Array} clients - The redis client/s
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
     * @param {Array} connectionInfo - The redis client/s connection info
     * @param {string} connectionInfo.host - The redis host
     * @param {number} connectionInfo.post - The redis port
     * @param {Array} [options] - Used when this client creates the redis clients
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

        if (args.length === 2) {
            params.connectionInfo = args[0];
            params.options = args[1];
        } else if (args.length === 1) {
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
};
