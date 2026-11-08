import { apiFetch } from '../api.js';

// AI provider keys saved on the server (backend src/ai/keys.ts). The key goes up once; only its hint comes back.

async function readJson(res) {
  return res.json().catch(() => ({}));
}

/** @returns {Promise<{ enabled: boolean, keys: Array<{ provider: string, hint: string }> }>} */
export async function fetchAiKeys(userId) {
  const res = await apiFetch(`/api/ai/keys?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error((await readJson(res)).error || 'Не вдалося завантажити ключі');
  return readJson(res);
}

/** @returns {Promise<{ provider: string, hint: string }>} */
export async function saveAiKey(userId, provider, apiKey) {
  const res = await apiFetch('/api/ai/keys', { method: 'POST', body: JSON.stringify({ userId, provider, apiKey }) });
  const body = await readJson(res);
  if (!res.ok) {
    const err = new Error(body.error || 'Не вдалося зберегти ключ');
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function deleteAiKey(userId, provider) {
  const res = await apiFetch('/api/ai/keys/delete', { method: 'POST', body: JSON.stringify({ userId, provider }) });
  if (!res.ok) throw new Error((await readJson(res)).error || 'Не вдалося видалити ключ');
}
