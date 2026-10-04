export const DOMAINS = [
  { id: 'it', label: 'IT' },
  { id: 'services', label: 'Послуги / експертиза' },
  { id: 'trade', label: 'Торгівля / HoReCa / своя точка' },
  { id: 'creative', label: 'Креатив / контент' },
  { id: 'other', label: 'Інше' },
];

export const VECTOR_OPTIONS = [
  { id: 'same-seat', label: 'Той самий стілець, вищий чек' },
  { id: 'new-seat', label: 'Інший стілець / інша сфера' },
  { id: 'independent', label: 'Продаю вміння сам' },
  { id: 'own-operation', label: 'Масштабую або чиню свою справу' },
  { id: 'portfolio', label: 'Друга лінія доходу' },
];

export const MOBILITY_OPTIONS = [
  { id: 'local-only', label: 'Лише локально (без remote і релокейту)' },
  { id: 'remote-ok', label: 'Можу працювати remote' },
  { id: 'relocate-ok', label: 'Можу змінити місто / країну' },
];

export const OPERATION_OPTIONS = [
  { id: 'none', label: 'Немає своєї справи' },
  { id: 'profit', label: 'Є справа — в плюс' },
  { id: 'zero', label: 'Є справа — в нуль' },
  { id: 'loss', label: 'Є справа — в мінус' },
];

export const GENERIC_ROLES = [
  { id: 'specialist', label: 'Спеціаліст (найм)' },
  { id: 'manager', label: 'Керівник' },
  { id: 'owner', label: 'Власник / ФОП' },
  { id: 'independent', label: 'Незалежний (сам продаю)' },
];

const LEGACY_VECTORS = {
  'Вертикальний (ріст ЗП на поточній роботі)': 'same-seat',
  'Горизонтальний (нова компанія / сфера)': 'new-seat',
  'Автономний (фріланс / консалтинг)': 'independent',
  'Бізнес (своє агентство / стартап)': 'own-operation',
};

export function domainLabel(id) {
  return DOMAINS.find((d) => d.id === id)?.label || id || '';
}

export function vectorLabel(id) {
  return VECTOR_OPTIONS.find((v) => v.id === id)?.label || id || '';
}

export function mobilityLabel(id) {
  return MOBILITY_OPTIONS.find((m) => m.id === id)?.label || id || '';
}

export function operationLabel(id) {
  return OPERATION_OPTIONS.find((o) => o.id === id)?.label || id || '';
}

/**
 * Only when the person said it in Point A. Do not invent a business.
 * @param {string} [job]
 * @returns {string}
 */
export function inferOperationFromJob(job) {
  const t = String(job || '').toLowerCase();
  if (!t.trim()) return '';
  if (/немає своєї|без своєї справи|немає бізнесу/.test(t)) return 'none';
  if (/в мінус|в минус|збитк|у збитк|at a loss/.test(t)) return 'loss';
  if (/в нуль|в ноль|беззбит|в нулі/.test(t)) return 'zero';
  if (/в плюс|прибутк|окуп/.test(t)) return 'profit';
  return '';
}

export function firstId(raw) {
  return String(raw || '').split('|')[0].trim();
}

/**
 * @param {string} [raw]
 * @returns {string[]}
 */
export function migrateLegacyVectorIds(raw) {
  const parts = String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  const known = new Set(VECTOR_OPTIONS.map((v) => v.id));
  return parts
    .map((p) => LEGACY_VECTORS[p] || (known.has(p) ? p : ''))
    .filter(Boolean);
}

/**
 * @param {string} [job]
 * @returns {string}
 */
export function inferDomainFromJob(job) {
  const t = String(job || '').toLowerCase();
  if (!t.trim()) return '';
  if (/\bsdet\b|aqa|\bqa\b|тест|playwright|automation|dev|engineer|програм|front|back|fullstack|\bit\b/.test(t)) {
    return 'it';
  }
  if (/кав.?яр|кофейн|піцц|пицц|рестор|магазин|horeca|кафе|торгів|пекар|барбер|салон/.test(t)) {
    return 'trade';
  }
  if (/дизайн|photo|фото|відео|ілюстр|контент|креатив|smm/.test(t)) return 'creative';
  if (/юрист|адвокат|бухгалтер|коуч|консульт|репетитор|лікар|психолог|нотар/.test(t)) {
    return 'services';
  }
  return 'other';
}

/**
 * @param {string} [job]
 * @param {string} [domain]
 * @returns {string}
 */
export function inferRoleForDomain(job, domain, inferItRole) {
  const d = firstId(domain) || inferDomainFromJob(job);
  if (d === 'it') {
    const r = typeof inferItRole === 'function' ? inferItRole(job) : '';
    if (!r || r === 'non-it') return 'other-it';
    return r;
  }
  const t = String(job || '').toLowerCase();
  if (/власник|власниця|owner|фоп/.test(t)) return 'owner';
  if (/керівник|директор|manager|шеф|адмін/.test(t)) return 'manager';
  if (/фріланс|репетитор|консульт|незалежн/.test(t)) return 'independent';
  return 'specialist';
}
