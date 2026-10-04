const MONTH_RES = [
  { month: 0, re: /січн/i },
  { month: 1, re: /лют/i },
  { month: 2, re: /берез/i },
  { month: 3, re: /квіт/i },
  { month: 4, re: /травн/i },
  { month: 5, re: /червн/i },
  { month: 6, re: /липн/i },
  { month: 7, re: /серпн/i },
  { month: 8, re: /верес/i },
  { month: 9, re: /жовтн/i },
  { month: 10, re: /листопад/i },
  { month: 11, re: /грудн/i },
];

const MAX_FOCUS_MONTHS = 3;
const MAX_FOCUS_NAMES = 6;

function hasMonth(catalog, year, month) {
  const list = catalog?.initializedMonths;
  if (!Array.isArray(list) || !list.length) return true;
  return list.some((m) => Number(m.year) === year && Number(m.month) === month);
}

function pickYearForMonth(catalog, month, mentionedYear) {
  if (Number.isFinite(mentionedYear)) return mentionedYear;
  const currentYear = Number(catalog?.currentYear);
  if (hasMonth(catalog, currentYear, month)) return currentYear;
  const list = Array.isArray(catalog?.initializedMonths) ? catalog.initializedMonths : [];
  const hit = [...list].reverse().find((m) => Number(m.month) === month);
  if (hit) return Number(hit.year);
  return currentYear;
}

function quarterMonths(q) {
  const start = (q - 1) * 3;
  return [start, start + 1, start + 2];
}

function addMonth(out, year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) return;
  const key = `${year}-${month}`;
  if (out._seen.has(key)) return;
  out._seen.add(key);
  out.months.push({ year, month });
}

/**
 * Detect months / category names mentioned in a chat question.
 * @param {string} text
 * @param {{ currentYear?: number, currentMonth?: number, initializedMonths?: Array<{year:number, month:number}>, names?: string[] }} [catalog]
 */
export function parseFocusFromQuestion(text, catalog = {}) {
  const q = String(text || '').trim();
  const months = [];
  const bag = { months, _seen: new Set() };
  if (!q) return { months, categories: [] };

  const currentYear = Number.isFinite(Number(catalog.currentYear))
    ? Number(catalog.currentYear)
    : new Date().getFullYear();
  const currentMonth = Number.isFinite(Number(catalog.currentMonth))
    ? Number(catalog.currentMonth)
    : new Date().getMonth();

  const yearHit = q.match(/\b(20\d{2})\b/);
  const mentionedYear = yearHit ? Number(yearHit[1]) : null;

  if (/весь\s+час|за\s+весь\s+час|усі\s+місяц|всі\s+місяц/i.test(q)) {
    return { months: [], categories: parseNames(q, catalog.names) };
  }

  if (/цього\s+місяц|поточн[\p{L}]*\s+місяц|цей\s+місяц/iu.test(q)) {
    addMonth(bag, currentYear, currentMonth);
  }
  if (/минул[\p{L}]*\s+місяц|попередн[\p{L}]*\s+місяц/iu.test(q)) {
    const prev = currentMonth === 0 ? 11 : currentMonth - 1;
    const year = currentMonth === 0 ? currentYear - 1 : currentYear;
    addMonth(bag, year, prev);
  }

  const qn = q.match(/(?:[1-4]|[qQ])\s*(?:квартал|кв\.?)|(?:квартал|кв\.?)\s*[1-4]|q[1-4]/i);
  if (qn) {
    const n = Number(String(qn[0]).match(/[1-4]/)?.[0] || 0);
    if (n >= 1 && n <= 4) {
      const year = mentionedYear || currentYear;
      quarterMonths(n).forEach((m) => addMonth(bag, year, m));
    }
  } else if (/цього\s+квартал|поточн[\p{L}]*\s+квартал|цей\s+квартал/iu.test(q)) {
    const n = Math.floor(currentMonth / 3) + 1;
    quarterMonths(n).forEach((m) => addMonth(bag, currentYear, m));
  }

  for (const { month, re } of MONTH_RES) {
    if (re.test(q)) addMonth(bag, pickYearForMonth(catalog, month, mentionedYear), month);
  }

  return {
    months: bag.months.slice(0, MAX_FOCUS_MONTHS),
    categories: parseNames(q, catalog.names),
  };
}

const WIDE_LOOK_RE =
  /подив[\p{L}]*\s+з\s*боку|з\s*боку\s+на|зі\s+сторон|со\s+сторон|helicopter|гелікопт|геликопт|чи\s+я\s+взагал[\p{L}]*\s+туди|чи\s+туди\s+(?:йду|іду)|чи\s+правильн[\p{L}]*\s+курс|сліпа\s+зона|слепая\s+зона|чи\s+не\s+туди\s+дивл|переоцін|всю\s+скрин|цілу\s+картин|всю\s+картин|чи\s+моя\s+поведінк|подив[\p{L}]*\s+на\s+скрин|look\s+from\s+(?:the\s+)?outside|step\s+back|не\s+ту\s+гру|інш[\p{L}]*\s+рамк|refram/iu;

/**
 * Strategic / outside-look questions should get the full dump, not a compact slice.
 * Keep this tight so "що з подушкою" stays a narrow follow-up.
 */
export function isWideLookQuestion(text) {
  const q = String(text || '').trim();
  if (q.length < 8) return false;
  return WIDE_LOOK_RE.test(q);
}

function nameStems(name) {
  const n = String(name || '').toLowerCase();
  const stems = [n];
  if (n.length >= 4) stems.push(n.slice(0, -1), n.slice(0, -2));
  return [...new Set(stems.filter((s) => s.length >= 3))];
}

function parseNames(question, names) {
  if (!Array.isArray(names) || !names.length) return [];
  const q = question.toLowerCase();
  const hits = [];
  const seen = new Set();
  const sorted = [...names]
    .map((n) => String(n || '').trim())
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (MONTH_RES.some((m) => m.re.test(key))) continue;
    if (!nameStems(name).some((stem) => q.includes(stem))) continue;
    seen.add(key);
    hits.push(name);
    if (hits.length >= MAX_FOCUS_NAMES) break;
  }
  return hits;
}
