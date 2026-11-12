/**
 * Browser errors worth telling the server about (POST /api/client-error → Workers Logs).
 * Only technical text leaves the page: no ids, emails, amounts or query strings.
 */

const NOISE = [
  /^Script error\.?$/i, // cross-origin script: the browser hides everything useful
  /ResizeObserver loop/i,
  /AbortError|The user aborted a request|signal is aborted/i, // a request the app itself cancelled
];

const cut = (value, max) => String(value ?? '').slice(0, max);

/** Path only: a full URL can carry a user id in its query. */
export function pathOf(url) {
  try {
    return new URL(String(url), 'https://x.invalid').pathname.slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * @param {'error' | 'promise' | 'resource'} kind
 * @param {{ message?: unknown, source?: unknown, line?: unknown, column?: unknown, stack?: unknown }} raw
 * @returns {{ kind: string, message: string, source: string, stack: string } | null} null for noise
 */
export function describeError(kind, raw) {
  const message = cut(raw?.message, 300).trim();
  if (!message || NOISE.some((re) => re.test(message))) return null;
  const where = raw?.source ? `${pathOf(raw.source)}${raw.line ? `:${raw.line}:${raw.column || 0}` : ''}` : '';
  return { kind, message, source: where, stack: cut(raw?.stack, 1200) };
}

/** Lets through the first `max` different errors of a page load: one broken loop must not flood the log. */
export function createLimiter(max = 5) {
  const seen = new Set();
  return (report) => {
    const key = `${report.kind}|${report.message}|${report.source}`;
    if (seen.has(key) || seen.size >= max) return false;
    seen.add(key);
    return true;
  };
}
