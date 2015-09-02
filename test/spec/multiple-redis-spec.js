'use strict';
/*global describe: false, it: false */
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers

var chai = require('chai');
var assert = chai.assert;
var redis = require('redis');
var events = require('events');
var EventEmitter = events.EventEmitter;
var MultipleRedis = require('../../');

var noop = function () {
    return undefined;
};

var emmitter = new EventEmitter();
redis.createClient = function (port, host, options) {
    var redisClient = {
        on: noop
    };
    emmitter.emit('create', port, host, options, function (client) {
        redisClient = client;
    });

    return redisClient;
};

describe('MultipleRedis Tests', function () {
    describe('create tests', function () {
        it('no input', function () {
            try {
                MultipleRedis.createClient();
                assert.fail();
            } catch (error) {
                assert.isDefined(error);
            }
        });

        it('empty array', function () {
            try {
                MultipleRedis.createClient([]);
                assert.fail();
            } catch (error) {
                assert.isDefined(error);
            }
        });

        it('redis clients', function () {
            var client = MultipleRedis.createClient([{
                on: noop
            }, {
                on: noop
            }]);

            assert.equal(client.clients.length, 2);
        });

        it('redis client', function () {
            var client = MultipleRedis.createClient({
                on: noop
            });

            assert.equal(client.clients.length, 1);
        });

        it('connection info array', function () {
            var client = MultipleRedis.createClient([{
                host: 'localhost1',
                port: 1234
            }, {
                host: 'localhost2',
                port: 1234
            }]);

            assert.equal(client.clients.length, 2);
        });

        it('single connection info', function () {
            var client = MultipleRedis.createClient({
                host: 'localhost',
                port: 1234
            });

            assert.equal(client.clients.length, 1);
        });

        it('connection info array with options', function (done) {
            var count = 0;
            var validateCreate = function (port, host, options) {
                if ((port === 1234) && (host.indexOf('options') === 0)) {
                    assert.deepEqual(options, {
                        someoption: 123
                    });

                    count++;
                    if (count === 2) {
                        emmitter.removeListener('create', validateCreate);
                        done();
                    } else if (count > 2) {
                        assert.fail();
                    }
                }
            };

            emmitter.on('create', validateCreate);

            MultipleRedis.createClient([{
                host: 'options1',
                port: 1234
            }, {
                host: 'options12',
                port: 1234
            }], {
                someoption: 123
            });
        });

        it('single connection info', function (done) {
            var count = 0;
            var validateCreate = function (port, host, options) {
                if ((port === 1234) && (host === 'singleOption')) {
                    assert.deepEqual(options, {
                        someoption: 'abc'
                    });

                    count++;
                    if (count === 1) {
                        emmitter.removeListener('create', validateCreate);
                        done();
                    } else if (count > 1) {
                        assert.fail();
                    }
                }
            };

            emmitter.on('create', validateCreate);

            MultipleRedis.createClient({
                host: 'singleOption',
                port: 1234
            }, {
                someoption: 'abc'
            });
        });
    });

    describe('proxy events tests', function () {
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

                    done();
                });

                client2.emit('end', 'abc', {
                    key: 'value'
                });
            });

            client1.emit('connect', 1, 2, 'test');
        });
    });

    describe('command tests', function () {
        describe('set tests', function () {
            it('set valid', function (done) {
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

            it('set valid no callback', function () {
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

            it('set error', function (done) {
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

            it('set partial error', function (done) {
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
        });

        describe('get tests', function () {
            it('get valid', function (done) {
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

            it('get valid no callback', function () {
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

            it('get error', function (done) {
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

            it('get partial error', function (done) {
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
        });
    });
});
