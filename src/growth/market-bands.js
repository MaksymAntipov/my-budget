/** Curated IT salary bands for the growth prompt. Refresh quarterly. */

import {
  GENERIC_ROLES,
  firstId,
  inferDomainFromJob,
  inferRoleForDomain,
} from './trajectory.js';

export const MARKET_SNAPSHOT = {
  asOf: '2026-08',
  unit: 'USD/міс',
  note: 'Орієнтир, не офер. UA ≈ net/FOP; EU/US remote ≈ типовий контрактний чек. Джерела: публічні зрізи DOU Salaries, Djinni, відкриті репорти Levels-типу. Є лише для частини IT-ролей; інакше UNKNOWN.',
};

export const ROLE_FAMILIES = [
  { id: 'qa-manual', label: 'Manual QA / QA Engineer' },
  { id: 'aqa-js', label: 'AQA (JS/TS + Playwright)' },
  { id: 'sdet', label: 'SDET' },
  { id: 'qa-lead', label: 'QA Lead / Test Manager' },
  { id: 'other-it', label: 'Інша IT-роль' },
  { id: 'non-it', label: 'Поза IT' },
  ...GENERIC_ROLES,
];

export const LEVELS = [
  { id: 'junior', label: 'Junior' },
  { id: 'middle', label: 'Middle' },
  { id: 'senior', label: 'Senior' },
  { id: 'lead', label: 'Lead' },
];

export const GEOS = [
  { id: 'ua', label: 'Україна' },
  { id: 'eu-remote', label: 'EU remote' },
  { id: 'us-remote', label: 'US remote' },
];

const B = (p25, p50, p75) => ({ p25, p50, p75 });

/** @type {Record<string, Record<string, Record<string, {p25:number,p50:number,p75:number}>>>} */
export const BANDS = {
  'qa-manual': {
    junior: { ua: B(800, 1100, 1500), 'eu-remote': B(1500, 2200, 2800), 'us-remote': B(3500, 5000, 6500) },
    middle: { ua: B(1200, 1800, 2400), 'eu-remote': B(2200, 3000, 4000), 'us-remote': B(4500, 6500, 8500) },
    senior: { ua: B(2000, 2800, 3800), 'eu-remote': B(3200, 4200, 5500), 'us-remote': B(6000, 8500, 11000) },
    lead: { ua: B(2800, 3800, 5000), 'eu-remote': B(4200, 5500, 7000), 'us-remote': B(8000, 11000, 14000) },
  },
  'aqa-js': {
    junior: { ua: B(1200, 1600, 2100), 'eu-remote': B(2000, 2800, 3500), 'us-remote': B(4500, 6000, 8000) },
    middle: { ua: B(1800, 2500, 3200), 'eu-remote': B(3000, 4000, 5200), 'us-remote': B(6000, 8500, 11000) },
    senior: { ua: B(2800, 4000, 5200), 'eu-remote': B(4200, 5500, 7200), 'us-remote': B(8000, 11000, 14500) },
    lead: { ua: B(4000, 5200, 6500), 'eu-remote': B(5500, 7000, 9000), 'us-remote': B(11000, 14000, 18000) },
  },
  sdet: {
    junior: { ua: B(1600, 2200, 2800), 'eu-remote': B(2500, 3500, 4500), 'us-remote': B(5500, 7500, 9500) },
    middle: { ua: B(2500, 3500, 4500), 'eu-remote': B(3800, 5000, 6500), 'us-remote': B(7500, 10000, 13000) },
    senior: { ua: B(3500, 4800, 6200), 'eu-remote': B(5000, 7000, 9000), 'us-remote': B(10000, 14000, 18000) },
    lead: { ua: B(5000, 6500, 8000), 'eu-remote': B(7000, 9000, 11500), 'us-remote': B(13000, 17000, 22000) },
  },
  'qa-lead': {
    middle: { ua: B(2500, 3500, 4500), 'eu-remote': B(3800, 5000, 6500), 'us-remote': B(7500, 10000, 13000) },
    senior: { ua: B(3500, 4800, 6000), 'eu-remote': B(5000, 6800, 8500), 'us-remote': B(10000, 13500, 17000) },
    lead: { ua: B(4500, 6000, 7500), 'eu-remote': B(6500, 8500, 11000), 'us-remote': B(12000, 16000, 20000) },
  },
};

const ADJACENT = {
  'qa-manual': ['aqa-js'],
  'aqa-js': ['sdet'],
  sdet: ['qa-lead'],
  'qa-lead': ['sdet'],
};

const GEO_GATES = {
  'us-remote': 'English B2+ (без цього бенд не вважати досяжним за 12 міс)',
  'eu-remote': 'English B1+ / робоча англійська',
};

export function roleLabel(id) {
  return ROLE_FAMILIES.find((r) => r.id === id)?.label || id || '';
}

export function levelLabel(id) {
  return LEVELS.find((l) => l.id === id)?.label || id || '';
}

export function geoLabel(id) {
  return GEOS.find((g) => g.id === id)?.label || id || '';
}

/**
 * @param {string} marketChoice
 * @param {string} [mobility]
 * @returns {{ currentGeo: string, targetGeos: string[] }}
 */
export function mapMarketToGeos(marketChoice, mobility = '') {
  const mob = firstId(mobility);
  if (mob === 'local-only') {
    return { currentGeo: 'ua', targetGeos: ['ua'] };
  }
  const raw = String(marketChoice || '');
  if (raw.includes('Локальний')) {
    return { currentGeo: 'ua', targetGeos: ['ua'] };
  }
  const canRemote = mob === 'remote-ok' || mob === 'relocate-ok' || !mob;
  if (raw.includes('Глобальний')) {
    return { currentGeo: 'ua', targetGeos: canRemote ? ['eu-remote', 'us-remote'] : ['ua'] };
  }
  if (canRemote) {
    return { currentGeo: 'ua', targetGeos: ['ua', 'eu-remote', 'us-remote'] };
  }
  return { currentGeo: 'ua', targetGeos: ['ua'] };
}

export function inferRoleFamilyForProfile(job, domain) {
  return inferRoleForDomain(job, domain, inferRoleFamilyFromJob);
}

/**
 * @param {string} [job]
 * @returns {string | ''}
 */
export function inferRoleFamilyFromJob(job) {
  const t = String(job || '').toLowerCase();
  if (!t.trim()) return '';
  if (/\bsdet\b/.test(t)) return 'sdet';
  if (/aqa|автомат|playwright|automation|автотест/.test(t)) return 'aqa-js';
  if (/qa\s*lead|test manager|head of qa|керівник.*тест/.test(t)) return 'qa-lead';
  if (/\bqa\b|тест|quality/.test(t)) return 'qa-manual';
  if (/dev|engineer|it |програм|front|back|fullstack/.test(t)) return 'other-it';
  return 'non-it';
}

/**
 * @param {string} [job]
 * @returns {string | ''}
 */
export function inferLevelFromJob(job) {
  const t = String(job || '').toLowerCase();
  if (!t.trim()) return '';
  if (/\bjunior\b|джун|початків/.test(t)) return 'junior';
  if (/\blead\b|head\b|principal|керівник/.test(t)) return 'lead';
  if (/\bsenior\b|сеньйор|старш|сильн|експерт/.test(t)) return 'senior';
  if (/\bmiddle\b|мідл|досвідчен|впевнен/.test(t)) return 'middle';
  return '';
}

/**
 * @param {string} [text]
 * @param {number} [uahPerUsd]
 * @returns {number | null}
 */
export function parseUsdAmount(text, uahPerUsd = 0) {
  if (!text) return null;
  const raw = String(text);
  const compact = raw.replace(/\s/g, '').replace(/,/g, '');
  const m = compact.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const lower = raw.toLowerCase();
  const isUah = /₴|грн|uah/.test(lower);
  const isUsd = /\$|usd|бакс|долар/.test(lower);
  if (isUah && uahPerUsd > 0) return n / uahPerUsd;
  if (isUsd) return n;
  if (n > 20000 && uahPerUsd > 0) return n / uahPerUsd;
  return n;
}

/**
 * @param {string} roleFamily
 * @param {string} level
 * @param {string} geo
 * @returns {{p25:number,p50:number,p75:number} | null}
 */
export function getBand(roleFamily, level, geo) {
  return BANDS[roleFamily]?.[level]?.[geo] || null;
}

function formatBand(band) {
  if (!band) return 'UNKNOWN';
  return `p25 $${band.p25} / p50 $${band.p50} / p75 $${band.p75}`;
}

function formatUsd(n) {
  if (n == null || !Number.isFinite(n)) return 'UNKNOWN';
  return `$${Math.round(n)}`;
}

/**
 * @param {{p25:number,p50:number,p75:number} | null} band
 * @param {number | null} targetUsd
 */
export function compareTargetToBand(band, targetUsd) {
  if (!band || targetUsd == null || !Number.isFinite(targetUsd)) return 'unknown';
  if (targetUsd <= band.p50) return 'within-p50';
  if (targetUsd <= band.p75) return 'within-p75';
  if (targetUsd <= band.p75 * 1.15) return 'stretch';
  return 'above-market';
}

const COMPARE_LABELS = {
  'within-p50': 'точка Б у межах p50 поточної ролі',
  'within-p75': 'точка Б між p50 і p75 поточної ролі (натяжка, але в ринку)',
  stretch: 'точка Б трохи вище p75 — stretch, не дефолт',
  'above-market': 'точка Б ВИЩЕ p75 поточної ролі на цьому гео — поточна посада стелю не закриває',
  unknown: 'немає бенду для порівняння (UNKNOWN)',
};

/**
 * Build markdown block for the growth prompt.
 * @param {{
 *   roleFamily?: string,
 *   level?: string,
 *   market?: string,
 *   mobility?: string,
 *   domain?: string,
 *   currentIncomeUsd?: number | null,
 *   targetIncomeUsd?: number | null,
 *   jobTitle?: string,
 * }} opts
 */
export function buildMarketAiSection(opts = {}) {
  const roleFamily = firstId(opts.roleFamily);
  const level = firstId(opts.level);
  const market = firstId(opts.market);
  const mobility = firstId(opts.mobility);
  const domain = firstId(opts.domain) || inferDomainFromJob(opts.jobTitle);
  const { currentGeo, targetGeos } = mapMarketToGeos(market, mobility);
  const currentIncomeUsd = Number.isFinite(opts.currentIncomeUsd) ? opts.currentIncomeUsd : null;
  const targetIncomeUsd = Number.isFinite(opts.targetIncomeUsd) ? opts.targetIncomeUsd : null;
  const showRemoteGates = targetGeos.some((g) => g === 'eu-remote' || g === 'us-remote');
  const isQaTrack = /^(qa-manual|aqa-js|sdet|qa-lead)$/.test(roleFamily);

  let out = `### РИНОК / СТЕЛЯ ГРИ (зріз ${MARKET_SNAPSHOT.asOf}, ${MARKET_SNAPSHOT.unit})\n`;
  out += `${MARKET_SNAPSHOT.note}\n`;
  out += `Це внутрішня таблиця-орієнтир, не live-API. Не підміняй цифри «з пам'яті». Якщо рядок UNKNOWN — так і пиши, не вигадуй зарплату.\n`;
  if (opts.jobTitle) out += `Посада (текст): ${String(opts.jobTitle).trim()}\n`;
  out += `Домен: ${domain || 'UNKNOWN'}\n`;
  out += `Сім'я ролі: ${roleFamily ? `${roleLabel(roleFamily)} [${roleFamily}]` : 'UNKNOWN'}\n`;
  out += `Рівень: ${level ? levelLabel(level) : 'UNKNOWN'}\n`;
  out += `Мобільність: ${mobility || 'не вказано'}\n`;
  out += `Гео поточне (припущення): ${geoLabel(currentGeo)}\n`;
  out += `Цільові гео: ${targetGeos.map(geoLabel).join(', ')}\n`;
  out += `Дохід зараз (кешфлоу): ${formatUsd(currentIncomeUsd)}\n`;
  out += `Точка Б: ${formatUsd(targetIncomeUsd)}\n\n`;
  out += `Рамка: 1) яка зараз гра (найм / сам / своя справа); 2) яка стеля цієї гри при цій мобільності; 3) чи точка Б живе в іншій грі. Суміжний крок = +1 у тій самій економіці навички, не зміна ідентичності.\n`;
  if (mobility === 'local-only') {
    out += `Мобільність «лише локально»: не пропонуй remote/релокейт/US-EU як основний шлях.\n`;
  }

  const hasFamilyBands = Boolean(BANDS[roleFamily]);
  if (!roleFamily || !level || !hasFamilyBands) {
    out += `\nБенд поточної ролі: UNKNOWN (немає в таблиці).\n`;
    out += `Траєкторію все одно побудуй з каси, навичок, мобільності та головного вектора. Не вигадуй зарплатні цифри. Назви 2–3 суміжні ігри в ЦЬОМУ домені.\n`;
    return out;
  }

  const currentBand = getBand(roleFamily, level, currentGeo);
  out += `Поточна роль на ${geoLabel(currentGeo)}: ${formatBand(currentBand)}\n`;
  const cmp = compareTargetToBand(currentBand, targetIncomeUsd);
  out += `Зіставлення з точкою Б: ${COMPARE_LABELS[cmp]}\n`;

  const geosToShow = [...new Set([currentGeo, ...targetGeos])];
  out += `\nБенди поточної ролі за гео:\n`;
  geosToShow.forEach((geo) => {
    const band = getBand(roleFamily, level, geo);
    const gate = showRemoteGates && GEO_GATES[geo] ? ` | гейт: ${GEO_GATES[geo]}` : '';
    out += `  - ${geoLabel(geo)}: ${formatBand(band)}${gate}\n`;
  });

  const adj = ADJACENT[roleFamily] || [];
  if (adj.length) {
    out += `\nСуміжні ролі (інший маршрут, той самий рівень):\n`;
    adj.forEach((adjRole) => {
      geosToShow.forEach((geo) => {
        const band = getBand(adjRole, level, geo);
        const gate = showRemoteGates && GEO_GATES[geo] ? ` | гейт: ${GEO_GATES[geo]}` : '';
        out += `  - ${roleLabel(adjRole)} / ${geoLabel(geo)}: ${formatBand(band)}${gate}\n`;
      });
    });
  }

  if (targetIncomeUsd != null) {
    const hits = [];
    Object.keys(BANDS).forEach((rid) => {
      geosToShow.forEach((geo) => {
        const band = getBand(rid, level, geo);
        if (band && band.p50 >= targetIncomeUsd) {
          hits.push(`${roleLabel(rid)} / ${geoLabel(geo)} (p50 $${band.p50})`);
        }
      });
    });
    out += `\nДовідка (не новий курс; не змінюй головний вектор лише бо інша роль ближча до точки Б): де p50 ≥ точки Б, той самий рівень: `;
    out += hits.length ? hits.join('; ') : 'немає — потрібен інший рівень, інша роль, інша гра або інший горизонт';
    out += `\n`;
  }

  if (isQaTrack && showRemoteGates) {
    out += `\nГейт навичок: бенд AQA/SDET без робочого портфоліо автотестів рахуй ближче до Manual QA. US remote без English B2+ — не досяжний маршрут.\n`;
  } else if (isQaTrack) {
    out += `\nГейт навичок: бенд AQA/SDET без робочого портфоліо автотестів рахуй ближче до Manual QA.\n`;
  }
  return out;
}
