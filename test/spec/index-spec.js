'use strict';

const chai = require('chai');
const assert = chai.assert;
const MultipleRedis = require('../../');

describe('Index Tests', function () {
    it('create test', function () {
        assert.isFunction(MultipleRedis.createClient);
    });
});
