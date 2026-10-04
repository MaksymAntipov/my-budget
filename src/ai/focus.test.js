import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFocusFromQuestion, isWideLookQuestion } from './focus.js';

const catalog = {
  currentYear: 2026,
  currentMonth: 7,
  initializedMonths: [
    { year: 2026, month: 2 },
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
  ],
  names: ['Кава', 'Продукти', 'Оренда', 'Подушка'],
};

describe('parseFocusFromQuestion', () => {
  it('finds a month and a category', () => {
    const focus = parseFocusFromQuestion('скільки в березні пішло на каву?', catalog);
    assert.deepEqual(focus.months, [{ year: 2026, month: 2 }]);
    assert.deepEqual(focus.categories, ['Кава']);
  });

  it('maps this / last month', () => {
    assert.deepEqual(parseFocusFromQuestion('цього місяця', catalog).months, [
      { year: 2026, month: 7 },
    ]);
    assert.deepEqual(parseFocusFromQuestion('минулого місяця', catalog).months, [
      { year: 2026, month: 6 },
    ]);
  });

  it('maps a quarter to three months', () => {
    const focus = parseFocusFromQuestion('1 квартал', catalog);
    assert.deepEqual(focus.months, [
      { year: 2026, month: 0 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it('does not expand "весь час" into months', () => {
    assert.deepEqual(parseFocusFromQuestion('за весь час', catalog).months, []);
  });
});

describe('isWideLookQuestion', () => {
  it('detects outside-look phrasing', () => {
    assert.equal(isWideLookQuestion('Подивись на Скриню збоку'), true);
    assert.equal(isWideLookQuestion('чи я взагалі туди йду?'), true);
    assert.equal(isWideLookQuestion('де сліпа зона в моїй поведінці'), true);
  });

  it('leaves narrow money questions on the compact path', () => {
    assert.equal(isWideLookQuestion('скільки в березні на каву'), false);
    assert.equal(isWideLookQuestion('що з подушкою безпеки?'), false);
    assert.equal(isWideLookQuestion('ок'), false);
  });
});
