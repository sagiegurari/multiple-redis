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
const util = require('util');
const EventEmitterEnhancer = require('event-emitter-enhancer');
const debug = require('debuglog')('multiple-redis');
const redis = require('redis');
const redisCommands = require('redis-commands');
const asyncLib = require('async');

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
 * @param {Boolean} [params.options.forceParallel=false] - Force parallel, even for get commands
 * @fires all-ready
 */
function MultiRedisClient(params) {
    const self = this;

    //call super constructor
    EventEmitterEnhancer.EnhancedEventEmitter.call(self);

    const options = params.options || {};
    self.childCommandTimeout = options.childCommandTimeout || 10000;
    if (self.childCommandTimeout <= 0) {
        self.childCommandTimeout = 10000;
    }

    self.forceParallel = options.forceParallel || false;

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
    const self = this;

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

        let connectionInfo = params.connectionInfo;
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
    const self = this;

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
    const endpoints = [];

    const keys = {};
    for (let index = 0; index < connectionInfo.length; index++) {
        const key = connectionInfo[index].host + '-' + connectionInfo[index].port;
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

    let allConnected = true;
    let allReady = true;
    for (let index = 0; index < this.clients.length; index++) {
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
 * const wrapperCallback = client.createCommandCallback(callback, globalState, clientState);
 * ```
 */
MultiRedisClient.prototype.createCommandCallback = function (callback, globalState, clientState) {
    let timeoutID;

    const onWrappedCallback = function (error, output) {
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
 *   callback: function(error, output) {
 *     //do something...
 *   }
 * });
 * ```
 */
MultiRedisClient.prototype.invokeCommandOnClient = function (input) {
    const client = input.client;
    const clientState = input.clientState;
    const globalState = input.globalState;
    const callback = input.callback;

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
 * Similar to race but stops on the first valid output.
 *
 * @function
 * @memberof! MultiRedisClient
 * @alias MultiRedisClient.parallelOnFirstValid
 * @private
 * @param {Array} actions - Functions array to invoke
 * @param {function} callback - Invoked on first valid output.
 */
function parallelOnFirstValid(actions, callback) {
    asyncLib.parallel(actions.map(function modifyAction(action) {
        return function onAction(cb) {
            action(function onActionDone(error, value) {
                if (value) {
                    cb(value);
                } else {
                    cb(null, error);
                }
            });
        };
    }), function onParallelDone(value, errors) {
        if (value) {
            callback(null, value);
        } else {
            callback(errors);
        }
    });
}

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
    const getCommand = ((command !== 'getset') && (command.indexOf('get') !== -1));
    const runInParallel = !getCommand && (command.indexOf('setnx') === -1);

    return function invokeCommand(args, callback) {
        /*eslint-disable no-invalid-this*/
        const self = this;
        /*eslint-enable no-invalid-this*/

        if ((!Array.isArray(args)) || (typeof callback !== 'function')) {
            args = Array.prototype.slice.call(arguments, 0);
            if (args.length && (typeof args[args.length - 1] === 'function')) {
                callback = args.pop();
            } else {
                callback = null;
            }
        }

        const globalState = {
            done: false
        };
        const onRedisFlowEnd = function onRedisFlowEnd() {
            if (callback) {
                if (globalState.redisOutput !== undefined) {
                    return callback(null, globalState.redisOutput);
                }

                return callback(globalState.redisError);
            }
        };

        const actions = [];
        self.clients.forEach(function runCommandForClient(client) {
            actions.push(function runRedisCommand(asyncCallback) {
                if (globalState.done) {
                    return asyncCallback();
                }

                const clientState = {
                    ignore: false
                };
                asyncCallback = self.createCommandCallback(asyncCallback, globalState, clientState);

                self.invokeCommandOnClient({
                    client,
                    command,
                    args,
                    getCommand,
                    clientState,
                    globalState,
                    callback: asyncCallback
                });
            });
        });

        if (runInParallel || self.forceParallel) {
            if (getCommand) {
                parallelOnFirstValid(actions, onRedisFlowEnd);
            } else {
                asyncLib.parallel(actions, onRedisFlowEnd);
            }
        } else {
            asyncLib.series(actions, onRedisFlowEnd);
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
    const commands = redisCommands.list;

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
    const args = Array.prototype.slice.call(arguments);

    const params = {};

    if (args.length > 2) {
        throw new Error('Wrong arguments count provided.');
    }

    if (args.length > 0) {
        if (args.length === 2) {
            params.options = args[1];
        }

        let arg = args[0];
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
     * @param {Object} [options] - constious options
     * @param {Number} [options.childCommandTimeout=10000] - The per client command timeout
     * @param {Boolean} [options.forceParallel=false] - Force parallel, even for get commands
     * @returns {MultiRedisClient} The multiple redis client instance
     * @example
     * ```js
     * //create multiple redis clients
     * const redis = require('redis');
     * const client1 = redis.createClient(...);
     * const client2 = redis.createClient(...);
     *
     * //create the wrapper client
     * const MultipleRedis = require('multiple-redis');
     * const multiClient = MultipleRedis.createClient([client1, client2]);
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
     * @param {Boolean} [options.forceParallel=false] - Force parallel, even for get commands
     * @returns {MultiRedisClient} The multiple redis client instance
     * @example
     * ```js
     * //create the wrapper client with connection info
     * const MultipleRedis = require('multiple-redis');
     * const multiClient = MultipleRedis.createClient([{
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
