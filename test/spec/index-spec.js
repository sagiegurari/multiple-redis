'use strict';

var chai = require('chai');
var assert = chai.assert;
var MultipleRedis = require('../../');

describe('Index Tests', function () {
    it('create test', function () {
        assert.isFunction(MultipleRedis.createClient);
    });
});
