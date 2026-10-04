import { escapeHtml } from '../utils.js';
import {
  deltaBadge,
  deltaHint,
  formatHeroUah,
  motivationLine,
  paceHint,
  pacePhrase,
  seriesDelta,
  targetHint,
  targetSubtitle,
} from './model.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   snapshot: import('./index.js').RunwaySnapshot,
 *   series: 'pillow' | 'debt',
 *   onClose: () => void,
 *   onSeries: (next: 'pillow' | 'debt') => void,
 *   ai?: {
 *     answerHtml: string,
 *     error: string,
 *     busy: boolean,
 *     onAsk: () => void,
 *     onRetry: () => void,
 *     onOpenKey: () => void,
 *   },
 * }} handlers
 */
export function renderRunwayApp(root, { snapshot, series, onClose, onSeries, ai }) {
  const points = snapshot?.points || [];
  const hasSeries = points.length > 0;

  root.innerHTML = `
    <div class="rw-shell">
      <header class="rw-header">
        <h2 class="rw-title">Внески</h2>
        <div class="rw-header-actions">
          <div class="skrynia-switcher" data-skrynia-switcher style="display:none;">
            <button type="button" class="skrynia-switcher-btn" data-action="toggleSkryniaSwitcher" data-pass-event="1">Скриня <span style="opacity:0.7;font-size:10px;">▾</span></button>
            <div class="skrynia-switcher-dropdown"></div>
          </div>
          <button type="button" class="rw-btn" data-rw-close aria-label="Закрити">✕</button>
        </div>
      </header>
      <div class="rw-body">
        <div class="rw-page">
          ${hasSeries ? renderBody(snapshot, series, ai) : renderEmpty()}
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-rw-close]')?.addEventListener('click', onClose);
  root.querySelectorAll('[data-rw-series]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-rw-series');
      if (next === 'pillow' || next === 'debt') onSeries(next);
    });
  });
  root.querySelector('[data-rw-ai-go]')?.addEventListener('click', () => ai?.onAsk?.());
  root.querySelector('[data-rw-ai-key]')?.addEventListener('click', () => ai?.onOpenKey?.());
  root.querySelector('[data-rw-ai-retry]')?.addEventListener('click', () => ai?.onRetry?.());
  if (typeof window.updateSkryniaSwitcherUI === 'function') {
    window.updateSkryniaSwitcherUI();
  }
}

function renderEmpty() {
  return `
    <div class="rw-empty">
      <p>Ще немає внесків</p>
      <span>Заповни місяць у бюджеті: відклади в конверт «Подушка» або погаси борг — тут з’явиться лінія.</span>
    </div>
  `;
}

/** @param {import('./index.js').RunwaySnapshot} snapshot @param {'pillow' | 'debt'} series @param {object} [ai] */
function renderBody(snapshot, series, ai) {
  const isDebt = series === 'debt' && snapshot.hasDebts;
  const values = (snapshot.points || []).map((p) => (isDebt ? p.debt : p.pillow));
  const now = isDebt ? snapshot.debtNow : snapshot.pillowNow;
  const target = isDebt ? 0 : snapshot.pillowTarget;
  const forecast = isDebt ? snapshot.debtForecast : snapshot.pillowForecast;
  const avg = isDebt ? snapshot.debtAvg : snapshot.pillowAvg;
  const kind = isDebt ? 'debt' : 'pillow';
  const badge = deltaBadge(seriesDelta(values), { wantUp: !isDebt });
  const line = motivationLine(forecast, { avg }, kind);
  const stalled = forecast?.kind === 'stalled';

  return `
    <div class="rw-gecko">
      <div class="rw-hero">
        <div class="rw-hero-row">
          <span class="rw-hero-value">${escapeHtml(formatHeroUah(now))}</span>
          ${
            badge
              ? tip(`<span class="rw-delta is-${badge.tone}">${escapeHtml(badge.text)}</span>`, deltaHint(kind))
              : ''
          }
        </div>
        <p class="rw-hero-sub">${tip(escapeHtml(targetSubtitle(now, target, kind)), targetHint(kind))}</p>
        <p class="rw-motivate${stalled ? ' is-stalled' : ''}">${wrapPace(line, avg, kind)}</p>
      </div>
      ${
        snapshot.hasDebts
          ? `<div class="rw-pills" role="tablist">
              <button type="button" class="rw-pill${isDebt ? '' : ' is-on'}" data-rw-series="pillow">Подушка</button>
              <button type="button" class="rw-pill${isDebt ? ' is-on' : ''}" data-rw-series="debt">Борги</button>
            </div>`
          : ''
      }
      <div class="rw-chart-wrap"><canvas data-rw-chart></canvas></div>
      ${renderAi(ai)}
    </div>
  `;
}

function tip(labelHtml, text) {
  return `<span class="rw-tip" tabindex="0"><span class="rw-tip-val">${labelHtml}</span><span class="rw-tip-box" role="tooltip">${escapeHtml(text)}</span></span>`;
}

function wrapPace(line, avg, kind) {
  const pace = pacePhrase(avg);
  const idx = line.indexOf(pace);
  if (idx < 0) return escapeHtml(line);
  return `${escapeHtml(line.slice(0, idx))}${tip(escapeHtml(pace), paceHint(kind))}${escapeHtml(line.slice(idx + pace.length))}`;
}

function renderAi(ai) {
  let body = '';
  if (ai?.busy && !ai?.answerHtml) {
    body = '<p class="rw-ai-wait">Рахую суми й дати фінішу…</p>';
  } else if (ai?.error) {
    body = `<p class="rw-ai-err">${escapeHtml(ai.error)}</p>
      <button type="button" class="rw-btn" data-rw-ai-retry>Ще раз</button>`;
  } else if (ai?.answerHtml) {
    body = `<div class="ai-chat-text">${ai.answerHtml}</div>`;
  } else {
    body = `<p class="rw-ai-hint">Розкладе вільний залишок: скільки гасити борги і скільки класти в подушку.</p>
      <button type="button" class="rw-ai-cta" data-rw-ai-go>
        <span class="rw-ai-cta-dot" aria-hidden="true"></span>
        Отримати рекомендацію
      </button>`;
  }
  return `
    <section class="rw-ai">
      <h3 class="rw-ai-title">Рекомендація</h3>
      <div class="rw-ai-out" data-rw-ai-out>${body}</div>
    </section>
  `;
}
