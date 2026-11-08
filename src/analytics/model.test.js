import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeParams } from './model.js';

test('safeParams lets through only known labels, never sums or personal data', () => {
    assert.deepEqual(safeParams({ kind: 'growth', provider: 'groq' }), { kind: 'growth', provider: 'groq' });
    assert.deepEqual(safeParams({ amount: 98287.49, email: 'a@b.c', mode: 'copy' }), { mode: 'copy' });
    assert.deepEqual(safeParams({ provider: 'my-secret-key' }), {});
    assert.deepEqual(safeParams(null), {});
});
