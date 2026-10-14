import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsIso,
  autoSchedule,
  buildSummary,
  buildYearMatrix,
  depositCalc,
  indexNbuBonds,
  instrumentName,
  nbuSchedule,
  normalizeDoc,
  purchaseEvents,
  purchaseProfit,
  purchaseProfitUah,
  splitByInstrument,
  upcomingPayouts,
  validatePurchase,
} from './model.js';

// Real rows from bank.gov.ua/depo_securities?json (trimmed to the fields we read).
const NBU_RAW = [
  {
    cpcode: 'UA4000239016', nominal: 1000, auk_proc: 15.15, pgs_date: '2027-07-21', val_code: 'UAH',
    payments: [
      { pay_date: '2026-07-22', pay_type: '1', pay_val: 75.75 },
      { pay_date: '2027-01-20', pay_type: '1', pay_val: 75.75 },
      { pay_date: '2027-07-21', pay_type: '1', pay_val: 75.75 },
      { pay_date: '2027-07-21', pay_type: '2', pay_val: 1000 },
    ],
  },
  {
    cpcode: 'UA4000236806', nominal: 1000, auk_proc: 4.15, pgs_date: '2027-03-18', val_code: 'USD',
    payments: [
      { pay_date: '2025-09-18', pay_type: '1', pay_val: 20.75 },
      { pay_date: '2026-03-19', pay_type: '1', pay_val: 20.75 },
      { pay_date: '2026-09-17', pay_type: '1', pay_val: 20.75 },
      { pay_date: '2027-03-18', pay_type: '1', pay_val: 20.75 },
      { pay_date: '2027-03-18', pay_type: '2', pay_val: 1000 },
    ],
  },
];
const NBU = indexNbuBonds(NBU_RAW);

const uahBond = {
  id: 'a', kind: 'ovdp', date: '2026-10-14', ccy: 'UAH', rate: 1, isin: 'UA4000239016',
  qty: 48, price: 1036.01, mat: '2027-07-21', schedule: nbuSchedule(NBU.UA4000239016), where: 'Монобанк',
};
const usdBond = {
  id: 'b', kind: 'ovdp', date: '2026-03-03', ccy: 'USD', rate: 41.2, isin: 'UA4000236806',
  qty: 30, price: 1005.4, mat: '2027-03-18', schedule: nbuSchedule(NBU.UA4000236806), where: 'ПриватБанк',
};
const deposit = {
  id: 'c', kind: 'deposit', date: '2026-08-01', ccy: 'UAH', rate: 1, amount: 30000,
  ytm: 13, months: 6, payout: 'end', tax: true, mat: '2027-02-01', where: 'Монобанк',
};

describe('addMonthsIso', () => {
  it('keeps the day across a DST switch', () => {
    assert.equal(addMonthsIso('2027-02-10', -6), '2026-08-10');
    assert.equal(addMonthsIso('2026-08-01', 6), '2027-02-01');
  });
  it('returns empty for a bad date', () => {
    assert.equal(addMonthsIso('', 1), '');
  });
});

describe('NBU schedule', () => {
  it('normalizes currency, coupon and maturity', () => {
    assert.equal(NBU.UA4000236806.ccy, 'USD');
    assert.equal(NBU.UA4000239016.coupon, 15.15);
    assert.equal(NBU.UA4000239016.mat, '2027-07-21');
  });
  it('merges the last interest payment into the bond payout', () => {
    assert.deepEqual(nbuSchedule(NBU.UA4000239016), [
      { date: '2026-07-22', kind: 'coupon', amt: 75.75 },
      { date: '2027-01-20', kind: 'coupon', amt: 75.75 },
      { date: '2027-07-21', kind: 'maturity', amt: 1075.75 },
    ]);
  });
  it('builds a manual schedule every 6 months back from maturity', () => {
    assert.deepEqual(autoSchedule('2026-10-14', '2027-07-21', 72.5), [
      { date: '2027-01-21', kind: 'coupon', amt: 72.5 },
      { date: '2027-07-21', kind: 'maturity', amt: 1072.5 },
    ]);
  });
});

describe('bond purchase', () => {
  it('counts only payments after the purchase day', () => {
    assert.deepEqual(purchaseEvents(uahBond), [
      { date: '2027-01-20', type: 'coupon', amount: 3636 },
      { date: '2027-07-21', type: 'maturity', amount: 51636 },
    ]);
  });
  it('profit = everything back − what was paid', () => {
    assert.equal(purchaseProfit(uahBond), 5543.52);
    assert.equal(purchaseProfit(usdBond), 1705.5);
    assert.equal(purchaseProfitUah(usdBond), 70266.6);
  });
});

describe('deposit', () => {
  it('taxes simple interest at 23%', () => {
    assert.deepEqual(depositCalc(deposit), { amount: 30000, months: 6, gross: 1950, tax: 448.5, net: 1501.5 });
    assert.deepEqual(purchaseEvents(deposit), [{ date: '2027-02-01', type: 'maturity', amount: 31501.5 }]);
  });
  it('compounds monthly with capitalization', () => {
    assert.equal(depositCalc({ ...deposit, payout: 'cap', tax: false }).gross, 2003.58);
  });
  it('pays interest monthly and the body at the end', () => {
    const ev = purchaseEvents({ ...deposit, payout: 'monthly' });
    assert.equal(ev.length, 7);
    assert.deepEqual(ev[0], { date: '2026-09-01', type: 'coupon', amount: 250.25 });
    assert.deepEqual(ev[6], { date: '2027-02-01', type: 'maturity', amount: 30000 });
  });
  it('is named by bank and term', () => {
    assert.equal(instrumentName(deposit), 'Монобанк · 6 міс.');
  });
});

describe('year matrix', () => {
  const m = buildYearMatrix([usdBond, uahBond, deposit], 2026);
  it('groups bonds before deposits', () => {
    assert.deepEqual(m.groups.map((g) => g.kind), ['ovdp', 'deposit']);
  });
  it('puts the purchase and the interest of the same month in one cell', () => {
    const row = m.groups[0].rows.find((r) => r.name === 'UA4000236806');
    assert.equal(row.months[2].sum, 30162);
    assert.equal(row.months[2].sumUah, 1242674.4);
    assert.equal(row.months[2].coupon, 622.5);
    assert.equal(row.months[8].coupon, 622.5);
  });
  it('totals months in UAH and runs a cumulative line', () => {
    assert.equal(m.monthUah[2], 1242674.4);
    assert.equal(m.monthUah[9], 49728.48);
    assert.equal(m.cumUah[11], m.totalUah);
  });
});

describe('summary', () => {
  const s = buildSummary([usdBond, uahBond, deposit], 2026, '2026-10-14');
  it('sums whole-period profit across all purchases', () => {
    assert.equal(s.incomeUah, 77311.62);
  });
  it('finds the nearest future payout', () => {
    assert.equal(s.next.date, '2027-01-20');
  });
  it('lists payouts nearest first', () => {
    assert.deepEqual(upcomingPayouts([usdBond, uahBond, deposit], '2026-10-14').map((e) => e.date),
      ['2027-01-20', '2027-02-01', '2027-03-18', '2027-07-21']);
  });
  it('splits by instrument in UAH', () => {
    const split = splitByInstrument([usdBond, uahBond]);
    assert.equal(split[0].name, 'UA4000236806');
    assert.ok(Math.abs(split[0].share + split[1].share - 1) < 1e-9);
  });
});

describe('validation and storage', () => {
  it('asks for an exchange rate on foreign currency', () => {
    assert.match(validatePurchase({ ...usdBond, rate: 0 }), /курс/);
    assert.equal(validatePurchase(usdBond), '');
  });
  it('drops junk rows from a stored doc', () => {
    assert.equal(normalizeDoc({ purchases: [uahBond, null, { kind: 'x' }] }).length, 1);
    assert.equal(normalizeDoc(null).length, 0);
  });
});
