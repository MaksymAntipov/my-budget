import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://myskrynia.com.ua';

/** Runs public/sw.js against a fake `self` and returns its push/notificationclick handlers plus what they did. */
function loadWorker({ windows = [] } = {}) {
    const handlers = {};
    const shown = [];
    const opened = [];
    const self = {
        location: new URL(`${ORIGIN}/sw.js`),
        addEventListener: (type, fn) => { handlers[type] = fn; },
        registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
        clients: {
            matchAll: async () => windows,
            openWindow: async (url) => { opened.push(url); },
        },
    };
    vm.runInNewContext(SOURCE, { self, URL, caches: {}, fetch: () => {} });

    /** Fires an event at the worker and waits for what it passed to `waitUntil`. */
    async function fire(type, event) {
        let pending = Promise.resolve();
        handlers[type]({ ...event, waitUntil: (p) => { pending = p; } });
        await pending;
    }
    return { fire, shown, opened };
}

function pushData(value) {
    return {
        json: () => (typeof value === 'string' ? JSON.parse(value) : value),
        text: () => (typeof value === 'string' ? value : JSON.stringify(value)),
    };
}

function makeWindow(url) {
    const client = { url, messages: [], focused: false };
    // Copied: the worker's objects come from another vm realm, and deepEqual compares prototypes.
    client.postMessage = (message) => client.messages.push({ ...message });
    client.focus = async () => { client.focused = true; };
    return client;
}

test('push from the API shows a notification with its title, body, tag and tab', async () => {
    const sw = loadWorker();

    await sw.fire('push', { data: pushData({ title: '−1 250,00 ₴ · Сільпо', body: 'У категорію «Їжа»', tag: 'mono-tx1', tab: 'expenses' }) });

    assert.equal(sw.shown.length, 1);
    const { title, options } = sw.shown[0];
    assert.equal(title, '−1 250,00 ₴ · Сільпо');
    assert.equal(options.body, 'У категорію «Їжа»');
    assert.equal(options.tag, 'mono-tx1');
    assert.equal(options.renotify, true);
    assert.equal(options.data.tab, 'expenses');
    assert.match(options.icon, /^\/icons\/icon-192\.png/);
    assert.match(options.badge, /^\/icons\/badge-96\.png/);
});

test('push without data or with plain text still shows something readable', async () => {
    const sw = loadWorker();

    await sw.fire('push', { data: null });
    await sw.fire('push', { data: pushData('Просто текст') });

    assert.equal(sw.shown[0].title, 'Скриня');
    assert.equal(sw.shown[0].options.body, '');
    assert.equal(sw.shown[0].options.tag, undefined);
    assert.equal(sw.shown[0].options.renotify, false);
    assert.equal(sw.shown[1].title, 'Просто текст');
});

test('tap on a notification focuses the open app and asks it for the tab', async () => {
    const other = makeWindow('https://example.com/');
    const app = makeWindow(`${ORIGIN}/`);
    const sw = loadWorker({ windows: [other, app] });
    let closed = false;

    await sw.fire('notificationclick', { notification: { data: { tab: 'expenses' }, close: () => { closed = true; } } });

    assert.equal(closed, true);
    assert.equal(app.focused, true);
    assert.deepEqual(app.messages, [{ type: 'open-tab', tab: 'expenses' }]);
    assert.equal(other.focused, false);
    assert.deepEqual(sw.opened, []);
});

test('tap on a notification with no app open opens it on the tab', async () => {
    const sw = loadWorker();

    await sw.fire('notificationclick', { notification: { data: { tab: 'summary' }, close() {} } });
    await sw.fire('notificationclick', { notification: { data: {}, close() {} } });

    assert.deepEqual(sw.opened, ['/?tab=summary', '/']);
});
