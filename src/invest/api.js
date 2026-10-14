import { indexNbuBonds, normalizeDoc } from './model.js';

const LS_PREFIX = 'budget_invest_';
const NBU_BONDS_KEY = 'budget_invest_nbu_bonds';
const NBU_BONDS_TTL_MS = 12 * 60 * 60 * 1000;
const NBU_BONDS_URL = 'https://bank.gov.ua/depo_securities?json';

function lsKey(userId) {
  return LS_PREFIX + userId;
}

export function loadDocLocal(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(lsKey(userId));
    return raw ? normalizeDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDocLocal(userId, purchases) {
  if (!userId) return;
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify({ version: 1, purchases }));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Purchases from the server, falling back to the local copy.
 * @param {{ apiUrl: string, userId: string, authenticated?: boolean }} opts
 */
export async function fetchPurchases({ apiUrl, userId, authenticated }) {
  if (!apiUrl || !userId || authenticated === false) return loadDocLocal(userId) || [];
  try {
    const response = await fetch(`${apiUrl}/api/invest?userId=${encodeURIComponent(userId)}`, { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      if (data.invest) {
        const purchases = normalizeDoc(typeof data.invest === 'string' ? JSON.parse(data.invest) : data.invest);
        saveDocLocal(userId, purchases);
        return purchases;
      }
      return loadDocLocal(userId) || [];
    }
  } catch {
    /* network / parse */
  }
  return loadDocLocal(userId) || [];
}

/**
 * @param {{ apiUrl: string, userId: string, authenticated?: boolean, purchases: object[] }} opts
 * @returns {Promise<{ ok: boolean, localOnly?: boolean }>}
 */
export async function savePurchases({ apiUrl, userId, authenticated, purchases }) {
  saveDocLocal(userId, purchases);
  if (!apiUrl || !userId || authenticated === false) return { ok: true, localOnly: true };
  try {
    const response = await fetch(`${apiUrl}/api/invest`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, invest: { version: 1, purchases } }),
    });
    return response.ok ? { ok: true } : { ok: false, localOnly: true };
  } catch {
    return { ok: false, localOnly: true };
  }
}

let bondsPromise = null;

/** All OVDP from NBU open data as { ISIN: bond }; cached for 12 hours. Resolves to {} when NBU is unreachable. */
export function fetchNbuBonds() {
  if (bondsPromise) return bondsPromise;
  bondsPromise = (async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(NBU_BONDS_KEY) || 'null');
      if (cached && Date.now() - cached.at < NBU_BONDS_TTL_MS && cached.bonds) return cached.bonds;
    } catch {
      /* ignore */
    }
    try {
      const response = await fetch(NBU_BONDS_URL);
      if (!response.ok) throw new Error(`NBU ${response.status}`);
      const bonds = indexNbuBonds(await response.json());
      try {
        localStorage.setItem(NBU_BONDS_KEY, JSON.stringify({ at: Date.now(), bonds }));
      } catch {
        /* quota */
      }
      return bonds;
    } catch {
      bondsPromise = null; // try again next time
      return {};
    }
  })();
  return bondsPromise;
}

const rateCache = new Map();

/** NBU official rate (₴ per 1 unit) on an ISO date; null when unknown. */
export async function fetchNbuRate(ccy, isoDate) {
  if (ccy === 'UAH' || !isoDate) return null;
  const key = `${ccy}:${isoDate}`;
  if (rateCache.has(key)) return rateCache.get(key);
  try {
    const ymd = isoDate.replaceAll('-', '');
    const response = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${encodeURIComponent(ccy)}&date=${ymd}&json`);
    if (!response.ok) return null;
    const rate = Number((await response.json())?.[0]?.rate);
    if (!(rate > 0)) return null;
    rateCache.set(key, rate);
    return rate;
  } catch {
    return null;
  }
}
