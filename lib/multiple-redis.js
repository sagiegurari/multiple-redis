'use strict';

/**
 * Holds connection info configuration.
 *
 * @typedef {Object} ConnectionInfo
 * @param {String} host - The redis host
 * @param {Number} port - The redis port
 */

/**
 * This events is triggered when all redis clients are ready.
 *
 * @event all-ready
 */

//load external modules
var util = require('util');
var EventEmitterEnhancer = require('event-emitter-enhancer');
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
 * @param {redis[]|redis} [params.clients] - The redis client/s (if not provided, the connection info must be provided instead)
 * @param {ConnectionInfo[]|ConnectionInfo} [params.connectionInfo] - The redis client/s connection info (if not provided, the redis clients must be provided)
 * @param {Object} [params.options] - Used when this client creates the redis clients (see redis module for more details)
 * @param {Number} [params.options.childCommandTimeout=10000] - The per client command timeout
 * @param {Boolean} [params.options.mergeDuplicateEndpoints=true] - True to merge duplicate endpoint configurations and prevent needless redis client connections
 * @fires all-ready
 */
function MultiRedisClient(params) {
    var self = this;

    //call super constructor
    EventEmitterEnhancer.EnhancedEventEmitter.call(self);

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

//setup MultiRedisClient as an event emitter
util.inherits(MultiRedisClient, EventEmitterEnhancer.EnhancedEventEmitter);

/**
 * True when at least one internal redis client is connected.
 *
 * @member {Boolean}
 * @alias MultiRedisClient.connected
 * @memberof! MultiRedisClient
 * @public
 */
MultiRedisClient.prototype.connected = false;

/**
 * True when all internal redis clients are connected.
 *
 * @member {Boolean}
 * @alias MultiRedisClient.allConnected
 * @memberof! MultiRedisClient
 * @public
 */
MultiRedisClient.prototype.allConnected = false;

/*jshint camelcase: false*/
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
/*eslint-disable camelcase*/
/**
 * After the ready probe completes, the results from the INFO command are saved in this attribute.
 *
 * @member {Object}
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
 * @param {Object} [options] - Used when this client creates the redis clients (see redis module for more details)
 */
MultiRedisClient.prototype.initClients = function (params, options) {
    var self = this;

    if (params.clients) {
        if (Array.isArray(params.clients)) {
            self.clients = params.clients;
        } else {
            self.clients = [
                params.clients
            ];
        }
    } else {
        if (options.mergeDuplicateEndpoints === undefined) {
            options.mergeDuplicateEndpoints = true;
        }

        var connectionInfo = params.connectionInfo;
        if (!Array.isArray(connectionInfo)) {
            connectionInfo = [
                connectionInfo
            ];
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
    this.proxyEvents(this.clients, [
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
    ]);
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

    self.onAny([
        'connect',
        'error',
        'end'
    ], function runResetState() {
        self.resetState(false);
    });

    self.on('ready', function onReady() {
        self.resetState(true);
    });
};

/**
 * Returns the connection info array without duplicates.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @param {ConnectionInfo[]} connectionInfo - The redis client/s connection info
 * @returns {ConnectionInfo[]} The connection info array without duplicates
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
 * @param {Boolean} [readyEvent=false] - True if triggered due to ready event
 * @example
 * ```js
 * client.on('ready', function onReady() {
 *  client.resetState(true);
 * });
 * ```
 */
MultiRedisClient.prototype.resetState = function (readyEvent) {
    this.connected = false;

    var allConnected = true;
    var allReady = true;
    var index;
    for (index = 0; index < this.clients.length; index++) {
        if (this.clients[index].connected) {
            if (!this.connected) {
                /*jshint camelcase: false*/
                //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                /*eslint-disable camelcase*/
                this.server_info = this.clients[index].server_info;
                /*eslint-enable camelcase*/
                //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                /*jshint camelcase: true*/
            }

            this.connected = true;

            if (!this.clients[index].ready) {
                allReady = false;
            }
        } else {
            allConnected = false;
        }
    }

    this.allConnected = allConnected;

    if (readyEvent && this.allConnected && allReady) {
        this.emitAsync('all-ready');
    }
};

/**
 * Creates and returns a wrapper callback function for the command.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @param {function} callback - The original callback to wrap
 * @param {Object} globalState - holds global command state data
 * @param {Object} clientState - holds client invocation state data
 * @returns {function} The wrapper callback function
 * @example
 * ```js
 * var wrapperCallback = client.createCommandCallback(callback, globalState, clientState);
 * ```
 */
MultiRedisClient.prototype.createCommandCallback = function (callback, globalState, clientState) {
    var timeoutID;

    var onWrappedCallback = function (error, output) {
        if (timeoutID) {
            clearTimeout(timeoutID);
            timeoutID = null;
        }

        if (!clientState.ignore) {
            clientState.ignore = true;
            callback(error, output);
        }
    };

    timeoutID = setTimeout(function timeoutCommand() {
        if (!clientState.ignore) {
            globalState.redisError = new Error('Timeout on running command.');

            onWrappedCallback();
        }
    }, this.childCommandTimeout);

    return onWrappedCallback;
};

/**
 * Invokes the command for the provided client.
 *
 * @function
 * @memberof! MultiRedisClient
 * @private
 * @param {Object} input - The function input
 * @param {Object} input.client - Redis client
 * @param {String} input.command - The redis command (get/set/...)
 * @param {Array} input.args - Command arguments
 * @param {Boolean} input.getCommand - True for a 'get' command, else false
 * @param {Object} input.globalState - holds global command state data
 * @param {Object} input.clientState - holds client invocation state data
 * @param {function} input.callback - The callback function
 * @example
 * ```js
 * client.invokeCommandOnClient({
 *   client: client,
 *   command: 'get',
 *   args: ['my_key'],
 *   getCommand: true,
 *   clientState: clientState,
 *   globalState: globalState,
 *   callback: function (error, output) {
 *     //do something...
 *   }
 * });
 * ```
 */
MultiRedisClient.prototype.invokeCommandOnClient = function (input) {
    var client = input.client;
    var clientState = input.clientState;
    var globalState = input.globalState;
    var callback = input.callback;

    try {
        /*jshint camelcase: false*/
        //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
        /*eslint-disable camelcase*/
        client.send_command(input.command, input.args, function onCommandEnd(error, output) {
            if (error) {
                debug('Error while redis command: %s, args: %s, ', input.command, input.args, error.stack);
            } else {
                debug('Redis command: %s, args: %s, output: ', input.command, input.args, output);
            }

            if (!clientState.ignore) {
                if (error) {
                    globalState.redisError = error;
                } else if (output !== undefined) {
                    if (input.getCommand && output) {
                        globalState.done = true;
                    }

                    if ((globalState.redisOutput === undefined) || (globalState.redisOutput === null)) {
                        globalState.redisOutput = output;
                    }
                }

                callback(null, globalState.redisOutput);
            }
        });
        /*eslint-enable camelcase*/
        //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
        /*jshint camelcase: true*/
    } catch (unhandledError) {
        if (!clientState.ignore) {
            globalState.redisError = unhandledError;
            callback();
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
 * @example
 * ```js
 * MultiRedisClient.prototype.set = createCommandFunction('set');
 * ```
 */
function createCommandFunction(command) {
    var getCommand = ((command !== 'getset') && (command.indexOf('get') !== -1));
    var runInSequence = getCommand || (command.indexOf('setnx') !== -1);

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

        var globalState = {
            done: false
        };
        var onRedisFlowEnd = function onRedisFlowEnd() {
            if (callback) {
                if (globalState.redisOutput !== undefined) {
                    return callback(null, globalState.redisOutput);
                }

                return callback(globalState.redisError);
            }
        };

        var actions = [];
        self.clients.forEach(function runCommandForClient(client) {
            actions.push(function runRedisCommand(asyncCallback) {
                if (globalState.done) {
                    return asyncCallback();
                }

                var clientState = {
                    ignore: false
                };
                asyncCallback = self.createCommandCallback(asyncCallback, globalState, clientState);

                self.invokeCommandOnClient({
                    client: client,
                    command: command,
                    args: args,
                    getCommand: getCommand,
                    clientState: clientState,
                    globalState: globalState,
                    callback: asyncCallback
                });
            });
        });

        if (runInSequence) {
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
     * @param {redis[]|redis} clients - The redis client/s
     * @param {Object} [options] - Various options
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
     * multiClient.once('all-ready', function onReady() {
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
     * @param {ConnectionInfo[]|ConnectionInfo} connectionInfo - The redis client/s connection info
     * @param {Object} [options] - Used when this client creates the redis clients (see redis module for more details)
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
     * multiClient.once('all-ready', function onReady() {
     *   //run any command on the multi client instead of the original clients
     *   multiClient.set('string key', 'string val', callback);
     * });
     * ```
     */
    createClient: create
};
/*eslint-enable valid-jsdoc*/
