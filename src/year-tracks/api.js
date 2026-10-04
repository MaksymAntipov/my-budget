import { emptyDoc, normalizeDoc } from './model.js';

const LS_PREFIX = 'budget_year_tracks_';

function lsKey(userId) {
  return LS_PREFIX + userId;
}

export function loadDocLocal(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (!raw) return null;
    return normalizeDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDocLocal(userId, doc) {
  if (!userId) return;
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(doc));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {{ apiUrl: string, userId: string, authenticated?: boolean }} opts
 */
export async function fetchDocFromServer({ apiUrl, userId, authenticated }) {
  if (!apiUrl || !userId || authenticated === false) {
    return loadDocLocal(userId) || emptyDoc();
  }

  try {
    const response = await fetch(
      `${apiUrl}/api/year-tracks?userId=${encodeURIComponent(userId)}`,
      { credentials: 'include' },
    );
    if (!response.ok) {
      return loadDocLocal(userId) || emptyDoc();
    }
    const data = await response.json();
    if (data.yearTracks) {
      const doc = normalizeDoc(
        typeof data.yearTracks === 'string' ? JSON.parse(data.yearTracks) : data.yearTracks,
      );
      saveDocLocal(userId, doc);
      return doc;
    }
  } catch {
    /* network / parse */
  }

  return loadDocLocal(userId) || emptyDoc();
}

/**
 * @param {{ apiUrl: string, userId: string, authenticated?: boolean, doc: import('./model.js').YearTracksDoc }} opts
 */
export async function saveDocToServer({ apiUrl, userId, authenticated, doc }) {
  saveDocLocal(userId, doc);

  if (!apiUrl || !userId || authenticated === false) {
    return { ok: true, localOnly: true };
  }

  try {
    const response = await fetch(`${apiUrl}/api/year-tracks`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, yearTracks: doc }),
    });
    if (!response.ok) return { ok: false, localOnly: true };
    return { ok: true };
  } catch {
    return { ok: false, localOnly: true };
  }
}
