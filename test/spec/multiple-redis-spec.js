'use strict';

/*global describe: false, it: false*/

var chai = require('chai');
var assert = chai.assert;
var redis = require('redis');
var events = require('events');
var EventEmitter = events.EventEmitter;
var MultipleRedis = require('../../');

var noop = function noop() {
    return undefined;
};

var emitter = new EventEmitter();
var baseCreate = redis.createClient;
var mockRedis = (process.env.MULTIPLE_REDIS_TEST_USE_REDIS !== 'true');

redis.createClient = function (port, host, options) {
    var redisClient;
    if ((options && options.forceNoMock) || ((!mockRedis) && (host === 'localhost') && (port === 6379) && options && (!options.mock))) {
        redisClient = baseCreate.call(redis, port, host, options);
    } else {
        redisClient = new EventEmitter();
    }

    emitter.emit('create', redisClient, port, host, options, function (client) {
        redisClient = client;
    });

    return redisClient;
};

describe('MultipleRedis', function () {
    describe('create', function () {
        it('no input', function () {
            var errorFound = false;

            try {
                MultipleRedis.createClient();
            } catch (error) {
                assert.isDefined(error);
                errorFound = true;
            }

            assert.isTrue(errorFound);
        });

        it('empty array', function () {
            var errorFound = false;

            try {
                MultipleRedis.createClient([]);
            } catch (error) {
                assert.isDefined(error);
                errorFound = true;
            }

            assert.isTrue(errorFound);
        });

        it('too many arguments', function () {
            var errorFound = false;

            try {
                MultipleRedis.createClient([
                    {
                        host: 'localhost1',
                        port: 1234
                    }
                ], {}, {});
            } catch (error) {
                assert.isDefined(error);
                errorFound = true;
            }

            assert.isTrue(errorFound);
        });

        it('redis clients', function () {
            var client = MultipleRedis.createClient([
                {
                    on: noop
                },
                {
                    on: noop
                }
            ]);

            assert.equal(client.clients.length, 2);
        });

        it('redis client', function () {
            var client = MultipleRedis.createClient({
                on: noop
            });

            assert.equal(client.clients.length, 1);
        });

        it('connection info array', function () {
            var client = MultipleRedis.createClient([
                {
                    host: 'localhost1',
                    port: 1234
                },
                {
                    host: 'localhost2',
                    port: 1234
                }
            ]);

            assert.equal(client.clients.length, 2);
        });

        it('connection info array with duplicates', function () {
            var client = MultipleRedis.createClient([
                {
                    host: 'localhost1',
                    port: 1234
                },
                {
                    host: 'localhost2',
                    port: 1234
                },
                {
                    host: 'localhost2',
                    port: 1234
                },
                {
                    host: 'localhost1',
                    port: 1234
                }
            ]);

            assert.equal(client.clients.length, 2);

            client.quit();
        });

        it('connection info array with duplicates no merge', function () {
            var client = MultipleRedis.createClient([
                {
                    host: 'localhost1',
                    port: 1234
                },
                {
                    host: 'localhost2',
                    port: 1234
                },
                {
                    host: 'localhost2',
                    port: 1234
                },
                {
                    host: 'localhost1',
                    port: 1234
                }
            ], {
                mergeDuplicateEndpoints: false
            });

            assert.equal(client.clients.length, 4);

            client.quit();
        });

        it('single connection info', function () {
            var client = MultipleRedis.createClient({
                host: 'localhost',
                port: 1234
            });

            assert.equal(client.clients.length, 1);

            client.quit();
        });

        it('connection info array with options', function (done) {
            var count = 0;
            var client;
            /*jslint unparam: true*/
            var validateCreate = function (redisClient, port, host, options) {
                if ((port === 1234) && (host.indexOf('options') === 0)) {
                    assert.deepEqual(options, {
                        enable_offline_queue: false,
                        someoption: 123,
                        mergeDuplicateEndpoints: true
                    });

                    count++;
                    if (count === 2) {
                        emitter.removeListener('create', validateCreate);

                        setTimeout(function () {
                            client.quit();
                            done();
                        }, 0);
                    } else if (count > 2) {
                        assert.fail();
                    }
                }
            };
            /*jslint unparam: false*/

            emitter.on('create', validateCreate);

            client = MultipleRedis.createClient([
                {
                    host: 'options1',
                    port: 1234
                },
                {
                    host: 'options12',
                    port: 1234
                }
            ], {
                someoption: 123
            });
        });

        it('empty options', function (done) {
            var client;

            /*jslint unparam: true*/
            var validateCreate = function (redisClient, port, host, options) {
                /*jshint camelcase: false*/
                //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                /*eslint-disable camelcase*/
                assert.isFalse(options.enable_offline_queue);
                /*eslint-enable camelcase*/
                //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                /*jshint camelcase: true*/

                emitter.removeListener('create', validateCreate);

                setTimeout(function () {
                    client.quit();
                    done();
                }, 0);
            };
            /*jslint unparam: false*/

            emitter.on('create', validateCreate);

            client = MultipleRedis.createClient({
                host: 'options1',
                port: 1234
            }, {});
        });

        it('enable_offline_queue option forced as true', function (done) {
            var client;

            /*jslint unparam: true*/
            var validateCreate = function (redisClient, port, host, options) {
                /*jshint camelcase: false*/
                //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                /*eslint-disable camelcase*/
                assert.isTrue(options.enable_offline_queue);
                /*eslint-enable camelcase*/
                //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                /*jshint camelcase: true*/

                emitter.removeListener('create', validateCreate);

                setTimeout(function () {
                    client.quit();
                    done();
                }, 0);
            };
            /*jslint unparam: false*/

            emitter.on('create', validateCreate);

            client = MultipleRedis.createClient({
                host: 'options1',
                port: 1234
            }, {
                enable_offline_queue: true
            });
        });

        it('client timeout option negative value', function () {
            var client = MultipleRedis.createClient({
                host: 'options1',
                port: 1234
            }, {
                childCommandTimeout: -10
            });

            assert.equal(client.childCommandTimeout, 10000);

            client.quit();
        });

        it('client timeout option samller than 10 seconds', function () {
            var client = MultipleRedis.createClient({
                host: 'options1',
                port: 1234
            }, {
                childCommandTimeout: 6
            });

            assert.equal(client.childCommandTimeout, 6);

            client.quit();
        });

        it('client timeout option bigger than 10 seconds', function () {
            var client = MultipleRedis.createClient({
                host: 'options1',
                port: 1234
            }, {
                childCommandTimeout: 20000
            });

            assert.equal(client.childCommandTimeout, 20000);

            client.quit();
        });

        it('single connection info', function (done) {
            var count = 0;
            var client;

            /*jslint unparam: true*/
            var validateCreate = function (redisClient, port, host, options) {
                if ((port === 1234) && (host === 'singleOption')) {
                    assert.deepEqual(options, {
                        enable_offline_queue: false,
                        someoption: 'abc',
                        mergeDuplicateEndpoints: true
                    });

                    count++;
                    if (count === 1) {
                        emitter.removeListener('create', validateCreate);

                        setTimeout(function () {
                            client.quit();
                            done();
                        }, 0);
                    } else if (count > 1) {
                        assert.fail();
                    }
                }
            };
            /*jslint unparam: false*/

            emitter.on('create', validateCreate);

            client = MultipleRedis.createClient({
                host: 'singleOption',
                port: 1234
            }, {
                someoption: 'abc'
            });
        });
    });

    describe('proxy events', function () {
        it('proxy multiple events', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();
            var client = MultipleRedis.createClient([client1, client2]);

            client.on('connect', function (e1Arg1, e1Arg2, e1Arg3) {
                assert.equal(e1Arg1, 1);
                assert.equal(e1Arg2, 2);
                assert.equal(e1Arg3, 'test');

                client.on('end', function (e2Arg1, e2Arg2) {
                    assert.equal(e2Arg1, 'abc');
                    assert.deepEqual(e2Arg2, {
                        key: 'value'
                    });

                    client.quit();
                    done();
                });

                client2.emit('end', 'abc', {
                    key: 'value'
                });
            });

            client1.emit('connect', 1, 2, 'test');
        });
    });

    describe('connect', function () {
        it('connect existing clients', function () {
            var client1 = new EventEmitter();
            client1.connected = false;
            client1.server_info = 'server1';
            var client2 = new EventEmitter();
            client2.connected = true;
            client2.server_info = 'server2';
            var client = MultipleRedis.createClient([client1, client2]);

            assert.isTrue(client.connected);
            assert.equal(client.server_info, 'server2');
        });

        it('connect existing not connected clients', function () {
            var client1 = new EventEmitter();
            client1.connected = false;
            client1.server_info = 'server1';
            var client2 = new EventEmitter();
            client2.connected = false;
            client2.server_info = 'server2';
            var client = MultipleRedis.createClient([client1, client2]);

            assert.isFalse(client.connected);
            assert.isNull(client.server_info);
        });

        it('connect via event', function (done) {
            var client1 = new EventEmitter();
            client1.connected = false;
            client1.server_info = 'server1';
            var client2 = new EventEmitter();
            client2.connected = false;
            client2.server_info = 'server2';
            var client = MultipleRedis.createClient([client1, client2]);

            assert.isFalse(client.connected);
            assert.isNull(client.server_info);

            var unbind = client.onAsync('connect', function () {
                assert.isTrue(client.connected);
                assert.equal(client.server_info, 'server1');

                unbind();

                client.onAsync('end', function () {
                    assert.isFalse(client.connected);
                    assert.equal(client.server_info, 'server1');

                    client.onAsync('connect', function () {
                        assert.isTrue(client.connected);
                        assert.equal(client.server_info, 'server2');

                        done();
                    });

                    client2.connected = true;
                    client2.emit('connect');
                });

                client1.connected = false;
                client1.emit('end');
            });

            client1.connected = true;
            client1.emit('connect');
        });

        it('connect for multiple proxy clients', function () {
            var client1 = new EventEmitter();
            client1.connected = false;
            client1.server_info = 'server1';
            var multipleClient1 = MultipleRedis.createClient(client1);

            var client2 = new EventEmitter();
            client2.connected = true;
            client2.server_info = 'server2';
            var multipleClient2 = MultipleRedis.createClient(client2);

            var client3 = new EventEmitter();
            client3.connected = true;
            client3.server_info = 'server3';
            var multipleClient3 = MultipleRedis.createClient(client3);

            assert.isFalse(multipleClient1.connected);
            assert.isNull(multipleClient1.server_info);

            assert.isTrue(multipleClient2.connected);
            assert.equal(multipleClient2.server_info, 'server2');

            assert.isTrue(multipleClient3.connected);
            assert.equal(multipleClient3.server_info, 'server3');
        });
    });

    describe('command', function () {
        describe('args', function () {
            it('more than 2 args with array', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, [['my key'], 'my value']);
                            assert.isFunction(callback);

                            callback(null, 'OK');
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.set(['my key'], 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'OK');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('args as array', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, 'OK');
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.set(['my key', 'my value'], function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'OK');
                    assert.equal(count, 2);

                    done();
                });
            });
        });

        describe('set', function () {
            it('valid', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, 'OK');
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.set('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'OK');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('valid no callback', function () {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, 'OK');
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.set('my key', 'my value');

                assert.equal(count, 2);
            });

            it('error', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(new Error());
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.set('my key', 'my value', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('partial error', function (done) {
                var count = 0;
                var createClient = function (valid) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            if (valid) {
                                callback(null, 'OK');
                            } else {
                                callback(new Error());
                            }
                        }
                    };
                };
                var client1 = createClient(true);
                var client2 = createClient(false);
                var client = MultipleRedis.createClient([client1, client2]);

                client.set('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'OK');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('set throw error', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function () {
                            count++;
                            throw new Error();
                        }
                    };
                };
                var client1 = createClient();
                var client = MultipleRedis.createClient(client1);

                client.set('my key', 'my value', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 1);

                    done();
                });
            });

            it('partial timeout', function (done) {
                var count = 0;
                var createClient = function (valid) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            if (valid) {
                                callback(null, 'OK');
                            }
                        }
                    };
                };
                var client1 = createClient(true);
                var client2 = createClient(false);
                var client = MultipleRedis.createClient([client1, client2], {
                    childCommandTimeout: 10
                });

                client.set('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'OK');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('full timeout', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'set');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2], {
                    childCommandTimeout: 10
                });

                client.set('my key', 'my value', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 2);

                    done();
                });
            });
        });

        describe('get', function () {
            it('valid', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            callback(null, 'my value');
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.get('my key', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'my value');
                    assert.equal(count, 1);

                    done();
                });
            });

            it('first only has data', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            if (count === 1) {
                                callback(null, 'my value');
                            } else {
                                callback(null, null);
                            }
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.get('my key', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'my value');
                    assert.equal(count, 1);

                    done();
                });
            });

            it('second only has data', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            if (count === 2) {
                                callback(null, 'my value');
                            } else {
                                callback(null, null);
                            }
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.get('my key', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'my value');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('valid no callback', function () {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            callback(null, 'my value');
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.get('my key');

                assert.equal(count, 1);
            });

            it('partial timeout', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            if (count > 1) {
                                callback(null, 'my value');
                            }
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2], {
                    childCommandTimeout: 10
                });

                client.get('my key', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'my value');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('full timeout', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2], {
                    childCommandTimeout: 10
                });

                client.get('my key', function (error) {
                    assert.isDefined(error);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('error', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            callback(new Error());
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.get('my key', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('partial error', function (done) {
                var count = 0;
                var createClient = function (valid) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            if (valid) {
                                callback(null, 'my value');
                            } else {
                                callback(new Error());
                            }
                        }
                    };
                };
                var client1 = createClient(false);
                var client2 = createClient(true);
                var client3 = createClient(true);
                var client = MultipleRedis.createClient([client1, client2, client3]);

                client.get('my key', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 'my value');
                    assert.equal(count, 2);

                    done();
                });
            });

            it('partial error and no output', function (done) {
                var createClient = function (valid) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            assert.equal(name, 'get');
                            assert.deepEqual(args, ['my key']);
                            assert.isFunction(callback);

                            if (valid) {
                                callback(null, null);
                            } else {
                                callback(new Error());
                            }
                        }
                    };
                };
                var client1 = createClient(false);
                var client2 = createClient(true);
                var client = MultipleRedis.createClient([client1, client2]);

                client.get('my key', function (error, response) {
                    assert.isNull(error);
                    assert.isNull(response);

                    done();
                });
            });
        });

        describe('set and get', function () {
            it('valid', function (done) {
                this.timeout(10000);

                if (mockRedis) {
                    /*jslint unparam: true*/
                    var modifyClient = function (redisClient, port, host, options) {
                        if ((host === 'localhost') && (port === 6379) && options && (!options.mock)) {
                            redisClient.send_command = function (name, args, callback) {
                                if (name === 'set') {
                                    redisClient[args[0]] = args[1];

                                    callback(undefined, 'OK');
                                } else if (name === 'get') {
                                    callback(undefined, redisClient[args[0]]);
                                } else {
                                    callback(new Error('Unsupported'));
                                }
                            };

                            process.nextTick(function () {
                                redisClient.emit('ready');
                            });
                        }
                    };
                    /*jslint unparam: false*/

                    emitter.on('create', modifyClient);

                    var orgDone = done;
                    done = function () {
                        emitter.removeListener('create', modifyClient);
                        orgDone();
                    };
                }

                var client = MultipleRedis.createClient([
                    {
                        host: 'localhost',
                        port: 6379
                    },
                    {
                        host: 'localhost',
                        port: 6379
                    }
                ], {
                    mergeDuplicateEndpoints: false,
                    mock: false
                });

                client.once('ready', function () {
                    client.set('my key', 'my value', function (error1, response1) {
                        if (error1) {
                            assert.fail();
                        }
                        assert.isDefined(response1);

                        setTimeout(function () {
                            client.get('my key', function (error2, response2) {
                                if (error2) {
                                    assert.fail();
                                }
                                assert.equal(response2, 'my value');

                                done();
                            });
                        }, 50);
                    });
                });
            });
        });

        describe('setnx', function () {
            it('valid', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, 1);
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 1);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('first is already set', function (done) {
                var count = 0;
                var createClient = function (response) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, response);
                        }
                    };
                };
                var client1 = createClient(0);
                var client2 = createClient(1);
                var client = MultipleRedis.createClient([client1, client2]);

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 0);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('second is already set', function (done) {
                var count = 0;
                var createClient = function (response) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, response);
                        }
                    };
                };
                var client1 = createClient(1);
                var client2 = createClient(0);
                var client = MultipleRedis.createClient([client1, client2]);

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 1);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('valid no callback', function () {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(null, 1);
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.setnx('my key', 'my value');

                assert.equal(count, 2);
            });

            it('error', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            callback(new Error());
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2]);

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('partial error', function (done) {
                var count = 0;
                var createClient = function (valid) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            if (valid) {
                                callback(null, 1);
                            } else {
                                callback(new Error());
                            }
                        }
                    };
                };
                var client1 = createClient(true);
                var client2 = createClient(false);
                var client = MultipleRedis.createClient([client1, client2]);

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 1);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('set throw error', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function () {
                            count++;
                            throw new Error();
                        }
                    };
                };
                var client1 = createClient();
                var client = MultipleRedis.createClient(client1);

                client.set('my key', 'my value', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 1);

                    done();
                });
            });

            it('partial timeout', function (done) {
                var count = 0;
                var createClient = function (valid) {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);

                            if (valid) {
                                callback(null, 1);
                            }
                        }
                    };
                };
                var client1 = createClient(true);
                var client2 = createClient(false);
                var client = MultipleRedis.createClient([client1, client2], {
                    childCommandTimeout: 10
                });

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isNull(error);
                    assert.equal(response, 1);
                    assert.equal(count, 2);

                    done();
                });
            });

            it('full timeout', function (done) {
                var count = 0;
                var createClient = function () {
                    return {
                        on: noop,
                        send_command: function (name, args, callback) {
                            count++;

                            assert.equal(name, 'setnx');
                            assert.deepEqual(args, ['my key', 'my value']);
                            assert.isFunction(callback);
                        }
                    };
                };
                var client1 = createClient();
                var client2 = createClient();
                var client = MultipleRedis.createClient([client1, client2], {
                    childCommandTimeout: 10
                });

                client.setnx('my key', 'my value', function (error, response) {
                    assert.isDefined(error);
                    assert.isUndefined(response);
                    assert.equal(count, 2);

                    done();
                });
            });
        });
    });

    describe('createCommandCallback', function () {
        it('timeout', function (done) {
            var client = MultipleRedis.createClient([
                {
                    on: noop
                }
            ], {
                childCommandTimeout: 10
            });

            var globalState = {};
            var clientState = {};

            var callback = client.createCommandCallback(function () {
                assert.isDefined(globalState.redisError);

                done();
            }, globalState, clientState);

            assert.isFunction(callback);
        });

        it('ignore timeout', function (done) {
            var client = MultipleRedis.createClient([
                {
                    on: noop
                }
            ], {
                childCommandTimeout: 10
            });

            var globalState = {};
            var clientState = {
                ignore: true
            };

            var callback = client.createCommandCallback(function () {
                assert.fail();
            }, globalState, clientState);

            assert.isFunction(callback);

            setTimeout(function () {
                assert.isUndefined(globalState.redisError);

                done();
            }, 20);
        });

        it('wrapper called twice', function () {
            var client = MultipleRedis.createClient([
                {
                    on: noop
                }
            ], {
                childCommandTimeout: 10
            });

            var globalState = {};
            var clientState = {};

            var called = false;
            var callback = client.createCommandCallback(function () {
                if (called) {
                    assert.fail();
                }
            }, globalState, clientState);

            callback(null, 1);

            callback(null, 2);

            assert.isTrue(clientState.ignore);
        });
    });

    describe('invokeCommandOnClient', function () {
        it('exception thrown', function (done) {
            var client = MultipleRedis.createClient([
                {
                    on: noop,
                    send_command: function () {
                        throw new Error('test');
                    }
                }
            ]);

            var globalState = {};

            client.invokeCommandOnClient({
                client: client.clients[0],
                getCommand: true,
                clientState: {},
                globalState: globalState,
                callback: function () {
                    assert.isDefined(globalState.redisError);
                    assert.strictEqual(globalState.redisError.message, 'test');

                    done();
                }
            });
        });

        it('ignore exception thrown', function (done) {
            var client = MultipleRedis.createClient([
                {
                    on: noop,
                    send_command: function () {
                        throw new Error('test');
                    }
                }
            ], {
                childCommandTimeout: 10
            });

            var clientState = {
                ignore: true
            };

            client.invokeCommandOnClient({
                client: client.clients[0],
                getCommand: true,
                clientState: clientState,
                globalState: {},
                callback: function () {
                    assert.fail();
                }
            });

            setTimeout(done, 20);
        });

        it('ignore output', function (done) {
            var client = MultipleRedis.createClient([
                {
                    on: noop,
                    send_command: function (name, args, callback) {
                        callback(null, 1);
                    }
                }
            ], {
                childCommandTimeout: 10
            });

            var clientState = {
                ignore: true
            };

            client.invokeCommandOnClient({
                client: client.clients[0],
                getCommand: true,
                clientState: clientState,
                globalState: {},
                callback: function () {
                    assert.fail();
                }
            });

            setTimeout(done, 20);
        });

        it('empty output', function (done) {
            var client = MultipleRedis.createClient([
                {
                    on: noop,
                    send_command: function (name, args, callback) {
                        callback();
                    }
                }
            ], {
                childCommandTimeout: 10
            });

            client.invokeCommandOnClient({
                client: client.clients[0],
                getCommand: true,
                clientState: {},
                globalState: {},
                callback: function (error) {
                    assert.isDefined(error);

                    done();
                }
            });
        });
    });

    describe('resetState', function () {
        it('all connected, ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = true;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', done);

            assert.isFalse(client.connected);

            client.resetState(true);

            assert.isTrue(client.connected);
            assert.isTrue(client.allConnected);
        });

        it('all connected but not ready, ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = true;

            client1.ready = true;
            client2.ready = false;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client.resetState(true);

            assert.isTrue(client.connected);
            assert.isTrue(client.allConnected);

            setTimeout(done, 50);
        });

        it('all connected, not a ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = true;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client.resetState();

            assert.isTrue(client.connected);
            assert.isTrue(client.allConnected);

            setTimeout(done, 50);
        });

        it('not all connected, ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = false;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client.resetState(true);

            assert.isTrue(client.connected);
            assert.isFalse(client.allConnected);

            setTimeout(done, 50);
        });

        it('not all connected, not a ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = false;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client.resetState();

            assert.isTrue(client.connected);
            assert.isFalse(client.allConnected);

            setTimeout(done, 50);
        });
    });

    describe('onready', function () {
        it('all connected, ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = true;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', done);

            assert.isFalse(client.connected);

            client1.emit('ready');

            assert.isTrue(client.connected);
            assert.isTrue(client.allConnected);
        });

        it('all connected but not ready, ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = true;

            client1.ready = true;
            client2.ready = false;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client1.emit('ready');

            assert.isTrue(client.connected);
            assert.isTrue(client.allConnected);

            setTimeout(done, 50);
        });

        it('not all connected, ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = false;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client1.emit('ready');

            assert.isTrue(client.connected);
            assert.isFalse(client.allConnected);

            setTimeout(done, 50);
        });
    });

    describe('onconnect', function () {
        it('all connected, not a ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = true;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client1.emit('connect');

            assert.isTrue(client.connected);
            assert.isTrue(client.allConnected);

            setTimeout(done, 50);
        });

        it('not all connected, not a ready event', function (done) {
            var client1 = new EventEmitter();
            var client2 = new EventEmitter();

            var client = MultipleRedis.createClient([
                client1,
                client2
            ]);

            client1.connected = true;
            client2.connected = false;

            client1.ready = true;
            client2.ready = true;

            client.once('all-ready', function () {
                assert.fail();
            });

            assert.isFalse(client.connected);

            client1.emit('connect');

            assert.isTrue(client.connected);
            assert.isFalse(client.allConnected);

            setTimeout(done, 50);
        });
    });
});
