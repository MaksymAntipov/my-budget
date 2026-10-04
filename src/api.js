import { API_URL } from './config.js';

/**
 * All API calls send cookies (HttpOnly session). No token in localStorage.
 * @param {string} path
 * @param {RequestInit} [options]
 */
export function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}
