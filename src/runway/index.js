import './styles.css';
import { openLlmSettings } from '../ai/chat-ui.js';
import { hasLlmKey } from '../ai/settings.js';
import { escapeHtml } from '../utils.js';
import { askRunwayAi, runwayAnswerHtml } from './ask.js';
import { geckoLineConfig } from './gecko-chart.js';
import { renderRunwayApp } from './render.js';

/**
 * @typedef {object} RunwayPoint
 * @property {number} year
 * @property {number} month
 * @property {string} label
 * @property {number} pillow
 * @property {number} debt
 */

/**
 * @typedef {object} RunwaySnapshot
 * @property {RunwayPoint[]} points
 * @property {number} pillowTarget
 * @property {number} pillowNow
 * @property {number} pillowAvg
 * @property {string} pillowNowLabel
 * @property {{ kind: string, year?: number, month?: number }} pillowForecast
 * @property {boolean} hasDebts
 * @property {number} debtNow
 * @property {number} debtAvg
 * @property {string} debtNowLabel
 * @property {{ kind: string, year?: number, month?: number }} debtForecast
 * @property {number} [incomeUah]
 * @property {number} [essentialsUah]
 * @property {number} [wantsUah]
 */

/** @type {null | (() => { userId?: string })} */
let getSession = null;
/** @type {null | (() => RunwaySnapshot | null)} */
let getSnapshot = null;
let mounted = false;
/** @type {'pillow' | 'debt'} */
let series = 'pillow';
/** @type {unknown} */
let chart = null;

let aiAnswer = '';
let aiError = '';
let aiBusy = false;
let aiKey = '';
/** @type {AbortController | null} */
let aiAbort = null;
/** @type {ReturnType<typeof setInterval> | null} */
let settingsWait = null;

export function emptySnapshot() {
  return {
    points: [],
    pillowTarget: 0,
    pillowNow: 0,
    pillowAvg: 0,
    pillowNowLabel: '—',
    pillowForecast: { kind: 'stalled' },
    hasDebts: false,
    debtNow: 0,
    debtAvg: 0,
    debtNowLabel: '—',
    debtForecast: { kind: 'stalled' },
    incomeUah: 0,
    essentialsUah: 0,
    wantsUah: 0,
  };
}

export function initRunway(deps) {
  getSession = deps.getSession;
  getSnapshot = deps.getSnapshot;
  ensureDom();
  mounted = true;
}

export function openRunway() {
  if (!mounted) ensureDom();
  const session = getSession?.() || {};
  if (!session.userId) return;
  const modal = document.getElementById('runway-modal');
  if (!modal) return;
  series = 'pillow';
  modal.classList.add('active');
  paint();
}

export function closeRunway(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('runway-modal');
  const wasOpen = modal?.classList.contains('active');
  if (modal) modal.classList.remove('active');
  stopAi();
  destroyChart();
  if (wasOpen && typeof window.__onSkryniaOverlayClosed === 'function') {
    window.__onSkryniaOverlayClosed();
  }
}

function ensureDom() {
  if (document.getElementById('runway-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'runway-modal';
  modal.className = 'modal-overlay';
  modal.addEventListener('click', closeRunway);
  modal.innerHTML = `
    <div class="modal-content rw-modal-content" data-stop-propagation="1">
      <div id="runway-root"></div>
    </div>`;
  document.body.appendChild(modal);
}

function snapshotKey(snapshot) {
  const s = snapshot || emptySnapshot();
  return [
    Math.round(s.pillowNow || 0),
    Math.round(s.pillowTarget || 0),
    Math.round(s.pillowAvg || 0),
    Math.round(s.debtNow || 0),
    Math.round(s.debtAvg || 0),
    Math.round(s.incomeUah || 0),
    Math.round(s.essentialsUah || 0),
    Math.round(s.wantsUah || 0),
    s.hasDebts ? 1 : 0,
    'opt4',
  ].join('|');
}

function paint() {
  const root = document.getElementById('runway-root');
  if (!root) return;
  destroyChart();
  const snapshot = getSnapshot?.() || emptySnapshot();
  if (!snapshot.hasDebts && series === 'debt') series = 'pillow';
  const key = snapshotKey(snapshot);
  const fresh = Boolean(aiAnswer && aiKey === key);
  renderRunwayApp(root, {
    snapshot,
    series,
    onClose: () => closeRunway(),
    onSeries: (next) => {
      series = next;
      paint();
    },
    ai: {
      answerHtml: fresh ? runwayAnswerHtml(aiAnswer) : '',
      error: aiError,
      busy: aiBusy,
      onAsk: requestAi,
      onRetry: () => {
        aiKey = '';
        void maybeStartAi({ force: true });
      },
      onOpenKey: () => {
        openLlmSettings();
        waitForSettingsClose();
      },
    },
  });
  requestAnimationFrame(() => drawChart(root, snapshot));
}

function destroyChart() {
  const reveal = chart && typeof chart === 'object' ? chart.$rwReveal : null;
  if (reveal?.raf) cancelAnimationFrame(reveal.raf);
  if (reveal) reveal.cancelled = true;
  if (chart && typeof chart.destroy === 'function') chart.destroy();
  chart = null;
}

/** @param {HTMLElement} root @param {RunwaySnapshot} snapshot */
function drawChart(root, snapshot) {
  const Chart = window.Chart;
  if (typeof Chart !== 'function') return;
  const points = snapshot.points || [];
  if (!points.length) return;
  const el = root.querySelector('[data-rw-chart]');
  if (!(el instanceof HTMLCanvasElement)) return;
  const isDebt = series === 'debt' && snapshot.hasDebts;
  const labels = points.map((p) => p.label);
  const data = points.map((p) => (isDebt ? p.debt : p.pillow));
  const target = isDebt ? 0 : snapshot.pillowTarget;
  chart = new Chart(el, geckoLineConfig(labels, data, target, isDebt ? 'debt' : 'pillow'));
}

function stopAi() {
  const wasBusy = aiBusy;
  aiAbort?.abort();
  aiAbort = null;
  aiBusy = false;
  if (wasBusy) {
    aiAnswer = '';
    aiError = '';
  }
  if (settingsWait) {
    clearInterval(settingsWait);
    settingsWait = null;
  }
}

function paintAiOut(text, opts = {}) {
  const out = document.querySelector('#runway-root [data-rw-ai-out]');
  if (!out) return;
  if (opts.error) {
    out.innerHTML = `<p class="rw-ai-err">${escapeHtml(opts.error)}</p>
      <button type="button" class="rw-btn" data-rw-ai-retry>Ще раз</button>`;
    out.querySelector('[data-rw-ai-retry]')?.addEventListener('click', () => {
      aiKey = '';
      void maybeStartAi({ force: true });
    });
    return;
  }
  if (!text) {
    out.innerHTML = '<p class="rw-ai-wait">Рахую суми й дати фінішу…</p>';
    return;
  }
  out.innerHTML = `<div class="ai-chat-text">${runwayAnswerHtml(text)}${opts.streaming ? '<span class="ai-caret"></span>' : ''}</div>`;
}

function requestAi() {
  if (!hasLlmKey()) {
    openLlmSettings();
    waitForSettingsClose();
    return;
  }
  void maybeStartAi({ force: true });
}

function waitForSettingsClose() {
  const overlay = document.getElementById('llm-settings-modal');
  if (!overlay) return;
  if (settingsWait) clearInterval(settingsWait);
  settingsWait = setInterval(() => {
    if (overlay.classList.contains('active')) return;
    if (settingsWait) clearInterval(settingsWait);
    settingsWait = null;
    if (hasLlmKey()) void maybeStartAi({ force: true });
    else paint();
  }, 400);
}

function errorMessage(e) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'no-key') return 'Додай ключ ШІ, щоб побачити суми й дати.';
  if (msg === 'no-provider') return 'Оберіть провайдера ключа ШІ.';
  return msg || 'Не вдалося порахувати рекомендацію.';
}

async function maybeStartAi(opts = {}) {
  const snapshot = getSnapshot?.() || emptySnapshot();
  if (!(snapshot.points || []).length) return;
  const session = getSession?.() || {};
  if (!session.userId) return;
  if (!hasLlmKey()) {
    aiBusy = false;
    aiError = '';
    return;
  }
  const key = snapshotKey(snapshot);
  if (!opts.force && aiAnswer && aiKey === key) return;
  if (aiBusy && !opts.force) return;
  aiAbort?.abort();
  aiAbort = new AbortController();
  aiBusy = true;
  aiError = '';
  if (aiKey !== key) aiAnswer = '';
  aiKey = key;
  paintAiOut('');
  try {
    const text = await askRunwayAi({
      userId: session.userId,
      snapshot,
      signal: aiAbort.signal,
      onToken: (chunk) => {
        aiAnswer = chunk;
        paintAiOut(chunk, { streaming: true });
      },
    });
    aiAnswer = text;
    paintAiOut(text, { streaming: false });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    aiError = errorMessage(e);
    if (e?.message === 'no-provider') {
      openLlmSettings();
      waitForSettingsClose();
    }
    paintAiOut('', { error: aiError });
  } finally {
    aiBusy = false;
  }
}
