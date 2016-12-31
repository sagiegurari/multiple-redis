'use strict';

//load external modules
var events = require('events');
var util = require('util');
var debug = require('debuglog')('multiple-redis');
var redis = require('redis');
var redisCommands = require('redis-commands');
var asyncLib = require('async');

/**
 * Proxies requests to one or more redis clients.
 *
 * @author Sagie Gur-Ari
 * @class MultiRedisClient
 * @extends {EventEmitter}
 * @public
 * @param {Object} params - The client init params
 * @param {Array|redis} [params.clients] - The redis client/s (if not provided, the connection info must be provided instead)
 * @param {Array|Object} [params.connectionInfo] - The redis client/s connection info (if not provided, the redis clients must be provided)
 * @param {String} [params.connectionInfo.host] - The redis host
 * @param {Number} [params.connectionInfo.port] - The redis port
 * @param {Array} [params.options] - Used when this client creates the redis clients (see redis module for more details)
 * @param {Number} [params.options.childCommandTimeout=10000] - The per client command timeout
 * @param {Boolean} [params.options.mergeDuplicateEndpoints=true] - True to merge duplicate endpoint configurations and prevent needless redis client connections
 */
function MultiRedisClient(params) {
    var self = this;

    //call super constructor
    events.EventEmitter.call(self);

    var options = params.options || {};
    self.childCommandTimeout = options.childCommandTimeout || 10000;
    if (self.childCommandTimeout <= 0) {
        self.childCommandTimeout = 10000;
    }

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

    self.initClients(params, options);

    self.resetState();

    //proxy events
    self.setupEventProxy();

    self.setupStateChangeEvents();
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
 * Internal function to init the multiple redis clients used by this multi client.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @param {Object} params - The client init params
 * @param {Array} [options] - Used when this client creates the redis clients (see redis module for more details)
 */
MultiRedisClient.prototype.initClients = function (params, options) {
    var self = this;

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
};

/**
 * Internal function to setup the events proxy from the underlining clients.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 */
MultiRedisClient.prototype.setupEventProxy = function () {
    var self = this;

    [
        'ready',
        'connect',
        'reconnecting',
        'error',
        'end',
        'warning',
        'message',
        'pmessage',
        'message_buffer',
        'pmessage_buffer',
        'subscribe',
        'psubscribe',
        'unsubscribe',
        'punsubscribe'
    ].forEach(function createProxy(event) {
        self.clients.forEach(function onClientEvent(client) {
            client.on(event, function onEvent() {
                var argumentsArray = Array.prototype.slice.call(arguments, 0);
                argumentsArray.unshift(event);
                self.emit.apply(self, argumentsArray);
            });
        });
    });
};

/**
 * Internal function to listen to events which can change the client state.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 */
MultiRedisClient.prototype.setupStateChangeEvents = function () {
    var self = this;

    var onStateChange = function () {
        self.resetState();
    };

    [
        'connect',
        'ready',
        'error',
        'end'
    ].forEach(function addListener(eventName) {
        self.on(eventName, onStateChange);
    });
};

/**
 * Returns the connection info array without duplicates.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @param {Array} connectionInfo - The redis client/s connection info
 * @param {String} connectionInfo.host - The redis host
 * @param {Number} connectionInfo.port - The redis port
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
 * Creates and returns a handler function for the given command.
 *
 * @function
 * @memberof! MultiRedisClient
 * @alias MultiRedisClient.setupPrototype
 * @private
 * @param {String} command - The command to create a handler function for
 * @returns {function} The handler function
 */
function createCommandFunction(command) {
    var getCommand = ((command !== 'getset') && (command.indexOf('get') !== -1));

    return function invokeCommand(args, callback) {
        /*eslint-disable no-invalid-this*/
        var self = this;
        /*eslint-enable no-invalid-this*/

        if ((!Array.isArray(args)) || (typeof callback !== 'function')) {
            args = Array.prototype.slice.call(arguments, 0);
            if (args.length && (typeof args[args.length - 1] === 'function')) {
                callback = args.pop();
            } else {
                callback = null;
            }
        }

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
        self.clients.forEach(function runCommandForClient(client) {
            actions.push(function runRedisCommand(asyncCallback) {
                if (done) {
                    return asyncCallback();
                }

                var originalAsyncCallback = asyncCallback;
                var ignore = false;
                var timeoutID;

                /*eslint-disable func-name-matching*/
                asyncCallback = function onWrappedCallback(error, output) {
                    /*istanbul ignore else*/
                    if (timeoutID) {
                        clearTimeout(timeoutID);
                        timeoutID = null;
                    }

                    /*istanbul ignore else*/
                    if (!ignore) {
                        ignore = true;
                        originalAsyncCallback(error, output);
                        originalAsyncCallback = null;
                    }
                };
                /*eslint-enable func-name-matching*/

                timeoutID = setTimeout(function timeoutCommand() {
                    /*istanbul ignore else*/
                    if (!ignore) {
                        redisError = new Error('Timeout on running command.');

                        asyncCallback();
                    }
                }, self.childCommandTimeout);

                try {
                    /*jshint camelcase: false*/
                    //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                    /*eslint-disable camelcase*/
                    client.send_command(command, args, function onCommandEnd(error, output) {
                        if (error) {
                            debug('Error while redis command: %s, args: %s, ', command, args, error.stack);
                        }

                        /*istanbul ignore else*/
                        if (!ignore) {
                            /*istanbul ignore else*/
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
                    /*istanbul ignore else*/
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
}

/**
 * Adds all functions with proxy capabilities.
 *
 * @function
 * @memberof! MultiRedisClient
 * @alias MultiRedisClient.setupPrototype
 * @private
 */
function setupPrototype() {
    var commands = redisCommands.list;

    commands.forEach(function addCommandToPrototype(command) {
        MultiRedisClient.prototype[command] = createCommandFunction(command);

        MultiRedisClient.prototype[command.toUpperCase()] = MultiRedisClient.prototype[command];
    });
}

setupPrototype();

/**
 * Creates and returns a new MultiRedisClient instance.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @returns {MultiRedisClient} The multiple redis client instance
 */
function create() {
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

/*eslint-disable valid-jsdoc*/
module.exports = {
    /**
     * Creates and returns a new MultiRedisClient instance.
     *
     * @function
     * @memberof! MultiRedisClient
     * @public
     * @param {Array|redis} clients - The redis client/s
     * @param {Array} [options] - Various options
     * @param {Number} [options.childCommandTimeout=10000] - The per client command timeout
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
     * multiClient.once('ready', function onReady() {
     *   //run any command on the multi client instead of the original clients
     *   multiClient.set('string key', 'string val', callback);
     * });
     * ```
     *
     * @also
     *
     * @function
     * @memberof! MultiRedisClient
     * @public
     * @param {Array|Object} connectionInfo - The redis client/s connection info
     * @param {String} connectionInfo.host - The redis host
     * @param {Number} connectionInfo.port - The redis port
     * @param {Array} [options] - Used when this client creates the redis clients (see redis module for more details)
     * @param {Number} [options.childCommandTimeout=10000] - The per client command timeout
     * @param {Boolean} [options.mergeDuplicateEndpoints=true] - True to merge duplicate endpoint configurations and prevent needless redis client connections
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
     * multiClient.once('ready', function onReady() {
     *   //run any command on the multi client instead of the original clients
     *   multiClient.set('string key', 'string val', callback);
     * });
     * ```
     */
    createClient: create
};
/*eslint-enable valid-jsdoc*/
