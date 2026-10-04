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
