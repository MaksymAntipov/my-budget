/** @typedef {{ year: number, month: number }} YearMonth */

export const MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
export const MONTHS_FULL = [
  'січень',
  'лютий',
  'березень',
  'квітень',
  'травень',
  'червень',
  'липень',
  'серпень',
  'вересень',
  'жовтень',
  'листопад',
  'грудень',
];
export const MONTHS_IN = [
  'січні',
  'лютому',
  'березні',
  'квітні',
  'травні',
  'червні',
  'липні',
  'серпні',
  'вересні',
  'жовтні',
  'листопаді',
  'грудні',
];

/** @param {number} year @param {number} month @param {number} delta */
export function addMonths(year, month, delta) {
  const total = year * 12 + month + delta;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { year: y, month: m };
}

/** @param {number} year @param {number} month */
export function monthLabel(year, month) {
  const name = MONTHS_SHORT[month] || '';
  const yy = String(year).slice(-2);
  return `${name} ${yy}`;
}

/**
 * Stock at the end of each month, given current stock and deposits in order.
 * Last month's stock = currentStock.
 * @param {number} currentStock
 * @param {number[]} deposits
 * @returns {number[]}
 */
export function reconstructStock(currentStock, deposits) {
  const list = Array.isArray(deposits) ? deposits : [];
  const n = list.length;
  const stocks = new Array(n);
  let acc = Number(currentStock) || 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    stocks[i] = Math.max(0, acc);
    acc -= Number(list[i]) || 0;
  }
  return stocks;
}

/**
 * Average of the last `take` values (use 0 months as 0, still count them).
 * @param {number[]} values
 * @param {number} [take]
 */
export function trailingAverage(values, take = 3) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return 0;
  const slice = list.slice(-Math.max(1, take));
  const sum = slice.reduce((s, v) => s + (Number(v) || 0), 0);
  return sum / slice.length;
}

/**
 * @param {number} remaining
 * @param {number} avgMonthly
 * @param {number} fromYear
 * @param {number} fromMonth
 * @returns {{ kind: 'done' | 'stalled' | 'date', months?: number, year?: number, month?: number }}
 */
export function forecastFinish(remaining, avgMonthly, fromYear, fromMonth) {
  const left = Number(remaining) || 0;
  if (left <= 0) return { kind: 'done' };
  const pace = Number(avgMonthly) || 0;
  if (pace <= 0) return { kind: 'stalled' };
  const months = Math.max(1, Math.ceil(left / pace));
  const end = addMonths(fromYear, fromMonth, months);
  return { kind: 'date', months, year: end.year, month: end.month };
}

/** @param {{ kind: string, year?: number, month?: number }} forecast */
export function formatFinishDate(forecast) {
  if (forecast?.kind !== 'date') return '';
  const name = MONTHS_FULL[forecast.month] || '';
  return `${name} ${forecast.year}`;
}

/** @param {{ kind: string, year?: number, month?: number }} forecast */
export function formatFinishIn(forecast) {
  if (forecast?.kind !== 'date') return '';
  const name = MONTHS_IN[forecast.month] || '';
  return `у ${name} ${forecast.year}`;
}

/** @param {number} avg */
export function pacePhrase(avg) {
  return `~${Math.round(Number(avg) || 0).toLocaleString('uk-UA')} ₴/міс`;
}

/** @param {'pillow' | 'debt'} kind */
export function paceHint(kind) {
  return kind === 'debt'
    ? 'Середня сума погашень за останні 3 місяці.'
    : 'Середня сума внесків у подушку за останні 3 місяці.';
}

export function targetHint(kind) {
  if (kind === 'debt') {
    return 'Ціль — повністю погасити борги.';
  }
  return 'Ціль — покрити 6 місяців обов’язкових витрат. Відсоток показує, яка частина вже накопичена.';
}

export function deltaHint(kind) {
  return kind === 'debt'
    ? 'Наскільки змінилася сума боргів за останній місяць.'
    : 'Наскільки змінилася подушка за останній місяць.';
}

/**
 * @param {{ kind: string, year?: number, month?: number }} forecast
 * @param {{ avg: number, unit?: string }} pace
 * @param {'pillow' | 'debt'} kind
 */
export function motivationLine(forecast, pace, kind) {
  const avgStr = Math.round(Number(pace?.avg) || 0).toLocaleString('uk-UA');
  if (forecast?.kind === 'done') {
    return kind === 'debt' ? 'Борги погашені.' : 'Подушка накопичена.';
  }
  if (forecast?.kind === 'no-target') {
    return 'Познач обов’язкові витрати — з’явиться ціль подушки.';
  }
  if (forecast?.kind === 'stalled') {
    return kind === 'debt'
      ? 'Без погашень борги не закриються.'
      : 'Без внесків подушка не накопичиться.';
  }
  const when = formatFinishIn(forecast);
  if (kind === 'debt') {
    return `Якщо далі гасити ~${avgStr} ₴/міс — борги будуть погашені ${when}.`;
  }
  return `Якщо далі класти ~${avgStr} ₴/міс — подушка буде накопичена ${when}.`;
}

/** Month object has a calendar start or any money rows. */
export function monthHasFacts(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.initialized) return true;
  for (const inc of data.incomes || []) {
    if ((parseFloat(inc.amount) || 0) > 0) return true;
  }
  for (const cat of data.expenses || []) {
    for (const item of cat.items || []) {
      if ((parseFloat(item.amount) || 0) > 0) return true;
      if (item.envelopeId || item.debtId) return true;
    }
  }
  return false;
}

/** @param {Record<string, Record<string, unknown>>} appData */
export function listFactMonths(appData) {
  const out = [];
  if (!appData || typeof appData !== 'object') return out;
  for (const y of Object.keys(appData)) {
    const year = Number(y);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) continue;
    const months = appData[y];
    if (!months || typeof months !== 'object') continue;
    for (const m of Object.keys(months)) {
      const month = Number(m);
      if (!Number.isInteger(month) || month < 0 || month > 11) continue;
      if (monthHasFacts(months[m])) out.push({ year, month });
    }
  }
  out.sort((a, b) => a.year - b.year || a.month - b.month);
  return out;
}

/**
 * Inclusive calendar from the first fact month through `through`.
 * Does not extend past `through` even if later months exist in `facts`.
 * @param {{ year: number, month: number }[]} facts
 */
export function fillMonthRange(facts, throughYear, throughMonth) {
  if (!Array.isArray(facts) || !facts.length) return [];
  const start = facts[0];
  let endY = Number(throughYear);
  let endM = Number(throughMonth);
  if (!Number.isInteger(endY) || !Number.isInteger(endM)) {
    const last = facts[facts.length - 1];
    endY = last.year;
    endM = last.month;
  }
  if (endY < start.year || (endY === start.year && endM < start.month)) {
    return [{ year: start.year, month: start.month }];
  }
  const out = [];
  let y = start.year;
  let m = start.month;
  let guard = 0;
  while (y < endY || (endY === y && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (++guard > 240) break;
  }
  return out;
}

/** @param {{ year: number, month: number }} a @param {{ year: number, month: number }} b */
export function cmpMonth(a, b) {
  return a.year - b.year || a.month - b.month;
}

/**
 * Continuous months from the first fact through today.
 * Copied/opened months in the future are ignored unless there is no past data.
 * @param {Record<string, Record<string, unknown>>} appData
 */
export function listRunwayMonths(appData, todayYear, todayMonth) {
  const facts = listFactMonths(appData);
  if (!facts.length) return [];
  const today = { year: Number(todayYear), month: Number(todayMonth) };
  const upToToday = Number.isInteger(today.year) && Number.isInteger(today.month)
    ? facts.filter((p) => cmpMonth(p, today) <= 0)
    : facts;
  const use = upToToday.length ? upToToday : facts;
  const through = upToToday.length ? today : use[use.length - 1];
  return fillMonthRange(use, through.year, through.month);
}

/** Y max that keeps a small fact line readable when the target is far away. */
export function chartYMax(data, target) {
  const values = Array.isArray(data) ? data.map((v) => Number(v) || 0) : [];
  const dataMax = Math.max(0, ...values);
  const t = Number(target) || 0;
  if (dataMax > 0 && t > 0 && t <= dataMax * 2.5) return Math.max(dataMax, t) * 1.08;
  if (dataMax > 0) return dataMax * 1.35;
  if (t > 0) return t * 1.08;
  return 0;
}

/**
 * Deposits into emergency jars for one month (all savings rows, not only the first category).
 * @param {unknown[]} expenses
 * @param {{ id?: unknown, name?: string }[]} emergencyJars
 */
export function sumEmergencyDeposits(expenses, emergencyJars) {
  const jars = Array.isArray(emergencyJars) ? emergencyJars : [];
  const ids = new Set(jars.map((j) => String(j.id)));
  const names = jars.map((j) => String(j.name || '')).filter(Boolean);
  if (!ids.size) return 0;
  let sum = 0;
  for (const cat of expenses || []) {
    const savingsCat = Boolean(cat?.isSavings) || /заощад/i.test(String(cat?.name || ''));
    for (const item of cat.items || []) {
      const amount = parseFloat(item.amount) || 0;
      if (!amount) continue;
      const eid = item.envelopeId != null && item.envelopeId !== '' ? String(item.envelopeId) : '';
      if (eid && ids.has(eid)) {
        sum += amount;
        continue;
      }
      if (savingsCat && names.some((n) => n && String(item.name || '').includes(n))) {
        sum += amount;
        continue;
      }
      if (savingsCat && !eid && jars.length === 1) sum += amount;
    }
  }
  return sum;
}

/** YYYYMM stamp from is_archived, or 0 if it is not a month. */
export function archiveMonthStamp(debt) {
  const abs = Math.abs(Number(debt?.is_archived) || 0);
  return abs >= 200000 ? abs : 0;
}

/**
 * Remaining of one debt at the end of a month.
 * Archived debts stay in the past until their archive month, then 0.
 * @param {object} debt
 * @param {number} year
 * @param {number} month
 * @param {number} paidThrough  app payments up to this month
 */
export function debtRemainingInMonth(debt, year, month, paidThrough, todayStamp) {
  if (!debt) return 0;
  const viewDate = Number(year) * 100 + Number(month);
  if (debt.start_year !== undefined && debt.start_year !== null && debt.start_month !== undefined && debt.start_month !== null) {
    const startDate = Number(debt.start_year) * 100 + Number(debt.start_month);
    if (Number.isFinite(startDate) && viewDate < startDate) return 0;
  }
  let archivedAt = archiveMonthStamp(debt);
  const remainingAmt = parseFloat(debt.remaining_amount);
  const paidOff = Number.isFinite(remainingAmt) && remainingAmt <= 0;
  if (archivedAt && paidOff && todayStamp && archivedAt > todayStamp) archivedAt = todayStamp;
  if (archivedAt && viewDate >= archivedAt) return 0;
  const total = parseFloat(debt.total_amount) || 0;
  const paid = Number(paidThrough) || 0;
  const outside = archivedAt ? 0 : Math.max(0, parseFloat(debt.outside_paid) || 0);
  return Math.max(0, total - paid - outside);
}

/**
 * Remaining series: last month = current remaining; going back, add that month's paydowns.
 * @param {number} currentRemaining
 * @param {number[]} paydowns
 */
export function reconstructDrawdown(currentRemaining, paydowns) {
  const list = Array.isArray(paydowns) ? paydowns : [];
  const stocks = new Array(list.length);
  let acc = Number(currentRemaining) || 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    stocks[i] = Math.max(0, acc);
    acc += Number(list[i]) || 0;
  }
  return stocks;
}

/** @param {unknown[]} expenses */
export function sumDebtPayments(expenses) {
  let sum = 0;
  for (const cat of expenses || []) {
    for (const item of cat.items || []) {
      if (cat?.name === 'Погашення боргів' || item.debtId) {
        sum += parseFloat(item.amount) || 0;
      }
    }
  }
  return sum;
}

/** @param {number} n */
export function formatHeroUah(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} ₴`;
}

/** Compact axis / end-tag, gecko-style. */
export function formatCompactUah(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = v / 1000;
    const shown = Math.abs(k - Math.round(k)) < 0.05 ? String(Math.round(k)) : (Math.round(k * 10) / 10).toFixed(1);
    return `${shown.replace('.', ',')} тис.`;
  }
  return `${v.toLocaleString('uk-UA')} ₴`;
}

/**
 * @param {number[]} values
 * @returns {{ abs: number, pct: number, hasPrev: boolean, fromZero: boolean }}
 */
export function seriesDelta(values) {
  const list = Array.isArray(values) ? values : [];
  if (list.length < 2) return { abs: 0, pct: 0, hasPrev: false, fromZero: false };
  const prev = Number(list[list.length - 2]) || 0;
  const last = Number(list[list.length - 1]) || 0;
  const abs = last - prev;
  const fromZero = prev === 0;
  const pct = fromZero ? (last === 0 ? 0 : 100) : (abs / Math.abs(prev)) * 100;
  return { abs, pct, hasPrev: true, fromZero };
}

/**
 * @param {{ abs: number, pct: number, hasPrev: boolean, fromZero?: boolean }} delta
 * @param {{ wantUp: boolean }} opts
 * @returns {null | { text: string, tone: 'up' | 'down' | 'flat' }}
 */
export function deltaBadge(delta, opts) {
  if (!delta?.hasPrev) return null;
  const abs = Math.round(delta.abs);
  if (abs === 0) return { text: 'без змін · міс', tone: 'flat' };
  const up = abs > 0;
  const arrow = up ? '▲' : '▼';
  const good = opts?.wantUp ? up : !up;
  const text = delta.fromZero
    ? `${arrow} ${Math.abs(abs).toLocaleString('uk-UA')} ₴ · міс`
    : `${arrow} ${Math.abs(delta.pct).toFixed(1).replace(/\.0$/, '').replace('.', ',')}% · міс`;
  return { text, tone: good ? 'up' : 'down' };
}

/** @param {number} now @param {number} target @param {'pillow' | 'debt'} kind */
export function targetSubtitle(now, target, kind) {
  if (kind === 'debt') return 'ціль 0 ₴';
  const t = Number(target) || 0;
  if (t <= 0) return 'познач обов’язкові — з’явиться ціль';
  const pct = Math.max(0, Math.round(((Number(now) || 0) / t) * 100));
  return `ціль ${Math.round(t).toLocaleString('uk-UA')} ₴ · ${pct}%`;
}

export const RUNWAY_AI_SYSTEM =
  "Ти аналітик MySkrynia. Відповідай українською. Цифри лише з блоку ФАКТ: не вигадуй доходи, банки, курси, місяці й суми. Немає в факті — так і скажи. Не став питань і не проси уточнень. Не пиши блок «Зараз»: поточний темп уже на екрані над графіком. Два блоки. ## Рекомендація: з доходу мінус обов'язкові порахуй вільний залишок; яку суму/міс гасити борги і яку відкладати в подушку (не ріж обов'язкові; бажані можна різати); нову дату фінішу = залишок ÷ рекомендована сума, від останнього місяця у факті. ## Оптимістичний варіант: скопіюй речення з блоку ОПТИМІСТИЧНИЙ ВАРІАНТ без зміни цифр і дат. Коротко.";

export const RUNWAY_AI_TASK =
  'Напиши розбір без блоку «Зараз»: рекомендація з доходу і оптимістичний варіант — максимум боргів і подушки за один місяць, спочатку борги, потім подушка.';

function uahLine(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} ₴`;
}

function leftoverUah(s) {
  return (Number(s.incomeUah) || 0) - (Number(s.essentialsUah) || 0);
}

/**
 * Largest month-to-month move. `down` = max drop, `up` = max rise.
 * @param {number[]} values
 * @param {'down' | 'up'} want
 * @returns {{ amount: number, index: number }}
 */
export function maxMonthDelta(values, want) {
  const list = Array.isArray(values) ? values.map((v) => Number(v) || 0) : [];
  let amount = 0;
  let index = -1;
  for (let i = 1; i < list.length; i += 1) {
    const d = want === 'down' ? list[i - 1] - list[i] : list[i] - list[i - 1];
    if (d > amount) {
      amount = d;
      index = i;
    }
  }
  return { amount, index };
}

/**
 * Largest same-month total: debt drop + pillow rise.
 * @param {{ pillow?: number, debt?: number }[]} points
 * @returns {{ amount: number, index: number }}
 */
export function maxCombinedContribution(points) {
  const list = Array.isArray(points) ? points : [];
  let amount = 0;
  let index = -1;
  for (let i = 1; i < list.length; i += 1) {
    const debtDrop = Math.max(0, (Number(list[i - 1].debt) || 0) - (Number(list[i].debt) || 0));
    const pillowRise = Math.max(0, (Number(list[i].pillow) || 0) - (Number(list[i - 1].pillow) || 0));
    const total = debtDrop + pillowRise;
    if (total > amount) {
      amount = total;
      index = i;
    }
  }
  return { amount, index };
}

function lastPointDate(points) {
  const last = (points || [])[(points || []).length - 1];
  const year = Number(last?.year);
  const month = Number(last?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  return { year, month };
}

/** Ready-made optimistic sentences: one combined pace, debt then pillow. */
export function optimisticSentences(snapshot) {
  const s = snapshot || {};
  const points = s.points || [];
  const from = lastPointDate(points);
  const { amount } = maxCombinedContribution(points);
  if (amount <= 0) return [];

  const out = [
    `Максимальна сума внесків за місяць (борги та подушка разом) була ${uahLine(amount)}.`,
  ];

  let afterDebt = from;
  if (s.hasDebts) {
    const fc = from ? forecastFinish(Number(s.debtNow) || 0, amount, from.year, from.month) : { kind: 'stalled' };
    if (fc.kind === 'date') {
      out.push(`Якщо спрямувати її спочатку на борги, вони закриються ${formatFinishIn(fc)}.`);
      afterDebt = addMonths(fc.year, fc.month, 1);
    } else if (fc.kind === 'done') {
      out.push('Борги вже погашені.');
    }
  }

  const pillowLeft = Math.max(0, (Number(s.pillowTarget) || 0) - (Number(s.pillowNow) || 0));
  if (s.pillowTarget > 0 && pillowLeft > 0 && afterDebt) {
    const pfc = forecastFinish(pillowLeft, amount, afterDebt.year, afterDebt.month);
    if (pfc.kind === 'date') {
      out.push(
        `Після цього тим самим темпом подушка буде накопичена ${formatFinishIn(pfc)}.`,
      );
    }
  }
  return out;
}

/** Compact fact dump for the runway recommendation. */
export function buildRunwayDump(snapshot) {
  const s = snapshot || {};
  const points = s.points || [];
  const last = points[points.length - 1];
  const pillowLine = points.map((p) => `${p.label} ${Math.round(p.pillow || 0)}`).join(', ');
  const debtLine = points.map((p) => `${p.label} ${Math.round(p.debt || 0)}`).join(', ');
  const pillowLeft = Math.max(0, (Number(s.pillowTarget) || 0) - (Number(s.pillowNow) || 0));
  const lines = [
    'ФАКТ',
    `останній місяць у ряді: ${last?.label || '—'}`,
    `дохід цього місяця: ${uahLine(s.incomeUah)}`,
    `обов'язкові цього місяця: ${uahLine(s.essentialsUah)}`,
    `бажані (не обов'язкові) цього місяця: ${uahLine(s.wantsUah)}`,
    `вільний після обов'язкових: ${uahLine(leftoverUah(s))}`,
    `подушка зараз: ${uahLine(s.pillowNow)}`,
    `ціль подушки: ${s.pillowTarget > 0 ? uahLine(s.pillowTarget) : 'немає (не позначені обов’язкові)'}`,
    `ще треба на подушку: ${s.pillowTarget > 0 ? uahLine(pillowLeft) : 'немає цілі'}`,
    `темп подушки за 3 міс: ${uahLine(s.pillowAvg)}/міс`,
    `вердикт подушки: ${motivationLine(s.pillowForecast, { avg: s.pillowAvg }, 'pillow')}`,
    `ряд подушки: ${pillowLine || '—'}`,
  ];
  if (s.hasDebts) {
    lines.push(
      `борги зараз: ${uahLine(s.debtNow)}`,
      `темп погашення за 3 міс: ${uahLine(s.debtAvg)}/міс`,
      `вердикт боргів: ${motivationLine(s.debtForecast, { avg: s.debtAvg }, 'debt')}`,
      `ряд боргів: ${debtLine || '—'}`,
    );
  } else {
    lines.push('борги: немає відкритих');
  }
  const optimistic = optimisticSentences(s);
  if (optimistic.length) {
    lines.push('ОПТИМІСТИЧНИЙ ВАРІАНТ', ...optimistic);
  }
  return lines.join('\n');
}
