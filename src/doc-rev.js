/**
 * Whole-document modules (family tree, year tracks, investments) save with the revision of the
 * server copy they were loaded from; the server refuses a save made from an older one.
 * The revision lives next to the local copy, so a copy opened without the network keeps its base.
 */

export const STALE_DOC_MESSAGE = 'Дані змінено на іншому пристрої. Завантажено актуальну версію, останню зміну не збережено.';

export function readRev(key) {
  try {
    return localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

export function writeRev(key, rev) {
  if (typeof rev !== 'string' || !rev) return;
  try {
    localStorage.setItem(key, rev);
  } catch {
    /* quota / private mode */
  }
}

const queues = new Map();

/**
 * POSTs a document with its base revision. Saves of one document go one after another:
 * each must carry the revision the previous one produced.
 * @returns {Promise<{ ok: boolean, stale?: boolean, localOnly?: boolean }>}
 */
export function postDoc(url, body, revKey) {
  const run = (queues.get(revKey) || Promise.resolve()).then(() => send(url, body, revKey));
  queues.set(revKey, run);
  return run;
}

async function send(url, body, revKey) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, baseRev: readRev(revKey) }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      writeRev(revKey, data.rev);
      return { ok: true };
    }
    if (response.status === 409 && data.code === 'stale_data') return { ok: false, stale: true };
    return { ok: false, localOnly: true };
  } catch {
    return { ok: false, localOnly: true };
  }
}
