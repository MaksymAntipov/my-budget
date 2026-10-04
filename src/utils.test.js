import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeAttr } from './utils.js';

/** Decode the entities a browser decodes in an attribute value. */
function decodeAttr(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

test('data-args JSON survives names with quotes, apostrophes and backslashes', () => {
    const args = ["jar-1", "Сім'я", 'ТОВ "Ромашка"', 'a\\b', '<b>&amp;</b>', 'line\nbreak'];
    const attr = escapeAttr(JSON.stringify(args));
    assert.doesNotMatch(attr, /["<>]/);
    assert.deepEqual(JSON.parse(decodeAttr(attr)), args);
});

import { addMoney, roundMoney } from './utils.js';

test('money helpers stay on kopiyky', () => {
    let balance = 0;
    for (let i = 0; i < 10; i++) balance = addMoney(balance, 0.1);
    assert.equal(balance, 1);
    assert.equal(addMoney(0.1, 0.2), 0.3);
    assert.equal(addMoney('100.50', '-0.5'), 100);
    assert.equal(roundMoney('abc'), 0);
});
