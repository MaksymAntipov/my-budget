import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceMarkdown, nextRevealLength, REVEAL_MAX_LAG_SEC, REVEAL_MIN_CPS } from './reveal.js';

const words = (n) => Array.from({ length: n }, (_, i) => `слово${i}`).join(' ');

test('a small backlog is revealed at the calm base pace, whole words at a time', () => {
  const text = words(20);
  const next = nextRevealLength(0, text, 1000 / 60);
  assert.ok(next >= Math.round(REVEAL_MIN_CPS / 60));
  assert.ok(next === text.length || /\s/.test(text[next]), 'stops at a word boundary');
});

test('a big backlog speeds up so the reveal lags the stream by under a second', () => {
  const text = 'x '.repeat(10_000);
  let shown = 0;
  let ms = 0;
  while (shown < text.length && ms < 5000) {
    shown = nextRevealLength(shown, text, 16);
    ms += 16;
  }
  assert.equal(shown, text.length);
  // the backlog shrinks geometrically: a few lag-times, not the minutes a fixed pace would take
  assert.ok(ms < REVEAL_MAX_LAG_SEC * 1000 * 8, `took ${ms} ms`);
});

test('never goes past the text, never backwards, survives odd input', () => {
  assert.equal(nextRevealLength(50, 'abc', 16), 3);
  assert.equal(nextRevealLength(3, 'abc', 16), 3);
  assert.equal(nextRevealLength(-5, 'abc def', 0) >= 1, true);
  assert.equal(nextRevealLength(0, '', 16), 0);
  // a background-tab pause is capped, not a full dump of a long backlog
  assert.ok(nextRevealLength(0, 'x '.repeat(5000), 60_000) < 10_000);
});

test('balanceMarkdown closes an open bold or code span on the last line only', () => {
  assert.equal(balanceMarkdown('Ось **важли'), 'Ось **важли**');
  assert.equal(balanceMarkdown('**вже** закрито'), '**вже** закрито');
  assert.equal(balanceMarkdown('команда `npm te'), 'команда `npm te`');
  assert.equal(balanceMarkdown('**жир** і `ко'), '**жир** і `ко`');
  assert.equal(balanceMarkdown('**рядок 1\nрядок 2'), '**рядок 1\nрядок 2');
  assert.equal(balanceMarkdown('```js'), '```js');
});
