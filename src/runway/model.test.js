import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  deltaBadge,
  fillMonthRange,
  formatCompactUah,
  forecastFinish,
  listFactMonths,
  listRunwayMonths,
  motivationLine,
  paceHint,
  pacePhrase,
  reconstructDrawdown,
  reconstructStock,
  seriesDelta,
  sumDebtPayments,
  sumEmergencyDeposits,
  targetSubtitle,
  trailingAverage,
  chartYMax,
  debtRemainingInMonth,
  buildRunwayDump,
  maxMonthDelta,
  maxCombinedContribution,
  optimisticSentences,
} from './model.js';

describe('reconstructStock', () => {
  it('walks backward from current balance', () => {
    assert.deepEqual(reconstructStock(72000, [28000, 30000, 14000]), [28000, 58000, 72000]);
  });
});

describe('trailingAverage', () => {
  it('uses the last three months', () => {
    assert.equal(trailingAverage([10, 20, 30, 40], 3), 30);
  });
});

describe('forecastFinish', () => {
  it('is done when nothing remains', () => {
    assert.equal(forecastFinish(0, 1000, 2026, 8).kind, 'done');
  });

  it('stalls at zero pace', () => {
    assert.equal(forecastFinish(10000, 0, 2026, 8).kind, 'stalled');
  });

  it('projects a finish month', () => {
    const f = forecastFinish(90000, 30000, 2026, 8);
    assert.equal(f.kind, 'date');
    assert.equal(f.months, 3);
    assert.deepEqual(addMonths(2026, 8, 3), { year: 2026, month: 11 });
  });
});

describe('motivationLine', () => {
  it('says the pillow will be saved by that month', () => {
    const line = motivationLine({ kind: 'date', year: 2027, month: 2 }, { avg: 15000 }, 'pillow');
    assert.match(line, /накопичена у березні 2027/);
    assert.match(line, /15/);
  });

  it('says debts will be paid off by that month', () => {
    const line = motivationLine({ kind: 'date', year: 2028, month: 5 }, { avg: 11300 }, 'debt');
    assert.match(line, /погашені у червні 2028/);
    assert.match(line, /11/);
  });

  it('asks to mark essentials when there is no target', () => {
    assert.match(motivationLine({ kind: 'no-target' }, { avg: 0 }, 'pillow'), /обов/);
  });
});

describe('pacePhrase', () => {
  it('is the amount inside the motivation line', () => {
    const avg = 1933;
    const line = motivationLine({ kind: 'date', year: 2036, month: 9 }, { avg }, 'pillow');
    assert.equal(line.includes(pacePhrase(avg)), true);
  });
});

describe('paceHint', () => {
  it('says the pace is a 3-month average', () => {
    assert.match(paceHint('pillow'), /3 місяц/);
    assert.match(paceHint('debt'), /погашен/);
  });
});

describe('seriesDelta', () => {
  it('needs two months', () => {
    assert.equal(seriesDelta([10]).hasPrev, false);
  });

  it('reports last-month change', () => {
    const d = seriesDelta([50000, 80000]);
    assert.equal(d.abs, 30000);
    assert.equal(d.pct, 60);
  });
});

describe('deltaBadge', () => {
  it('greens a pillow increase', () => {
    const b = deltaBadge(seriesDelta([50000, 80000]), { wantUp: true });
    assert.equal(b.tone, 'up');
    assert.match(b.text, /60/);
  });

  it('greens a debt drop', () => {
    const b = deltaBadge(seriesDelta([40000, 30000]), { wantUp: false });
    assert.equal(b.tone, 'up');
    assert.match(b.text, /▼/);
  });
});

describe('formatCompactUah', () => {
  it('uses thousands', () => {
    assert.equal(formatCompactUah(81200), '81,2 тис.');
  });
});

describe('targetSubtitle', () => {
  it('shows percent of pillow target', () => {
    assert.match(targetSubtitle(60000, 120000, 'pillow'), /50%/);
  });
});

describe('listFactMonths', () => {
  it('keeps months that have money even without initialized', () => {
    const months = listFactMonths({
      2026: {
        5: { initialized: false, expenses: [{ items: [{ amount: 5000, envelopeId: 'j1' }] }] },
        7: { initialized: true, incomes: [], expenses: [] },
      },
    });
    assert.deepEqual(months, [
      { year: 2026, month: 5 },
      { year: 2026, month: 7 },
    ]);
  });
});

describe('fillMonthRange', () => {
  it('fills the gap through the viewed month', () => {
    const filled = fillMonthRange([{ year: 2026, month: 5 }], 2026, 7);
    assert.deepEqual(filled, [
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it('does not jump past a cap into later facts', () => {
    const filled = fillMonthRange(
      [
        { year: 2026, month: 7 },
        { year: 2027, month: 2 },
      ],
      2026,
      7,
    );
    assert.deepEqual(filled[filled.length - 1], { year: 2026, month: 7 });
  });
});

describe('listRunwayMonths', () => {
  it('stops at today and skips copied 2027 months', () => {
    const appData = {
      2026: {
        1: { initialized: true, expenses: [] },
        7: { initialized: true, expenses: [] },
      },
      2027: {
        2: { initialized: true, expenses: [] },
        4: { initialized: true, expenses: [] },
      },
    };
    const months = listRunwayMonths(appData, 2026, 7);
    assert.equal(months[0].month, 1);
    assert.equal(months[months.length - 1].year, 2026);
    assert.equal(months[months.length - 1].month, 7);
    assert.ok(months.some((p) => p.month === 5));
    assert.equal(months.some((p) => p.year === 2027), false);
  });
});

describe('chartYMax', () => {
  it('does not stretch to a far-away target', () => {
    const max = chartYMax([0, 0, 3600], 240000);
    assert.ok(max < 10000);
    assert.ok(max > 3600);
  });
});

describe('sumEmergencyDeposits', () => {
  it('sums every savings category, not only the first', () => {
    const expenses = [
      { isSavings: true, items: [{ amount: 1000, envelopeId: 'e1' }] },
      { isSavings: true, items: [{ amount: 2000, envelopeId: 'e1' }] },
    ];
    assert.equal(sumEmergencyDeposits(expenses, [{ id: 'e1', name: 'Подушка' }]), 3000);
  });

  it('matches a deleted jar by name on a savings row', () => {
    const expenses = [{ isSavings: true, items: [{ name: 'У конверт: Подушка', amount: 4000, envelopeId: 'gone' }] }];
    assert.equal(sumEmergencyDeposits(expenses, [{ id: 'new', name: 'Подушка' }]), 4000);
  });

  it('counts a manual withdrawal as a negative deposit', () => {
    const expenses = [{ isSavings: true, items: [{ amount: -2000, envelopeId: 'e1' }] }];
    assert.equal(sumEmergencyDeposits(expenses, [{ id: 'e1', name: 'Подушка' }]), -2000);
  });
});

describe('sumDebtPayments', () => {
  it('counts debt rows outside the named category', () => {
    const expenses = [{ name: 'Кредити', items: [{ amount: 1500, debtId: 'd1' }] }];
    assert.equal(sumDebtPayments(expenses), 1500);
  });
});

describe('debtRemainingInMonth', () => {
  const paid = {
    total_amount: 17900,
    remaining_amount: 0,
    is_archived: 202605,
    outside_paid: 17900,
  };

  it('keeps a closed debt on the line until its archive month', () => {
    assert.equal(debtRemainingInMonth(paid, 2026, 4, 0), 17900);
    assert.equal(debtRemainingInMonth(paid, 2026, 5, 0), 0);
    assert.equal(debtRemainingInMonth(paid, 2026, 7, 0), 0);
  });

  it('does not leave a paid archive hanging in a copied future month', () => {
    const future = { ...paid, is_archived: 202703 };
    assert.equal(debtRemainingInMonth(future, 2026, 7, 0, 202607), 0);
    assert.equal(debtRemainingInMonth(future, 2026, 4, 0, 202607), 17900);
  });
});

describe('reconstructDrawdown', () => {
  it('walks remaining backward from current by monthly paydowns', () => {
    assert.deepEqual(reconstructDrawdown(243000, [0, 11300, 11300]), [265600, 254300, 243000]);
  });
});

describe('maxMonthDelta', () => {
  it('takes the largest drop between months', () => {
    const { amount, index } = maxMonthDelta([400000, 380000, 243000, 243000], 'down');
    assert.equal(amount, 137000);
    assert.equal(index, 2);
  });

  it('takes the largest rise for the pillow', () => {
    const { amount } = maxMonthDelta([0, 0, 3600, 3600], 'up');
    assert.equal(amount, 3600);
  });
});

describe('maxCombinedContribution', () => {
  it('adds same-month debt drop and pillow rise', () => {
    const { amount, index } = maxCombinedContribution([
      { pillow: 0, debt: 100000 },
      { pillow: 1000, debt: 80000 },
      { pillow: 2000, debt: 79000 },
    ]);
    assert.equal(amount, 21000);
    assert.equal(index, 1);
  });
});

describe('optimisticSentences', () => {
  it('uses one combined pace on debt first, then pillow', () => {
    const lines = optimisticSentences({
      points: [
        { year: 2026, month: 5, label: 'чер 26', pillow: 0, debt: 100000 },
        { year: 2026, month: 6, label: 'лип 26', pillow: 1000, debt: 80000 },
        { year: 2026, month: 7, label: 'сер 26', pillow: 2000, debt: 50000 },
      ],
      hasDebts: true,
      debtNow: 50000,
      pillowNow: 2000,
      pillowTarget: 23000,
    });
    assert.match(lines[0], /31[\s\u00a0]?000/);
    assert.match(lines[0], /разом/);
    assert.match(lines[1], /спочатку на борги/);
    assert.match(lines[2], /Після цього/);
    assert.match(lines[2], /подушка/);
  });
});

describe('buildRunwayDump', () => {
  it('packs income leftover and finish facts without inventing banks', () => {
    const dump = buildRunwayDump({
      points: [{ label: 'сер 26', pillow: 3600, debt: 243000 }],
      pillowNow: 3600,
      pillowTarget: 238064,
      pillowAvg: 1933,
      pillowForecast: { kind: 'date', year: 2027, month: 2 },
      hasDebts: true,
      debtNow: 243000,
      debtAvg: 11300,
      debtForecast: { kind: 'date', year: 2028, month: 5 },
      incomeUah: 80000,
      essentialsUah: 39677,
      wantsUah: 12000,
    });
    assert.match(dump, /^ФАКТ/);
    assert.match(dump, /сер 26/);
    assert.match(dump, /3600/);
    assert.match(dump, /вільний після обов'язкових/);
    assert.match(dump, /бажані/);
    assert.doesNotMatch(dump, /вкладка:/);
    assert.doesNotMatch(dump, /Абанк|Приват|монобанк/i);
  });
});
