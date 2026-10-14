// Token budget for the Skrynia data dump: which months go in full, which as one line,
// which fold into a year. Detail where the advice lives (now), totals for history.

/** Line items shown per category; the rest becomes one «ще N статей» line. */
export const ITEM_CAP = 8;
/** A focus slice is what the user asked about — show more of it. */
export const FOCUS_ITEM_CAP = 25;
/** Newest months (up to now) with categories and line items. */
export const FULL_MONTHS = 2;
/** Months before those: one line each. Anything older folds into its year. */
export const LINE_MONTHS = 10;

/**
 * @param {Array<{ y: number, m: number }>} monthsAsc initialized months, oldest first
 * @param {number} nowOrd year * 12 + month of the current month
 * @param {{ full?: number, lines?: number }} [opts]
 * @returns {{ full: Array<{y:number,m:number}>, lines: Array<{y:number,m:number}>, years: Array<{ year: number, months: Array<{y:number,m:number}> }> }}
 */
export function splitAiHistory(monthsAsc, nowOrd, opts = {}) {
  const fullN = opts.full ?? FULL_MONTHS;
  const linesN = opts.lines ?? LINE_MONTHS;
  const ord = (x) => x.y * 12 + x.m;
  const list = [...(monthsAsc || [])].sort((a, b) => ord(a) - ord(b));
  const past = list.filter((x) => ord(x) <= nowOrd);
  const future = list.filter((x) => ord(x) > nowOrd);
  const full = fullN > 0 ? past.slice(-fullN) : [];
  const rest = past.slice(0, past.length - full.length);
  const lines = [...(linesN > 0 ? rest.slice(-linesN) : []), ...future];
  const older = rest.slice(0, rest.length - (linesN > 0 ? Math.min(linesN, rest.length) : 0));
  const byYear = new Map();
  older.forEach((x) => {
    if (!byYear.has(x.y)) byYear.set(x.y, []);
    byYear.get(x.y).push(x);
  });
  const years = [...byYear.entries()].map(([year, months]) => ({ year, months }));
  return { full, lines, years };
}

/**
 * Biggest items first; the tail is summed so totals stay checkable.
 * @template {{ amount?: number | string }} T
 * @param {T[]} items
 * @param {number} cap
 * @returns {{ shown: T[], restCount: number, restSum: number }}
 */
export function capItems(items, cap) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= cap) return { shown: list, restCount: 0, restSum: 0 };
  const amount = (item) => parseFloat(item?.amount) || 0;
  const sorted = [...list].sort((a, b) => amount(b) - amount(a));
  const shown = sorted.slice(0, cap);
  const rest = sorted.slice(cap);
  return { shown, restCount: rest.length, restSum: rest.reduce((sum, item) => sum + amount(item), 0) };
}

/** Rough token count for Cyrillic-heavy text (~3 chars per token). */
export function approxTokens(text) {
  return Math.ceil(String(text || '').length / 3);
}

/** Request tokens of the whole call: system prompt plus every message. */
export function promptTokens(system, messages) {
  return approxTokens(system) + (messages || []).reduce((sum, m) => sum + approxTokens(m?.content), 0);
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('uk-UA');

/** «≈ 6 100 токенів запиту · ≈ 850 відповіді» — shown under a reply. */
export function tokenUsageLabel(requestTokens, replyText) {
  const sent = Number(requestTokens) || 0;
  if (!(sent > 0)) return '';
  const reply = approxTokens(replyText);
  return `≈ ${fmt(sent)} токенів запиту${reply > 0 ? ` · ≈ ${fmt(reply)} відповіді` : ''}`;
}
