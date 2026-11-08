import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotPosition, lastPoint } from './model.js';

test('lastPoint takes the current month (the last pair) of a polyline', () => {
    assert.deepEqual(lastPoint('0,12 50,4.5 100,20 '), [100, 20]);
    assert.deepEqual(lastPoint(' 0,31 '), [0, 31]);
    assert.equal(lastPoint(''), null);
    assert.equal(lastPoint('0,1 oops'), null);
});

test('dotPosition maps viewBox units to the drawn size, clamped to the chart', () => {
    assert.deepEqual(dotPosition([100, 16], { width: 100, height: 32 }, 32), { left: 100, top: 16 });
    assert.deepEqual(dotPosition([50, 8], { width: 100, height: 32 }, 64), { left: 50, top: 16 });
    assert.deepEqual(dotPosition([120, 0], { width: 100, height: 32 }, 32), { left: 100, top: 0 });
    assert.equal(dotPosition([1, 1], { width: 0, height: 32 }, 32), null);
});
