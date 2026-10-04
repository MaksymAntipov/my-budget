import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTrack, createStage, emptyDoc, setBoard } from './model.js';
import { buildYearTracksAiSection } from './export-prompt.js';

function track(partial) {
  return createTrack({
    stages: [createStage({ title: partial.title || 'T' })],
    ...partial,
  });
}

describe('buildYearTracksAiSection sequences', () => {
  it('prints order A → B and Після on the successor', () => {
    const a = track({ id: 'a', title: 'Ремонт', status: 'active' });
    const b = track({ id: 'b', title: 'Переїзд', status: 'paused', statusReason: 'чекаю', afterId: 'a' });
    const d = track({ id: 'd', title: 'Курс', status: 'plain' });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [b, d, a] });
    const text = buildYearTracksAiSection(doc, { years: [2026] });
    assert.match(text, /ЗВ'ЯЗКИ \/ ПОСЛІДОВНІСТЬ \(що за чим/);
    assert.match(text, /«Ремонт» → «Переїзд»/);
    assert.match(text, /Паралельно \(без «потім»\): «Курс»/);
    assert.match(text, /Після: «Ремонт»/);
    assert.match(text, /СТАТУСИ:/);
    assert.match(text, /Статус: Активний трек/);
    assert.match(text, /Статус: На паузі/);
    assert.match(text, /Не пропонуй наступний трек раніше попередника/);
    const repairAt = text.indexOf('Трек: «Ремонт»');
    const moveAt = text.indexOf('Трек: «Переїзд»');
    assert.ok(repairAt >= 0 && moveAt > repairAt);
  });

  it('omits sequence block when nothing is linked', () => {
    const a = track({ id: 'a', title: 'A', status: 'active' });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [a] });
    const text = buildYearTracksAiSection(doc, { years: [2026] });
    assert.match(text, /ЗВ'ЯЗКИ: немає стрілок/);
    assert.match(text, /Після: немає \(паралельний\)/);
  });

  it('tells the model to analyze paused and blocked tracks', () => {
    const a = track({ id: 'a', title: 'AQA', status: 'active' });
    const b = track({
      id: 'b',
      title: 'English',
      status: 'blocked',
      statusReason: 'курси',
      afterId: 'a',
    });
    const c = track({ id: 'c', title: 'Megogo', status: 'paused', statusReason: 'hold' });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [a, b, c] });
    const text = buildYearTracksAiSection(doc, { years: [2026] });
    assert.match(text, /на паузі і заблоковані/);
    assert.match(text, /пауза\/блокер ≠ «пропусти»/);
    assert.match(text, /Статус: Заблоковано/);
    assert.match(text, /Статус: На паузі/);
    assert.match(text, /Заблоковано: «English» \(блокер: курси\)/);
    assert.match(text, /На паузі: «Megogo» \(пауза: hold\)/);
    assert.match(text, /чи сама послідовність не блокує важливіший важіль/);
    assert.match(text, /найменшим опором/);
    assert.match(text, /лінза, не заборона/);
    assert.match(text, /≠ «НЕ РОБИТИ»/);
  });
});

describe('buildYearTracksAiSection stages', () => {
  it('dumps each work stage with its board status', () => {
    const megogo = createTrack({
      id: 'm',
      status: 'active',
      stages: [
        createStage({ title: 'MEGOGO' }),
        createStage({ title: 'Перегляд ЗП', status: 'doing' }),
        createStage({ title: 'Друга частина', status: 'todo' }),
      ],
    });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [megogo] });
    const text = buildYearTracksAiSection(doc, { years: [2026], compact: true });
    assert.match(text, /Трек: «MEGOGO»/);
    assert.match(text, /Перегляд ЗП — В процесі/);
    assert.match(text, /Друга частина — Очікує/);
    assert.match(text, /Каса \(частина ЗП, платіж\) стадію не закриває/);
    assert.equal(/Деталі стадій — лише в кнопці/.test(text), false);
  });
});

describe('buildYearTracksAiSection finished tracks', () => {
  it('shows what a finished track did, so «Продано» is not lost', () => {
    const cafe = createTrack({
      id: 'cafe',
      status: 'done',
      stages: [
        createStage({ title: 'Кофейня «Brooklyn hub»' }),
        createStage({ title: 'Виставлено на продаж', status: 'done' }),
        createStage({ title: 'Продано', status: 'done' }),
      ],
    });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [cafe] });
    const text = buildYearTracksAiSection(doc, { years: [2026] });
    assert.match(text, /Трек: «Кофейня «Brooklyn hub»»\n  Статус: Завершено/);
    assert.match(text, /Що зроблено:\n    - Виставлено на продаж — Готово\n    - Продано — Готово/);
    assert.match(text, /- Завершено: «Кофейня «Brooklyn hub»»/);
    assert.match(text, /довіряй треку/);
    assert.doesNotMatch(text, /Реалізовано/);
  });
});
