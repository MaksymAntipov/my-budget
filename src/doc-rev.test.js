import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { postDoc, readRev, writeRev } from './doc-rev.js';

const KEY = 'budget_test_rev_u1';
let store;
let requests;
let replies;

beforeEach(() => {
  store = new Map();
  requests = [];
  replies = [];
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  globalThis.fetch = async (url, init) => {
    requests.push(JSON.parse(init.body));
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
  };
});

describe('postDoc', () => {
  it('sends the stored revision and keeps the one the server returns', async () => {
    writeRev(KEY, 'r1');
    replies.push({ status: 200, body: { success: true, rev: 'r2' } });

    const result = await postDoc('/api/invest', { userId: 'u1', invest: {} }, KEY);

    assert.deepEqual(result, { ok: true });
    assert.equal(requests[0].baseRev, 'r1');
    assert.equal(readRev(KEY), 'r2');
  });

  it('sends no revision for a copy that never had one', async () => {
    replies.push({ status: 200, body: { success: true, rev: 'r1' } });

    await postDoc('/api/invest', { userId: 'u1' }, KEY);

    assert.equal('baseRev' in requests[0], false);
  });

  it('overlapping saves go in order, each on the revision of the previous one', async () => {
    writeRev(KEY, 'r1');
    replies.push({ status: 200, body: { rev: 'r2' } }, { status: 200, body: { rev: 'r3' } });

    const results = await Promise.all([postDoc('/x', { n: 1 }, KEY), postDoc('/x', { n: 2 }, KEY)]);

    assert.deepEqual(results, [{ ok: true }, { ok: true }]);
    assert.deepEqual(requests.map((r) => [r.n, r.baseRev]), [[1, 'r1'], [2, 'r2']]);
    assert.equal(readRev(KEY), 'r3');
  });

  it('reports a stale save and keeps the old revision', async () => {
    writeRev(KEY, 'r1');
    replies.push({ status: 409, body: { code: 'stale_data', rev: 'r9' } });

    const result = await postDoc('/x', {}, KEY);

    assert.deepEqual(result, { ok: false, stale: true });
    assert.equal(readRev(KEY), 'r1');
  });

  it('other refusals and network errors are not stale', async () => {
    replies.push({ status: 409, body: { error: 'Відхилено порожній overwrite' } }, new Error('offline'));

    const refused = await postDoc('/x', {}, KEY);
    const offline = await postDoc('/x', {}, KEY);

    assert.deepEqual(refused, { ok: false, localOnly: true });
    assert.deepEqual(offline, { ok: false, localOnly: true });
  });
});
