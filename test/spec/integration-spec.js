'use strict';
/*global describe: false, it: false */
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers

var chai = require('chai');
var assert = chai.assert;
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

    if (redis1Host && redis1Port && redis2Host && redis2Port) {
        it('redis does not exist test', function (done) {
            this.timeout(5000);

            var redis = MultipleRedis.createClient([{
                host: redis1Host,
                port: redis1Port
            }, {
                host: redis2Host,
                port: redis2Port
            }], options);

            redis.on('connect', function () {
                setTimeout(function () {
                    assert.isTrue(redis.connected);

                    var key = 'TESTKEY:TEST1';
                    redis.set(key, 'test value', function onWrite(writeError) {
                        assert.isNull(writeError);

                        redis.expire(key, 100, function onExpireSet(expireError) {
                            assert.isNull(expireError);

                            redis.get(key, function onRead(readError, output) {
                                assert.isNull(readError);
                                assert.equal(output, 'test value');

                                done();
                            });
                        });
                    });
                }, 500);
            });
        });
    }
});
