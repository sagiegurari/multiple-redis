'use strict';

/*global describe: false, it: false*/

var chai = require('chai');
var assert = chai.assert;
var path = require('path');
var childProcess = require('child_process');
var redis = require('redis');
var MultipleRedis = require('../../');

describe('Integration Tests', function () {
    var redis1Host = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_HOST1;
    var redis1Port = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PORT1;
    if (redis1Port) {
        redis1Port = parseInt(redis1Port, 10);
    } else {
        redis1Port = 6379;
    }

    var redis2Host = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_HOST2;
    var redis2Port = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PORT2;
    if (redis2Port) {
        redis2Port = parseInt(redis2Port, 10);
    } else {
        redis2Port = 6379;
    }

    var authPass = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_AUTH_PASS;
    var options = {};
    if (authPass) {
        options.auth_pass = authPass;
    }

    var redisPorts = process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PORTS;
    if (redisPorts) {
        redisPorts = redisPorts.split(',');
    }

    if (redis1Host && redis1Port && redis2Host && redis2Port) {
        it('redis does not exist test', function (done) {
            this.timeout(5000);

            var redisClient = MultipleRedis.createClient([
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

                    var key = 'TESTKEY:TEST1';
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

    if ((process.env.MULTIPLE_REDIS_TEST_INTEGRATION_PUB_SUB === 'true') && process.env.MULTIPLE_REDIS_TEST_INTEGRATION_KILL_PORT && (redisPorts.length > 1)) {
        it('pub/sub - redis killed', function (done) {
            this.timeout(60000);

            var publisher = redis.createClient(redisPorts[0], 'localhost');

            var connectionInfo = [];
            redisPorts.forEach(function (redisPort) {
                connectionInfo.push({
                    host: 'localhost',
                    port: redisPort
                });
            });

            var redisClient = MultipleRedis.createClient(connectionInfo, options);

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
                                    process.env.MULTIPLE_REDIS_TEST_INTEGRATION_KILL_PORT
                                ], function (killError) {
                                    assert.isUndefined(killError);

                                    publisher.publish('test', 'end');
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
