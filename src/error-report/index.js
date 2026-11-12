import { apiFetch } from '../api.js';
import { createLimiter, describeError, pathOf } from './model.js';

/**
 * Reports uncaught errors, rejected promises and scripts/styles that failed to load to the API,
 * where they land in the Worker logs. Without it a page that breaks for a user breaks silently.
 */
let started = false;

export function initErrorReport() {
  if (started) return;
  started = true;
  const allow = createLimiter(5);
  const build = pathOf(document.querySelector('script[type="module"][src*="/assets/"]')?.src || '').split('/').pop() || 'dev';

  const send = (report) => {
    if (!report || !allow(report)) return;
    try {
      apiFetch('/api/client-error', {
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({ ...report, page: window.location.pathname, build }),
      }).catch(() => {});
    } catch {
      /* reporting must never break the page */
    }
  };

  window.addEventListener('error', (event) => {
    const target = event.target;
    // Capture phase also brings failed <script>/<link> loads, e.g. a chunk removed by a new deploy.
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
      send(describeError('resource', { message: `Не завантажився ${target.tagName.toLowerCase()}`, source: target.src || target.href }));
      return;
    }
    if (target !== window) return;
    send(describeError('error', { message: event.message, source: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack }));
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    send(describeError('promise', { message: reason?.message ? `${reason.name || 'Error'}: ${reason.message}` : String(reason ?? ''), stack: reason?.stack }));
  });
}
