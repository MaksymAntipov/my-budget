import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, describeError, pathOf } from './model.js';

describe('describeError', () => {
  it('keeps the message, the place and the stack, cut to size', () => {
    const report = describeError('error', {
      message: 'x is not defined',
      source: 'https://myskrynia.com.ua/assets/index-abc.js?userId=42',
      line: 10,
      column: 5,
      stack: 's'.repeat(5000),
    });

    assert.equal(report.message, 'x is not defined');
    assert.equal(report.source, '/assets/index-abc.js:10:5');
    assert.equal(report.stack.length, 1200);
  });

  it('drops noise and empty messages', () => {
    assert.equal(describeError('error', { message: 'Script error.' }), null);
    assert.equal(describeError('error', { message: 'ResizeObserver loop limit exceeded' }), null);
    assert.equal(describeError('promise', { message: 'AbortError: The user aborted a request.' }), null);
    assert.equal(describeError('promise', { message: '   ' }), null);
    assert.equal(describeError('promise', {}), null);
  });

  it('never keeps a query string', () => {
    assert.equal(pathOf('https://api.myskrynia.com.ua/api/data?userId=7d32'), '/api/data');
    assert.equal(pathOf('/assets/chunk.js'), '/assets/chunk.js');
  });
});

describe('createLimiter', () => {
  it('passes each error once and stops after the limit', () => {
    const allow = createLimiter(2);
    const a = { kind: 'error', message: 'a', source: '' };
    const b = { kind: 'error', message: 'b', source: '' };
    const c = { kind: 'error', message: 'c', source: '' };

    assert.deepEqual([allow(a), allow(a), allow(b), allow(c)], [true, false, true, false]);
  });
});
