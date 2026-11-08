import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStickyTop } from './model.js';

const VH = 900;
const M = 20;

test('a panel that fits the screen sticks at the margin whatever the scroll', () => {
    assert.equal(nextStickyTop(20, 300, 700, VH, M), 20);
    assert.equal(nextStickyTop(-100, -50, 700, VH, M), 20);
});

test('a tall panel moves up with the page until its bottom is in view, then holds', () => {
    // 1300px panel: lowest top = 900 - 1300 - 20 = -420
    assert.equal(nextStickyTop(20, 100, 1300, VH, M), -80);
    assert.equal(nextStickyTop(-80, 1000, 1300, VH, M), -420);
    assert.equal(nextStickyTop(-420, 200, 1300, VH, M), -420);
});

test('scrolling back up brings its top back, no further than the margin', () => {
    assert.equal(nextStickyTop(-420, -150, 1300, VH, M), -270);
    assert.equal(nextStickyTop(-270, -1000, 1300, VH, M), 20);
});

test('a missing current value starts from the margin', () => {
    assert.equal(nextStickyTop(undefined, 50, 1300, VH, M), -30);
});
