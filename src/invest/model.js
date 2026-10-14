/**
 * «Інвестиції»: pure math for OVDP bonds and bank deposits.
 * Dates are ISO strings (YYYY-MM-DD) and are compared as strings, so nothing here depends on the time zone.
 *
 * Purchase shape (what the module stores):
 *   { id, kind: 'ovdp' | 'deposit', date, ccy: 'UAH' | 'USD' | 'EUR', rate, where, mat,
 *     // ovdp
 *     isin, qty, price, ytm, schedule: [{ date, kind: 'coupon' | 'maturity', amt }], fromNbu,
 *     // deposit
 *     amount, months, payout: 'end' | 'monthly' | 'cap', tax }
 * `rate` is UAH per 1 unit of `ccy` on the purchase day (1 for UAH).
 * `schedule` amounts are per 1 bond; the last interest payment is merged into the maturity row, as banks show it.
 */

export const NOMINAL = 1000;
/** Deposit interest is taxed: 18% personal income tax + 5% military levy. OVDP interest is tax-free. */
export const DEPOSIT_TAX = 0.23;
export const CURRENCIES = ['UAH', 'USD', 'EUR'];
export const KIND_LABELS = { ovdp: 'Облігації ОВДП', deposit: 'Депозити' };
export const MONTHS_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** ISO date + n months, in UTC so a DST switch never moves the day. '' for a bad date. */
export function addMonthsIso(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!iso || Number.isNaN(d.getTime())) return '';
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function isoYear(iso) {
  return Number(String(iso).slice(0, 4));
}

/** 0-based month of an ISO date. */
export function isoMonth(iso) {
  return Number(String(iso).slice(5, 7)) - 1;
}

/** DD.MM.YYYY */
export function formatDateUa(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

/* ---------- NBU open data (bank.gov.ua/depo_securities?json) ---------- */

/** One row of the NBU list → compact bond. pay_type "1" = interest, "2" = nominal repayment. */
export function normalizeNbuBond(raw) {
  if (!raw || !raw.cpcode) return null;
  const pays = (Array.isArray(raw.payments) ? raw.payments : [])
    .map((p) => ({
      date: String(p.pay_date || '').slice(0, 10),
      kind: String(p.pay_type) === '2' ? 'maturity' : 'coupon',
      amt: Number(p.pay_val) || 0,
    }))
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    isin: String(raw.cpcode).toUpperCase(),
    ccy: CURRENCIES.includes(raw.val_code) ? raw.val_code : 'UAH',
    nominal: Number(raw.nominal) || NOMINAL,
    coupon: Number(raw.auk_proc) || 0,
    mat: String(raw.pgs_date || '').slice(0, 10),
    pays,
  };
}

/** NBU list → { ISIN: bond }. */
export function indexNbuBonds(rawList) {
  const out = {};
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const b = normalizeNbuBond(raw);
    if (b) out[b.isin] = b;
  }
  return out;
}

/** Per-bond schedule for the whole life of the issue, last interest merged into the maturity row. */
export function nbuSchedule(bond) {
  if (!bond) return [];
  const rows = bond.pays.filter((p) => p.kind === 'coupon').map((p) => ({ date: p.date, kind: 'coupon', amt: p.amt }));
  for (const p of bond.pays) {
    if (p.kind !== 'maturity') continue;
    const i = rows.findIndex((r) => r.date === p.date);
    const last = i >= 0 ? rows.splice(i, 1)[0].amt : 0;
    rows.push({ date: p.date, kind: 'maturity', amt: round2(p.amt + last) });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Manual fallback when the ISIN is not in NBU data: interest every 6 months back from maturity. */
export function autoSchedule(buyIso, matIso, couponAmt, nominal = NOMINAL) {
  if (!matIso) return [];
  const coupons = [];
  for (let i = 1; ; i++) {
    const d = addMonthsIso(matIso, -6 * i);
    if (!d || d <= buyIso) break;
    coupons.unshift({ date: d, kind: 'coupon', amt: couponAmt });
  }
  return [...coupons, { date: matIso, kind: 'maturity', amt: round2(nominal + couponAmt) }];
}

/* ---------- money per purchase ---------- */

/** What was paid, in the purchase currency. */
export function purchaseCost(p) {
  if (p.kind === 'deposit') return round2(p.amount);
  return round2((Number(p.qty) || 0) * (Number(p.price) || 0));
}

export function purchaseCostUah(p) {
  return round2(purchaseCost(p) * (Number(p.rate) || 0));
}

/** Deposit interest: simple (end / monthly) or compounded monthly (cap), with optional 23% tax. */
export function depositCalc(p) {
  const amount = Number(p.amount) || 0;
  const r = (Number(p.ytm) || 0) / 100;
  const n = Number(p.months) || 0;
  const gross = p.payout === 'cap' ? amount * (Math.pow(1 + r / 12, n) - 1) : amount * r * n / 12;
  const tax = p.tax ? gross * DEPOSIT_TAX : 0;
  return { amount, months: n, gross: round2(gross), tax: round2(tax), net: round2(gross - tax) };
}

/**
 * Money coming back from a purchase, in its currency: [{ date, type: 'coupon' | 'maturity', amount }].
 * Bonds: schedule rows after the purchase day × quantity. Deposits: monthly interest or everything at the end.
 */
export function purchaseEvents(p) {
  if (p.kind === 'deposit') {
    const c = depositCalc(p);
    if (!p.mat) return [];
    if (p.payout === 'monthly' && c.months > 0) {
      const monthly = round2(c.net / c.months);
      const rows = [];
      for (let i = 1; i <= c.months; i++) rows.push({ date: addMonthsIso(p.date, i), type: 'coupon', amount: monthly });
      rows.push({ date: p.mat, type: 'maturity', amount: c.amount });
      return rows;
    }
    return [{ date: p.mat, type: 'maturity', amount: round2(c.amount + c.net) }];
  }
  const qty = Number(p.qty) || 0;
  return (p.schedule || [])
    .filter((r) => r.date && r.date > p.date)
    .map((r) => ({ date: r.date, type: r.kind, amount: round2(qty * (Number(r.amt) || 0)) }));
}

/** Everything that comes back minus what was paid, in the purchase currency. */
export function purchaseProfit(p) {
  const back = purchaseEvents(p).reduce((s, e) => s + e.amount, 0);
  return round2(back - purchaseCost(p));
}

/** Same, in UAH at the purchase-day rate. */
export function purchaseProfitUah(p) {
  return round2(purchaseProfit(p) * (Number(p.rate) || 0));
}

/** Row label in the matrix: ISIN for bonds, «Bank · N міс.» for deposits (they sit under «Депозити»). */
export function instrumentName(p) {
  if (p.kind === 'deposit') return `${(p.where || '').trim() || 'Банк'} · ${Number(p.months) || 0} міс.`;
  return String(p.isin || '').toUpperCase() || 'Без назви';
}

/** Matrix row id: one row per instrument and currency. */
export function instrumentKey(p) {
  return `${p.kind}:${instrumentName(p)}:${p.ccy}`;
}

/* ---------- views ---------- */

/**
 * Year matrix: instruments grouped by kind × 12 months.
 * Each month cell: what was invested that month (purchase currency + UAH) and what comes back that month.
 */
export function buildYearMatrix(purchases, year) {
  const rowsByKey = new Map();
  for (const p of purchases) {
    const key = instrumentKey(p);
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        key, kind: p.kind, name: instrumentName(p), ccy: p.ccy, mat: p.mat, purchases: [],
        months: Array.from({ length: 12 }, () => ({ ids: [], sum: 0, sumUah: 0, coupon: 0, maturity: 0 })),
        total: 0, totalUah: 0,
      });
    }
    const row = rowsByKey.get(key);
    row.purchases.push(p);
    if (p.mat > row.mat) row.mat = p.mat;
    if (isoYear(p.date) === year) {
      const cell = row.months[isoMonth(p.date)];
      cell.ids.push(p.id);
      cell.sum = round2(cell.sum + purchaseCost(p));
      cell.sumUah = round2(cell.sumUah + purchaseCostUah(p));
      row.total = round2(row.total + purchaseCost(p));
      row.totalUah = round2(row.totalUah + purchaseCostUah(p));
    }
    for (const e of purchaseEvents(p)) {
      if (isoYear(e.date) !== year) continue;
      const cell = row.months[isoMonth(e.date)];
      cell[e.type] = round2(cell[e.type] + e.amount);
    }
  }
  const groups = Object.keys(KIND_LABELS)
    .map((kind) => ({ kind, label: KIND_LABELS[kind], rows: [...rowsByKey.values()].filter((r) => r.kind === kind) }))
    .filter((g) => g.rows.length);
  const monthUah = Array.from({ length: 12 }, (_, m) =>
    round2([...rowsByKey.values()].reduce((s, r) => s + r.months[m].sumUah, 0)));
  let run = 0;
  const cumUah = monthUah.map((v) => (run = round2(run + v)));
  return { groups, monthUah, cumUah, totalUah: run };
}

/** Future payouts across all purchases, nearest first. */
export function upcomingPayouts(purchases, todayIso, limit = Infinity) {
  return purchases
    .flatMap((p) => purchaseEvents(p).map((e) => ({ ...e, purchase: p })))
    .filter((e) => e.date > todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** Summary tiles: invested in the year, count, whole-period expected profit, next payout. */
export function buildSummary(purchases, year, todayIso) {
  const inYear = purchases.filter((p) => isoYear(p.date) === year);
  const byCcy = {};
  for (const p of inYear) byCcy[p.ccy] = round2((byCcy[p.ccy] || 0) + purchaseCost(p));
  const perPurchase = [...purchases]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ purchase: p, name: instrumentName(p), profitUah: purchaseProfitUah(p) }));
  return {
    investedUah: round2(inYear.reduce((s, p) => s + purchaseCostUah(p), 0)),
    byCcy,
    count: inYear.length,
    instruments: new Set(inYear.map(instrumentKey)).size,
    incomeUah: round2(perPurchase.reduce((s, x) => s + x.profitUah, 0)),
    perPurchase,
    next: upcomingPayouts(purchases, todayIso, 1)[0] || null,
  };
}

/** Share of each instrument in everything invested, in UAH. */
export function splitByInstrument(purchases) {
  const map = new Map();
  for (const p of purchases) {
    const key = instrumentKey(p);
    const cur = map.get(key) || { key, name: instrumentName(p), ccy: p.ccy, uah: 0 };
    cur.uah = round2(cur.uah + purchaseCostUah(p));
    map.set(key, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.uah - a.uah);
  const all = rows.reduce((s, r) => s + r.uah, 0) || 1;
  return rows.map((r) => ({ ...r, share: r.uah / all }));
}

/** Empty string when the purchase can be saved, otherwise what to fix. */
export function validatePurchase(p) {
  if (!p || !['ovdp', 'deposit'].includes(p.kind)) return 'Обери інструмент.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) return 'Вкажи дату.';
  if (!CURRENCIES.includes(p.ccy)) return 'Обери валюту.';
  if (p.ccy !== 'UAH' && !(Number(p.rate) > 0)) return 'Вкажи курс до гривні на дату покупки.';
  if (p.kind === 'deposit') {
    if (!(Number(p.amount) > 0)) return 'Вкажи суму депозиту.';
    if (!(Number(p.months) > 0)) return 'Обери строк.';
    return '';
  }
  if (!String(p.isin || '').trim()) return 'Вкажи ISIN.';
  if (!(Number(p.qty) > 0)) return 'Вкажи кількість.';
  if (!(Number(p.price) > 0)) return 'Вкажи ціну за 1 шт.';
  if (!p.mat) return 'Вкажи дату погашення.';
  return '';
}

/** Stored doc → clean list (drops junk rows, fills defaults). */
export function normalizeDoc(doc) {
  const list = Array.isArray(doc?.purchases) ? doc.purchases : [];
  return list
    .filter((p) => p && typeof p === 'object' && p.id && ['ovdp', 'deposit'].includes(p.kind))
    .map((p) => ({
      ...p,
      ccy: CURRENCIES.includes(p.ccy) ? p.ccy : 'UAH',
      rate: p.ccy === 'UAH' || !p.ccy ? 1 : Number(p.rate) || 0,
      schedule: Array.isArray(p.schedule) ? p.schedule : [],
    }));
}
