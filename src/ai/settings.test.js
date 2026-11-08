import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatRequestKey, keyPageUrl, localKeyToMigrate, preferredServerProvider, shouldDropLocalKey, serverKeyHint, setServerKeyHint, setServerKeys } from './settings.js';

const loaded = (hints = {}, enabled = true) => ({ enabled, loaded: true, hints });
const local = (apiKey, provider = 'groq') => ({ provider, apiKey, model: '', baseUrl: '' });

test('server key hints are kept per provider and can be removed', () => {
    setServerKeys({ enabled: true, keys: [{ provider: 'groq', hint: 'gsk_…WXYZ' }, { provider: 'gemini', hint: 'AIza…1234' }] });
    assert.equal(serverKeyHint('groq'), 'gsk_…WXYZ');
    assert.equal(serverKeyHint('GEMINI'), 'AIza…1234');
    assert.equal(serverKeyHint('openai'), '');

    setServerKeyHint('groq', '');

    assert.equal(serverKeyHint('groq'), '');
    assert.equal(serverKeyHint('gemini'), 'AIza…1234');
});

test('chat request carries no key when the server holds one for the provider', () => {
    assert.equal(chatRequestKey(local('gsk_local_key_123'), 'gsk_…WXYZ'), '');
    assert.equal(chatRequestKey(local(' gsk_local_key_123 '), ''), 'gsk_local_key_123');
    assert.equal(chatRequestKey(local(''), ''), '');
});

test('a browser key is migrated once: storage on, provider known, nothing saved for it yet', () => {
    assert.deepEqual(localKeyToMigrate(local('gsk_local_key_123'), loaded()), { provider: 'groq', apiKey: 'gsk_local_key_123' });
    assert.equal(localKeyToMigrate(local('gsk_local_key_123'), loaded({ groq: 'gsk_…WXYZ' })), null);
    assert.equal(localKeyToMigrate(local('gsk_local_key_123'), loaded({}, false)), null);
    assert.equal(localKeyToMigrate(local('gsk_local_key_123'), { enabled: true, loaded: false, hints: {} }), null);
    assert.equal(localKeyToMigrate(local('gsk_local_key_123', ''), loaded()), null);
    assert.equal(localKeyToMigrate(local('short'), loaded()), null);
});

test('a new device picks the provider of the most recently saved key', () => {
    const keys = [
        { provider: 'gemini', hint: 'AIza…1234', updatedAt: 100 },
        { provider: 'groq', hint: 'gsk_…WXYZ', updatedAt: 300 },
        { provider: 'custom', hint: 'cust…0000', updatedAt: 900 },
    ];
    assert.equal(preferredServerProvider(keys), 'groq');
    assert.equal(preferredServerProvider([]), '');
    assert.equal(preferredServerProvider(undefined), '');
});

test('a browser key is dropped once the server holds a key for its provider', () => {
    assert.equal(shouldDropLocalKey(local('gsk_local_key_123'), loaded({ groq: 'gsk_…WXYZ' })), true);
    assert.equal(shouldDropLocalKey(local('gsk_local_key_123'), loaded({ gemini: 'AIza…1234' })), false);
    assert.equal(shouldDropLocalKey(local('gsk_local_key_123'), loaded({ groq: 'gsk_…WXYZ' }, false)), false);
    assert.equal(shouldDropLocalKey(local(''), loaded({ groq: 'gsk_…WXYZ' })), false);
});

test('every provider in the key dialog has a page to get a key; unknown ones have none', () => {
    for (const provider of ['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'xai']) {
        assert.match(keyPageUrl(provider), /^https:\/\//, provider);
    }
    assert.equal(keyPageUrl('gemini'), 'https://aistudio.google.com/app/apikey');
    assert.equal(keyPageUrl('nope'), '');
});
