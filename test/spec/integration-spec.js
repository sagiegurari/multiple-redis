'use strict';

const chai = require('chai');
const assert = chai.assert;
const path = require('path');
const events = require('events');
const EventEmitter = events.EventEmitter;
const childProcess = require('child_process');
const redis = require('redis');
const MultipleRedis = require('../../');

describe('Integration Tests', function () {
    const killRedisEnabled = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_KILL_ENABLED === 'true';

    const redis1Host = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_HOST1;
    let redis1Port = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PORT1;
    if (redis1Port) {
        redis1Port = parseInt(redis1Port, 10);
    } else {
        redis1Port = 6379;
    }

    const redis2Host = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_HOST2;
    let redis2Port = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PORT2;
    if (redis2Port) {
        redis2Port = parseInt(redis2Port, 10);
    } else {
        redis2Port = 6379;
    }

    const authPass = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_AUTH_PASS;
    const options = {
        forceNoMock: true
    };
    if (authPass) {
        options.auth_pass = authPass;
    }

    let redisPorts = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PORTS;
    if (redisPorts) {
        redisPorts = redisPorts.split(',');
    }

    if (redis1Host && redis1Port && redis2Host && redis2Port) {
        it('redis does not exist test', function (done) {
            this.timeout(5000);

            const redisClient = MultipleRedis.createClient([
                {
                    host: redis1Host,
                    port: redis1Port
                },
                {
                    host: redis2Host,
                    port: redis2Port
                }
            ], options);

            redisClient.once('connect', function () {
                setTimeout(function () {
                    assert.isTrue(redisClient.connected);

                    const key = 'TESTKEY:TEST1';
                    redisClient.set(key, 'test value', function onWrite(writeError) {
                        assert.isNull(writeError);

                        redisClient.expire(key, 100, function onExpireSet(expireError) {
                            assert.isNull(expireError);

                            redisClient.get(key, function onRead(readError, output) {
                                assert.isNull(readError);
                                assert.equal(output, 'test value');

                                redisClient.quit();

                                done();
                            });
                        });
                    });
                }, 500);
            });
        });
    }

    if (process.env.MULTIPLE_REDIS_TEST_INTEGRATION_CONF && killRedisEnabled && (redisPorts.length > 1)) {
        it('pub/sub - redis killed', function (done) {
            this.timeout(90000);

            const publisher = redis.createClient(redisPorts[0], 'localhost', options);

            publisher.on('error', function () {
                return undefined;
            });

            const connectionInfo = [];
            redisPorts.forEach(function (redisPort) {
                connectionInfo.push({
                    host: 'localhost',
                    port: parseInt(redisPort, 10)
                });
            });

            const redisClient = MultipleRedis.createClient(connectionInfo, options);

            redisClient.on('error', function () {
                return undefined;
            });

            redisClient.once('connect', function () {
                setTimeout(function () {
                    assert.isTrue(redisClient.connected);

                    redisClient.once('subscribe', function () {
                        redisClient.on('message', function (channel, message) {
                            if (channel === 'test') {
                                assert.isTrue(((message === '1') || (message === '2') || (message === 'end')));

                                if (message === 'end') {
                                    redisClient.removeAllListeners('message');

                                    publisher.quit();
                                    redisClient.quit();

                                    done();
                                }
                            }
                        });

                        publisher.publish('test', '1');

                        setTimeout(function () {
                            publisher.publish('test', '2');

                            setTimeout(function () {
                                childProcess.execFile(path.join(__dirname, '../helper/kill_redis.sh'), [
                                    redisPorts[0]
                                ], function (killError) {
                                    assert.isNull(killError);

                                    const emitter = new EventEmitter();

                                    let readyCount = 0;
                                    emitter.on('ready', function () {
                                        readyCount++;

                                        if (readyCount === 2) {
                                            emitter.removeAllListeners('ready');

                                            setTimeout(function () {
                                                publisher.publish('test', 'end');
                                            }, 250);
                                        }
                                    });

                                    publisher.once('connect', function () {
                                        emitter.emit('ready');
                                    });

                                    redisClient.once('subscribe', function () {
                                        emitter.emit('ready');
                                    });

                                    childProcess.execFile(path.join(__dirname, '../helper/start_redis.sh'), [
                                        redisPorts[0],
                                        process.env.MULTIPLE_REDIS_TEST_INTEGRATION_CONF
                                    ]);
                                });
                            }, 250);
                        }, 100);
                    });

                    redisClient.subscribe('test');
                }, 500);
            });
        });
    }
});
