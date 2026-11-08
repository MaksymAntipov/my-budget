import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushSyncAction } from './model.js';

test('push sync: nothing to do when never enabled or still the same subscription', () => {
    assert.equal(pushSyncAction({ stored: '', permission: 'granted', current: 'https://a' }), 'none');
    assert.equal(pushSyncAction({ stored: 'https://a', permission: 'granted', current: 'https://a' }), 'none');
});

test('push sync: a dropped subscription is renewed, a replaced one is sent to the server', () => {
    assert.equal(pushSyncAction({ stored: 'https://a', permission: 'granted', current: '' }), 'resubscribe');
    assert.equal(pushSyncAction({ stored: 'https://a', permission: 'granted', current: 'https://b' }), 'update');
});

test('push sync: revoked permission turns pushes off instead of showing them as on', () => {
    assert.equal(pushSyncAction({ stored: 'https://a', permission: 'denied', current: 'https://a' }), 'forget');
    assert.equal(pushSyncAction({ stored: 'https://a', permission: 'default', current: '' }), 'forget');
});
