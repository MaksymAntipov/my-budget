import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approxTokens, capItems, promptTokens, splitAiHistory, tokenUsageLabel } from './dump.js';

const months = (from, count) =>
  Array.from({ length: count }, (_, i) => {
    const ord = from + i;
    return { y: Math.floor(ord / 12), m: ord % 12 };
  });

test('splitAiHistory: short history is all detail and lines', () => {
  const list = months(2026 * 12 + 7, 3); // Aug–Oct 2026
  const out = splitAiHistory(list, 2026 * 12 + 9);
  assert.deepEqual(out.full, [{ y: 2026, m: 8 }, { y: 2026, m: 9 }]);
  assert.deepEqual(out.lines, [{ y: 2026, m: 7 }]);
  assert.deepEqual(out.years, []);
});

test('splitAiHistory: long history folds into years', () => {
  const now = 2026 * 12 + 9;
  const list = months(2024 * 12, 34); // Jan 2024 – Oct 2026
  const out = splitAiHistory(list, now);
  assert.equal(out.full.length, 2);
  assert.equal(out.lines.length, 10);
  assert.deepEqual(out.lines[0], { y: 2025, m: 10 });
  assert.deepEqual(out.years.map((y) => [y.year, y.months.length]), [[2024, 12], [2025, 10]]);
  const total = out.full.length + out.lines.length + out.years.reduce((s, y) => s + y.months.length, 0);
  assert.equal(total, list.length);
});

test('splitAiHistory: future months stay as lines, not detail', () => {
  const now = 2026 * 12 + 9;
  const list = [...months(now - 1, 2), { y: 2026, m: 11 }];
  const out = splitAiHistory(list, now);
  assert.deepEqual(out.full, [{ y: 2026, m: 8 }, { y: 2026, m: 9 }]);
  assert.deepEqual(out.lines, [{ y: 2026, m: 11 }]);
});

test('capItems keeps the biggest and sums the tail', () => {
  const items = [5, 50, 1, 20, 3].map((amount, i) => ({ name: `i${i}`, amount: String(amount) }));
  const out = capItems(items, 2);
  assert.deepEqual(out.shown.map((i) => i.amount), ['50', '20']);
  assert.equal(out.restCount, 3);
  assert.equal(out.restSum, 9);
  assert.equal(capItems(items, 10).restCount, 0);
});

test('promptTokens sums system and messages', () => {
  assert.equal(promptTokens('абв', [{ content: 'абвгде' }, { content: '' }]), 3);
});

test('tokenUsageLabel', () => {
  assert.equal(tokenUsageLabel(0, 'x'), '');
  assert.match(tokenUsageLabel(6100, 'абвгде'), /^≈ 6\s100 токенів запиту · ≈ 2 відповіді$/);
  assert.equal(tokenUsageLabel(30, ''), '≈ 30 токенів запиту');
});

test('approxTokens', () => {
  assert.equal(approxTokens('абвгде'), 2);
  assert.equal(approxTokens(''), 0);
});
