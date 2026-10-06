import { escapeHtml } from '../utils.js';
import { TRACK_STATUS_LABELS, STAGE_STATUS_LABELS, trackStatusReason } from './model.js';
import {
  computeBoardLayout,
  STAGE_GAP,
  STAGE_MIN_HEIGHT,
  STAGE_WIDTH,
  TRACK_PAD_BOTTOM,
  TRACK_PAD_TOP,
  TRACK_PAD_X,
  TRACK_MIN_HEIGHT,
  CANVAS_PAD,
  EDGE_OUTSET,
  EDGE_INSET_END,
} from './layout.js';
import { bindTouchGestures } from '../canvas-touch.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   year: number,
 *   board: import('./model.js').YearBoard,
 *   selectedTrackId: string | null,
 *   selectedStageId: string | null,
 *   saveStatus: string,
 *   onClose: () => void,
 *   onChangeYear: (year: number) => void,
 *   onSelect: (trackId: string | null, stageId: string | null) => void,
 *   onAddTrack: () => void,
 *   onUpdateTrack: (track: import('./model.js').YearTrack) => void,
 *   onChangeTrackStatus: (track: import('./model.js').YearTrack, status: import('./model.js').TrackStatus) => void,
 *   onDeleteTrack: (trackId: string) => void,
 *   onAddStage: (trackId: string) => void,
 *   onUpdateStage: (trackId: string, stage: import('./model.js').TrackStage) => void,
 *   onDeleteStage: (trackId: string, stageId: string) => void,
 *   onCycleStageStatus: (trackId: string, stageId: string) => void,
 *   onMoveTrack: (trackId: string, x: number, y: number) => void,
 *   onLinkAfter: (successorId: string, predecessorId: string) => void,
 *   onUnlinkAfter: (successorId: string) => void,
 * }} handlers
 */
export function renderYearTracksApp(root, handlers) {
  const {
    year,
    board,
    selectedTrackId,
    selectedStageId,
    saveStatus,
    onClose,
    onChangeYear,
    onSelect,
    onAddTrack,
    onUpdateTrack,
    onChangeTrackStatus,
    onDeleteTrack,
    onAddStage,
    onUpdateStage,
    onDeleteStage,
    onCycleStageStatus,
    onMoveTrack,
    onLinkAfter,
    onUnlinkAfter,
  } = handlers;

  const selectedTrack = board.tracks.find((t) => t.id === selectedTrackId) || null;
  const selectedStage =
    selectedTrack && selectedStageId
      ? selectedTrack.stages.find((s) => s.id === selectedStageId) || null
      : null;
  const selectedStageIndex =
    selectedTrack && selectedStage
      ? selectedTrack.stages.findIndex((s) => s.id === selectedStage.id)
      : -1;

  root.innerHTML = `
    <div class="yt-shell ${panelOpen ? '' : 'is-panel-collapsed'}" data-yt-shell>
      <header class="yt-header">
        <div class="yt-header-left">
          <h2 class="yt-title">Мої треки</h2>
          <div class="yt-year-switch" data-yt-year-switch>
            <button type="button" data-yt-year-prev aria-label="Попередній рік">‹</button>
            <span class="yt-year-label">${escapeHtml(String(year))}</span>
            <button type="button" data-yt-year-next aria-label="Наступний рік">›</button>
          </div>
          <span class="yt-save-status" data-yt-save>${escapeHtml(saveStatus)}</span>
        </div>
        <div class="yt-header-actions">
          <div class="skrynia-switcher" data-skrynia-switcher style="display:none;">
            <button type="button" class="skrynia-switcher-btn" data-action="toggleSkryniaSwitcher" data-pass-event="1">Скриня <span style="opacity:0.7;font-size:10px;">▾</span></button>
            <div class="skrynia-switcher-dropdown"></div>
          </div>
          <div class="yt-zoom-switch" data-yt-zoom-switch title="Ctrl/⌘ + scroll або pinch — зум">
            <button type="button" data-yt-zoom-out aria-label="Зменшити">−</button>
            <button type="button" class="yt-zoom-label" data-yt-zoom-reset>${Math.round(viewZoom * 100)}%</button>
            <button type="button" data-yt-zoom-in aria-label="Збільшити">+</button>
          </div>
          <button type="button" class="yt-btn yt-btn-secondary" data-yt-panel-toggle
            title="${panelOpen ? 'Сховати панель' : 'Показати панель'}">${panelOpen ? 'Сховати панель' : 'Панель'}</button>
          <button type="button" class="yt-btn yt-btn-secondary" data-yt-add>+ Трек</button>
          <button type="button" class="yt-btn yt-btn-ghost" data-yt-close aria-label="Закрити">✕</button>
        </div>
      </header>
      <div class="yt-body">
        <div class="yt-canvas-wrap" data-yt-canvas-wrap>
          ${
            board.tracks.length === 0
              ? `<div class="yt-empty">
                <p class="yt-empty-title">Полотно ${escapeHtml(String(year))} порожнє</p>
                <p class="yt-empty-text">Додайте трек — перша стадія буде назвою треку, далі стадії зверху вниз</p>
                <button type="button" class="yt-btn yt-btn-primary" data-yt-add-empty>+ Додати трек</button>
              </div>`
              : renderCanvas(board, selectedTrackId, selectedStageId)
          }
        </div>
        <aside class="yt-panel" data-yt-panel ${panelOpen ? '' : 'hidden'} ${selectedTrack && selectedStage ? '' : 'data-empty'}>
          <div class="yt-panel-toolbar">
            <button type="button" class="yt-btn yt-btn-ghost yt-panel-collapse" data-yt-panel-toggle aria-label="Сховати панель">›</button>
          </div>
          ${renderPanel(selectedTrack, selectedStage, selectedStageIndex)}
        </aside>
      </div>
    </div>
  `;

  root.querySelector('[data-yt-close]')?.addEventListener('click', onClose);
  root.querySelector('[data-yt-year-prev]')?.addEventListener('click', () => onChangeYear(year - 1));
  root.querySelector('[data-yt-year-next]')?.addEventListener('click', () => onChangeYear(year + 1));
  root.querySelectorAll('[data-yt-add], [data-yt-add-empty]').forEach((el) => {
    el.addEventListener('click', onAddTrack);
  });
  root.querySelectorAll('[data-yt-panel-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      panelOpen = !panelOpen;
      // Re-render shell classes without losing selection — caller paints via toggle helper
      const shell = root.querySelector('[data-yt-shell]');
      const panel = root.querySelector('[data-yt-panel]');
      const toggleBtns = root.querySelectorAll('[data-yt-panel-toggle]');
      shell?.classList.toggle('is-panel-collapsed', !panelOpen);
      if (panel instanceof HTMLElement) panel.hidden = !panelOpen;
      toggleBtns.forEach((btn) => {
        if (btn.classList.contains('yt-panel-collapse')) return;
        btn.textContent = panelOpen ? 'Сховати панель' : 'Панель';
        btn.setAttribute('title', panelOpen ? 'Сховати панель' : 'Показати панель');
      });
    });
  });

  bindPanel(root, {
    selectedTrack,
    selectedStage,
    onUpdateTrack,
    onChangeTrackStatus,
    onDeleteTrack,
    onAddStage,
    onUpdateStage,
    onDeleteStage,
  });

  bindCanvasInteractions(root, {
    board,
    onSelect: (trackId, stageId) => {
      // Selecting a block opens the details panel
      if (!panelOpen && trackId) {
        panelOpen = true;
      }
      onSelect(trackId, stageId);
    },
    onCycleStageStatus,
    onMoveTrack,
    onLinkAfter,
    onUnlinkAfter,
  });

  const wrap = root.querySelector('[data-yt-canvas-wrap]');
  root.querySelector('[data-yt-zoom-in]')?.addEventListener('click', () => {
    zoomAt(wrap, 1.15);
  });
  root.querySelector('[data-yt-zoom-out]')?.addEventListener('click', () => {
    zoomAt(wrap, 1 / 1.15);
  });
  root.querySelector('[data-yt-zoom-reset]')?.addEventListener('click', () => {
    resetZoom(wrap);
  });

  const canvasEl = root.querySelector('[data-yt-canvas]');
  if (canvasEl instanceof HTMLElement) {
    refineCanvasLayout(canvasEl);
    applyViewportTransform(canvasEl);
  }

  const titleArea = root.querySelector('[data-yt-field="stage-title"]');
  if (titleArea instanceof HTMLTextAreaElement) autosizeTextarea(titleArea);
  const reasonArea = root.querySelector('[data-yt-field="status-reason"]');
  if (reasonArea instanceof HTMLTextAreaElement) autosizeTextarea(reasonArea);

  if (typeof window.updateSkryniaSwitcherUI === 'function') {
    window.updateSkryniaSwitcherUI();
  }
}

/** @param {HTMLTextAreaElement} el */
function autosizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.max(44, el.scrollHeight)}px`;
}

/**
 * Second pass: measure real wrapped text heights and restack stages + arrows.
 * @param {HTMLElement} canvas
 */
function refineCanvasLayout(canvas) {
  const ARROW_H = 7;
  const ARROW_W = 6;
  const boxes = [...canvas.querySelectorAll('[data-yt-track-box]')];

  /** @type {{ x: number, y1: number, y2: number }[]} */
  const edges = [];
  /** @type {{ x1: number, y1: number, x2: number, y2: number, successorId: string }[]} */
  const seqEdges = [];
  let maxBottom = 600;
  let maxRight = 900;

  /** @type {Map<string, { left: number, top: number, width: number, height: number }>} */
  const boxGeom = new Map();

  for (const box of boxes) {
    if (!(box instanceof HTMLElement)) continue;
    const tid = box.getAttribute('data-yt-track-box');
    if (!tid) continue;
    const stages = [...box.querySelectorAll('[data-yt-stage]')].sort(
      (a, b) =>
        (parseFloat(/** @type {HTMLElement} */ (a).style.top) || 0) -
        (parseFloat(/** @type {HTMLElement} */ (b).style.top) || 0),
    );
    if (!stages.length) continue;

    const boxTop = parseFloat(box.style.top) || 0;
    const boxLeft = parseFloat(box.style.left) || 0;
    let cursor = TRACK_PAD_TOP;

    for (let i = 0; i < stages.length; i++) {
      const el = /** @type {HTMLElement} */ (stages[i]);
      el.style.left = `${TRACK_PAD_X}px`;
      el.style.height = 'auto';
      el.style.top = `${cursor}px`;
      const h = Math.max(STAGE_MIN_HEIGHT, el.scrollHeight);
      el.style.height = `${h}px`;

      if (i > 0) {
        const prev = /** @type {HTMLElement} */ (stages[i - 1]);
        const prevTop = parseFloat(prev.style.top) || 0;
        const prevH = parseFloat(prev.style.height) || 0;
        const x = boxLeft + TRACK_PAD_X + STAGE_WIDTH / 2;
        const y1 = boxTop + prevTop + prevH + EDGE_OUTSET;
        const y2 = boxTop + cursor - EDGE_INSET_END;
        if (y2 > y1 + 4) edges.push({ x, y1, y2 });
      }
      cursor += h + STAGE_GAP;
    }

    const last = /** @type {HTMLElement} */ (stages[stages.length - 1]);
    const contentBottom =
      boxTop +
      (parseFloat(last.style.top) || 0) +
      (parseFloat(last.style.height) || 0) +
      TRACK_PAD_BOTTOM;
    const trackH = Math.max(TRACK_MIN_HEIGHT, contentBottom - boxTop);
    box.style.height = `${trackH}px`;
    const boxW = parseFloat(box.style.width) || 0;
    boxGeom.set(tid, { left: boxLeft, top: boxTop, width: boxW, height: trackH });
    maxRight = Math.max(maxRight, boxLeft + boxW + CANVAS_PAD);
    maxBottom = Math.max(maxBottom, boxTop + trackH + CANVAS_PAD);
  }

  for (const box of boxes) {
    if (!(box instanceof HTMLElement)) continue;
    const succId = box.getAttribute('data-yt-track-box');
    const predId = box.getAttribute('data-yt-after');
    if (!succId || !predId) continue;
    const succ = boxGeom.get(succId);
    const pred = boxGeom.get(predId);
    if (!succ || !pred) continue;
    seqEdges.push({
      x1: pred.left + pred.width,
      y1: pred.top + Math.min(36, pred.height / 2),
      x2: succ.left,
      y2: succ.top + Math.min(36, succ.height / 2),
      successorId: succId,
    });
  }

  const svg = canvas.querySelector('.yt-edges');
  if (svg) {
    svg.setAttribute('width', String(maxRight));
    svg.setAttribute('height', String(maxBottom));
    const vert = edges
      .map((e) => {
        const baseY = e.y2 - ARROW_H;
        const lineEnd = Math.max(e.y1, baseY - 1);
        return `
          <line class="yt-edge" x1="${e.x}" y1="${e.y1}" x2="${e.x}" y2="${lineEnd}" />
          <path class="yt-edge-head" d="M ${e.x - ARROW_W / 2} ${baseY} L ${e.x} ${e.y2} L ${e.x + ARROW_W / 2} ${baseY} Z" />`;
      })
      .join('');
    svg.innerHTML = vert + seqEdges.map((e) => seqArrowSvg(e.x1, e.y1, e.x2, e.y2)).join('');
  }

  canvas.querySelectorAll('[data-yt-seq-link]').forEach((wrap) => {
    if (!(wrap instanceof HTMLElement)) return;
    const sid = wrap.getAttribute('data-yt-seq-link');
    const edge = seqEdges.find((e) => e.successorId === sid);
    const hit = wrap.querySelector('.yt-seq-hit');
    const btn = wrap.querySelector('[data-yt-unlink]');
    if (!edge || !(hit instanceof HTMLElement) || !(btn instanceof HTMLElement)) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const dx = edge.x2 - edge.x1;
    const dy = edge.y2 - edge.y1;
    const len = Math.max(16, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const hitH = 22;
    hit.style.left = `${edge.x1}px`;
    hit.style.top = `${edge.y1 - hitH / 2}px`;
    hit.style.width = `${len}px`;
    hit.style.height = `${hitH}px`;
    hit.style.transform = `rotate(${angle}rad)`;
    btn.style.left = `${(edge.x1 + edge.x2) / 2 - 11}px`;
    btn.style.top = `${(edge.y1 + edge.y2) / 2 - 11}px`;
  });

  canvas.style.width = `${maxRight}px`;
  canvas.style.height = `${maxBottom}px`;
}

/**
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 */
function seqArrowSvg(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tipX = x2;
  const tipY = y2;
  const ah = 8;
  const baseX = tipX - ux * ah;
  const baseY = tipY - uy * ah;
  const nx = -uy;
  const ny = ux;
  const hw = 4;
  return `
    <line class="yt-seq-edge" x1="${x1}" y1="${y1}" x2="${baseX}" y2="${baseY}" />
    <path class="yt-seq-head" d="M ${baseX + nx * hw} ${baseY + ny * hw} L ${tipX} ${tipY} L ${baseX - nx * hw} ${baseY - ny * hw} Z" />`;
}

/** @param {import('./model.js').StageStatus} status */
function stageStatusMark(status) {
  if (status === 'done') return '✓';
  if (status === 'doing') return '◐';
  return '';
}

/** @param {import('./model.js').TrackStatus} status */
function statusClass(status) {
  if (status === 'active') return 'is-active';
  if (status === 'paused') return 'is-paused';
  if (status === 'done') return 'is-done-track';
  if (status === 'blocked') return 'is-blocked';
  if (status === 'dropped') return 'is-dropped';
  return 'is-plain';
}

/**
 * @param {import('./model.js').YearBoard} board
 * @param {string | null} selectedTrackId
 * @param {string | null} selectedStageId
 */
function renderCanvas(board, selectedTrackId, selectedStageId) {
  const layout = computeBoardLayout(board);
  const trackById = new Map(board.tracks.map((t) => [t.id, t]));

  const ARROW_H = 7;
  const ARROW_W = 6;
  const edgePaths = layout.tracks
    .flatMap((t) =>
      t.edges.map((e) => ({
        x: e.x,
        y1: e.y1,
        y2: e.y2,
      })),
    )
    .map((e) => {
      const tipY = e.y2;
      const baseY = tipY - ARROW_H;
      const lineEnd = Math.max(e.y1, baseY - 1);
      return `
        <line class="yt-edge" x1="${e.x}" y1="${e.y1}" x2="${e.x}" y2="${lineEnd}" />
        <path class="yt-edge-head" d="M ${e.x - ARROW_W / 2} ${baseY} L ${e.x} ${tipY} L ${e.x + ARROW_W / 2} ${baseY} Z" />`;
    })
    .join('');

  const seqPaths = layout.tracks
    .map((succ) => {
      const track = trackById.get(succ.id);
      if (!track?.afterId) return '';
      const pred = layout.tracks.find((t) => t.id === track.afterId);
      if (!pred) return '';
      return seqArrowSvg(
        pred.x + pred.width,
        pred.y + Math.min(36, pred.height / 2),
        succ.x,
        succ.y + Math.min(36, succ.height / 2),
      );
    })
    .join('');

  const unlinkHtml = board.tracks
    .filter((t) => t.afterId)
    .map(
      (t) => `
        <div class="yt-seq-link" data-yt-seq-link="${escapeHtml(t.id)}">
          <div class="yt-seq-hit" aria-hidden="true"></div>
          <button type="button" class="yt-seq-unlink" data-yt-unlink="${escapeHtml(t.id)}"
            title="Прибрати «потім»" aria-label="Прибрати послідовність">×</button>
        </div>`,
    )
    .join('');

  const tracksHtml = layout.tracks
    .map((tl) => {
      const track = trackById.get(tl.id);
      if (!track) return '';
      const selected = track.id === selectedTrackId ? 'is-selected' : '';
      const statusLabel = TRACK_STATUS_LABELS[track.status] || '';
      const reason = trackStatusReason(track);
      const afterAttr = track.afterId ? `data-yt-after="${escapeHtml(track.afterId)}"` : '';
      const stagesHtml = tl.stages
        .map((sl, idx) => {
          const stage = track.stages.find((s) => s.id === sl.id);
          if (!stage) return '';
          const isTitle = idx === 0;
          const st = stage.status || 'todo';
          const statusClassName =
            !isTitle && st === 'done' ? 'is-done' : !isTitle && st === 'doing' ? 'is-doing' : '';
          const sel = stage.id === selectedStageId ? 'is-selected' : '';
          const titleClass = isTitle
            ? `is-title-stage ${statusClass(track.status).replace('is-', 'is-title-')}`
            : '';
          const bodyHtml = isTitle
            ? `<span class="yt-title-stack">
                <span class="yt-title-kicker">Ціль треку</span>
                <span class="yt-stage-title">${escapeHtml(stage.title || 'Без назви')}</span>
                ${
                  reason
                    ? `<span class="yt-title-reason">${escapeHtml(reason)}</span>`
                    : ''
                }
              </span>`
            : `<span class="yt-stage-check is-${escapeHtml(st)}" data-yt-cycle-status
                title="${escapeHtml(STAGE_STATUS_LABELS[st] || '')}"
                aria-label="Статус стадії: ${escapeHtml(STAGE_STATUS_LABELS[st] || '')}">${stageStatusMark(st)}</span>
              <span class="yt-stage-title">${escapeHtml(stage.title || 'Без назви')}</span>`;
          return `
            <button type="button"
              class="yt-stage ${statusClassName} ${sel} ${titleClass}"
              data-yt-stage="${escapeHtml(stage.id)}"
              data-yt-track="${escapeHtml(track.id)}"
              style="left:${sl.x - tl.x}px;top:${sl.y - tl.y}px;width:${sl.width}px;height:${sl.height}px;">
              ${bodyHtml}
            </button>`;
        })
        .join('');
      return `
        <div class="yt-track ${statusClass(track.status)} ${selected}"
          data-yt-track-box="${escapeHtml(track.id)}"
          ${afterAttr}
          style="left:${tl.x}px;top:${tl.y}px;width:${tl.width}px;height:${tl.height}px;z-index:${typeof track.z === 'number' ? track.z : 0};">
          <div class="yt-track-badge" data-yt-track-drag="${escapeHtml(track.id)}">
            <span class="yt-track-status-pill">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="yt-link-zone" data-yt-link-zone="${escapeHtml(track.id)}"
            title="Киньте трек сюди — він ітиме після цього"></div>
          ${stagesHtml}
        </div>`;
    })
    .join('');

  return `
    <div class="yt-canvas" data-yt-canvas style="width:${layout.width}px;height:${layout.height}px;">
      <svg class="yt-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true">
        ${edgePaths}
        ${seqPaths}
      </svg>
      ${tracksHtml}
      ${unlinkHtml}
    </div>`;
}

/**
 * @param {import('./model.js').TrackStatus} selected
 */
function renderTrackStatusDropdown(selected) {
  const options = Object.entries(TRACK_STATUS_LABELS)
    .map(
      ([value, label]) => `
      <div class="custom-dropdown-option ${value === selected ? 'selected' : ''}" data-yt-status-value="${escapeHtml(value)}">
        <span class="option-check">${value === selected ? '✓' : ''}</span>
        <span class="option-label">${escapeHtml(label)}</span>
      </div>`,
    )
    .join('');

  return `
    <div class="yt-field">
      <span>Статус треку</span>
      <div class="custom-dropdown compact" data-yt-status-dd>
        <div class="custom-dropdown-selected">${escapeHtml(TRACK_STATUS_LABELS[selected] || '—')}</div>
        <div class="custom-dropdown-options">
          ${options}
        </div>
      </div>
    </div>`;
}

/**
 * @param {import('./model.js').StageStatus} selected
 */
function renderStageStatusDropdown(selected) {
  const options = Object.entries(STAGE_STATUS_LABELS)
    .map(
      ([value, label]) => `
      <div class="custom-dropdown-option ${value === selected ? 'selected' : ''}" data-yt-stage-status-value="${escapeHtml(value)}">
        <span class="option-check">${value === selected ? '✓' : ''}</span>
        <span class="option-label">${escapeHtml(label)}</span>
      </div>`,
    )
    .join('');

  return `
    <div class="yt-field">
      <span>Статус стадії</span>
      <div class="custom-dropdown compact" data-yt-stage-status-dd>
        <div class="custom-dropdown-selected">${escapeHtml(STAGE_STATUS_LABELS[selected] || '—')}</div>
        <div class="custom-dropdown-options">
          ${options}
        </div>
      </div>
    </div>`;
}

/**
 * @param {import('./model.js').YearTrack | null} track
 * @param {import('./model.js').TrackStage | null} stage
 * @param {number} stageIndex
 */
function renderPanel(track, stage, stageIndex) {
  if (!track || !stage) {
    return `
      <h3>Деталі</h3>
      <p class="yt-hint">${
        window.matchMedia('(pointer: coarse)').matches
          ? 'Торкніться стадії, щоб відкрити деталі. Масштаб — двома пальцями, полотно рухається одним. Перетягніть трек на правий край іншого, щоб зробити «потім».'
          : 'Оберіть стадію на полотні. Зум: Ctrl/⌘+scroll або pinch. Панорама: scroll / Space+drag. Перетягніть трек на правий край іншого, щоб зробити «потім».'
      }</p>`;
  }

  const isTitle = stageIndex === 0;
  const showReason =
    track.status === 'blocked' || track.status === 'paused' || track.status === 'dropped';
  const reasonCopy =
    track.status === 'paused'
      ? { label: 'Причина паузи', placeholder: 'Чому трек на паузі…' }
      : track.status === 'dropped'
        ? { label: 'Чому не робити', placeholder: 'Чому цей трек не робити…' }
        : { label: 'Причина блокування', placeholder: 'Чому трек заблоковано…' };
  const reasonBlock = showReason
    ? `<div class="yt-field">
          <span>${reasonCopy.label}</span>
          <textarea data-yt-field="status-reason" class="yt-autosize" rows="2" placeholder="${reasonCopy.placeholder}">${escapeHtml(track.statusReason || '')}</textarea>
        </div>`
    : '';
  return `
    <h3>${isTitle ? 'Назва треку' : 'Стадія'}</h3>
    <div class="yt-field">
      <span>Назва</span>
      <textarea data-yt-field="stage-title" class="yt-autosize" rows="1" placeholder="${isTitle ? 'Назва треку' : 'Назва стадії'}">${escapeHtml(stage.title || '')}</textarea>
    </div>
    ${renderTrackStatusDropdown(track.status)}
    ${reasonBlock}
    ${isTitle ? '' : renderStageStatusDropdown(stage.status || 'todo')}
    ${isTitle ? '' : `<p class="yt-hint">У треку лише одна стадія «В процесі». Клік по індикатору: Очікує → В процесі → Готово.</p>`}
    <div class="yt-row-actions">
      ${
        isTitle
          ? `<button type="button" class="yt-btn yt-btn-secondary" data-yt-add-stage>+ Стадія знизу</button>
             <button type="button" class="yt-btn yt-btn-danger" data-yt-delete-track>Видалити трек</button>`
          : `<button type="button" class="yt-btn yt-btn-secondary" data-yt-add-stage>+ Стадія знизу</button>
             <button type="button" class="yt-btn yt-btn-danger" data-yt-delete-stage>Видалити стадію</button>`
      }
    </div>`;
}

function bindPanel(root, ctx) {
  const {
    selectedTrack,
    selectedStage,
    onUpdateTrack,
    onChangeTrackStatus,
    onDeleteTrack,
    onAddStage,
    onUpdateStage,
    onDeleteStage,
  } = ctx;

  if (!selectedTrack) return;

  /**
   * @param {string} ddAttr
   * @param {string} valueAttr
   * @param {(value: string) => void} onPick
   */
  const bindDropdown = (ddAttr, valueAttr, onPick) => {
    const dd = root.querySelector(`[${ddAttr}]`);
    if (!(dd instanceof HTMLElement)) return;
    dd.addEventListener('click', (e) => {
      e.stopPropagation();
      const option = e.target instanceof Element ? e.target.closest(`[${valueAttr}]`) : null;
      if (option) {
        const value = option.getAttribute(valueAttr);
        dd.classList.remove('open');
        if (value) onPick(value);
        return;
      }
      const willOpen = !dd.classList.contains('open');
      document.querySelectorAll('.custom-dropdown.open').forEach((el) => {
        if (el !== dd) el.classList.remove('open');
      });
      dd.classList.toggle('open', willOpen);
    });
  };

  bindDropdown('data-yt-status-dd', 'data-yt-status-value', (value) => {
    onChangeTrackStatus(selectedTrack, /** @type {any} */ (value));
  });

  const reasonEl = root.querySelector('[data-yt-field="status-reason"]');
  if (reasonEl instanceof HTMLTextAreaElement) {
    const saveReason = () => {
      onUpdateTrack({ ...selectedTrack, statusReason: reasonEl.value });
    };
    reasonEl.addEventListener('input', () => autosizeTextarea(reasonEl));
    reasonEl.addEventListener('change', saveReason);
    reasonEl.addEventListener('blur', saveReason);
  }

  root.querySelector('[data-yt-add-stage]')?.addEventListener('click', () => {
    onAddStage(selectedTrack.id);
  });
  root.querySelector('[data-yt-delete-track]')?.addEventListener('click', () => {
    onDeleteTrack(selectedTrack.id);
  });

  if (!selectedStage) return;

  bindDropdown('data-yt-stage-status-dd', 'data-yt-stage-status-value', (value) => {
    onUpdateStage(selectedTrack.id, {
      ...selectedStage,
      status: /** @type {any} */ (value),
    });
  });

  const titleEl = root.querySelector('[data-yt-field="stage-title"]');
  if (titleEl instanceof HTMLTextAreaElement) {
    const saveTitle = () => {
      onUpdateStage(selectedTrack.id, { ...selectedStage, title: titleEl.value });
    };
    titleEl.addEventListener('input', () => autosizeTextarea(titleEl));
    titleEl.addEventListener('change', saveTitle);
    titleEl.addEventListener('blur', saveTitle);
  }

  root.querySelector('[data-yt-delete-stage]')?.addEventListener('click', () => {
    onDeleteStage(selectedTrack.id, selectedStage.id);
  });
}

let spaceHeld = false;
let panKeysBound = false;
let panOffsetX = 0;
let panOffsetY = 0;
/** @type {number} viewport zoom — survives re-renders */
let viewZoom = 1;
/** Right details panel visibility — survives re-renders */
let panelOpen = true;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;

function isTracksOpen() {
  return document.getElementById('year-tracks-modal')?.classList.contains('active');
}

function isTypingTarget(t) {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && t.isContentEditable)
  );
}

function applyViewportTransform(canvas) {
  if (!(canvas instanceof HTMLElement)) return;
  canvas.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${viewZoom})`;
}

function syncZoomLabel() {
  document.querySelectorAll('[data-yt-zoom-reset]').forEach((el) => {
    el.textContent = `${Math.round(viewZoom * 100)}%`;
  });
}

/**
 * Zoom toward a point in the wrap (client coords). Center if omitted.
 * @param {Element | null} wrap
 * @param {number} factor
 * @param {{ clientX?: number, clientY?: number }} [pivot]
 */
function zoomAt(wrap, factor, pivot = {}) {
  if (!(wrap instanceof HTMLElement)) return;
  const canvas = wrap.querySelector('[data-yt-canvas]');
  if (!(canvas instanceof HTMLElement)) return;

  const rect = wrap.getBoundingClientRect();
  const mx =
    typeof pivot.clientX === 'number' ? pivot.clientX - rect.left : rect.width / 2;
  const my =
    typeof pivot.clientY === 'number' ? pivot.clientY - rect.top : rect.height / 2;

  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewZoom * factor));
  if (Math.abs(next - viewZoom) < 0.0001) return;

  const canvasX = (mx - panOffsetX) / viewZoom;
  const canvasY = (my - panOffsetY) / viewZoom;
  viewZoom = next;
  panOffsetX = mx - canvasX * viewZoom;
  panOffsetY = my - canvasY * viewZoom;
  applyViewportTransform(canvas);
  syncZoomLabel();
}

/** @param {Element | null} wrap */
function resetZoom(wrap) {
  viewZoom = 1;
  panOffsetX = 0;
  panOffsetY = 0;
  if (wrap instanceof HTMLElement) {
    const canvas = wrap.querySelector('[data-yt-canvas]');
    applyViewportTransform(canvas);
  }
  syncZoomLabel();
}

function ensureSpacePanKeys() {
  if (panKeysBound) return;
  panKeysBound = true;

  const setSpace = (on) => {
    spaceHeld = on;
    document.querySelectorAll('[data-yt-canvas-wrap]').forEach((el) => {
      el.classList.toggle('is-space-pan', on);
      if (!on) el.classList.remove('is-panning');
    });
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (!isTracksOpen()) return;
      if (isTypingTarget(e.target)) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        setSpace(true);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const wrap = document.querySelector('#year-tracks-modal [data-yt-canvas-wrap]');
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomAt(wrap, 1.15);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomAt(wrap, 1 / 1.15);
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom(wrap);
      }
    },
    true,
  );

  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      setSpace(false);
    },
    true,
  );

  window.addEventListener('blur', () => setSpace(false));
}

function bindCanvasInteractions(root, { board, onSelect, onCycleStageStatus, onMoveTrack, onLinkAfter, onUnlinkAfter }) {
  ensureSpacePanKeys();

  const wrap = root.querySelector('[data-yt-canvas-wrap]');
  const canvas = root.querySelector('[data-yt-canvas]');
  if (!canvas || !wrap) return;

  applyViewportTransform(canvas);
  syncZoomLabel();
  if (spaceHeld) wrap.classList.add('is-space-pan');

  let dragTrackId = null;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;
  let moved = false;

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

  const startPan = (pe) => {
    panning = true;
    panStartX = pe.clientX;
    panStartY = pe.clientY;
    panOriginX = panOffsetX;
    panOriginY = panOffsetY;
    wrap.classList.add('is-panning');
    try {
      wrap.setPointerCapture(pe.pointerId);
    } catch {
      /* ignore */
    }
  };

  const movePan = (pe) => {
    if (!panning) return;
    panOffsetX = panOriginX + (pe.clientX - panStartX);
    panOffsetY = panOriginY + (pe.clientY - panStartY);
    applyViewportTransform(canvas);
  };

  const endPan = () => {
    if (!panning) return;
    panning = false;
    wrap.classList.remove('is-panning');
  };

  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (!spaceHeld && e.button !== 1) return;
      const pe = /** @type {PointerEvent} */ (e);
      pe.preventDefault();
      pe.stopPropagation();
      startPan(pe);
    },
    true,
  );

  wrap.addEventListener('pointermove', (e) => {
    if (!panning) return;
    e.preventDefault();
    movePan(/** @type {PointerEvent} */ (e));
  });

  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);
  wrap.addEventListener('lostpointercapture', endPan);
  wrap.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  wrap.addEventListener('dragstart', (e) => {
    if (spaceHeld || panning) e.preventDefault();
  });

  // Figma-like: Ctrl/⌘ + wheel / trackpad pinch → zoom; plain wheel → pan
  bindTouchGestures(wrap, {
    startPan,
    endPan,
    isPanning: () => panning,
    pinch: (factor, clientX, clientY, dx, dy) => {
      zoomAt(wrap, factor, { clientX, clientY });
      panOffsetX += dx;
      panOffsetY += dy;
      applyViewportTransform(canvas);
    },
  });

  wrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const zoomGesture = e.ctrlKey || e.metaKey;
      if (zoomGesture) {
        // ctrl+wheel / pinch: deltaY is often small; use exponential factor
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomAt(wrap, factor, { clientX: e.clientX, clientY: e.clientY });
        return;
      }
      panOffsetX -= e.deltaX;
      panOffsetY -= e.deltaY;
      applyViewportTransform(canvas);
    },
    { passive: false },
  );

  canvas.querySelectorAll('[data-yt-unlink]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sid = btn.getAttribute('data-yt-unlink');
      if (sid) onUnlinkAfter(sid);
    });
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  });

  /**
   * @param {PointerEvent} pe
   */
  const canvasPoint = (pe) => {
    const rect = wrap.getBoundingClientRect();
    return {
      x: (pe.clientX - rect.left - panOffsetX) / viewZoom,
      y: (pe.clientY - rect.top - panOffsetY) / viewZoom,
    };
  };

  /**
   * @param {{ x: number, y: number }} pt
   * @param {string} draggedId
   */
  const hitLinkPredecessor = (pt, draggedId) => {
    const zones = canvas.querySelectorAll('[data-yt-link-zone]');
    for (const zone of zones) {
      const id = zone.getAttribute('data-yt-link-zone');
      if (!id || id === draggedId) continue;
      const other = canvas.querySelector(`[data-yt-track-box="${id}"]`);
      if (!(other instanceof HTMLElement)) continue;
      const bx = parseFloat(other.style.left) || 0;
      const by = parseFloat(other.style.top) || 0;
      const bw = parseFloat(other.style.width) || 0;
      const bh = parseFloat(other.style.height) || 0;
      if (pt.x >= bx + bw - 10 && pt.x <= bx + bw + 32 && pt.y >= by && pt.y <= by + bh) {
        return id;
      }
    }
    return null;
  };

  canvas.querySelectorAll('[data-yt-track-drag]').forEach((badge) => {
    const trackId = badge.getAttribute('data-yt-track-drag');
    const box = canvas.querySelector(`[data-yt-track-box="${trackId}"]`);
    /** @type {string | null} */
    let linkPred = null;

    badge.addEventListener('pointerdown', (e) => {
      if (spaceHeld || e.button === 1 || panning) return;
      const track = board.tracks.find((t) => t.id === trackId);
      if (!track) return;
      const pe = /** @type {PointerEvent} */ (e);
      dragTrackId = trackId;
      moved = false;
      linkPred = null;
      startX = pe.clientX;
      startY = pe.clientY;
      origX = typeof track.x === 'number' ? track.x : 80;
      origY = typeof track.y === 'number' ? track.y : 80;
      if (box instanceof HTMLElement) box.classList.add('is-dragging');
      try {
        /** @type {HTMLElement} */ (badge).setPointerCapture(pe.pointerId);
      } catch {
        /* ignore */
      }
      pe.stopPropagation();
    });

    badge.addEventListener('pointermove', (e) => {
      if (dragTrackId !== trackId) return;
      const pe = /** @type {PointerEvent} */ (e);
      const dx = (pe.clientX - startX) / viewZoom;
      const dy = (pe.clientY - startY) / viewZoom;
      if (Math.abs(dx) + Math.abs(dy) > 4 / viewZoom) moved = true;
      if (!moved || !(box instanceof HTMLElement)) return;
      canvas.classList.add('is-dragging');
      box.classList.add('is-dragging');
      box.style.left = `${origX + dx}px`;
      box.style.top = `${origY + dy}px`;
      linkPred = hitLinkPredecessor(canvasPoint(pe), trackId);
      canvas.querySelectorAll('[data-yt-track-box]').forEach((el) => {
        el.classList.toggle(
          'is-link-target',
          el.getAttribute('data-yt-track-box') === linkPred,
        );
      });
    });

    badge.addEventListener('pointerup', () => {
      if (dragTrackId !== trackId) return;
      dragTrackId = null;
      canvas.classList.remove('is-dragging');
      if (box instanceof HTMLElement) box.classList.remove('is-dragging');
      canvas.querySelectorAll('[data-yt-track-box]').forEach((el) => {
        el.classList.remove('is-link-target');
      });
      if (moved && box instanceof HTMLElement) {
        if (linkPred && trackId) {
          onLinkAfter(trackId, linkPred);
          return;
        }
        const nx = Math.round(parseFloat(box.style.left) || origX);
        const ny = Math.round(parseFloat(box.style.top) || origY);
        onMoveTrack(trackId, nx, ny);
      } else if (trackId) {
        const track = board.tracks.find((t) => t.id === trackId);
        const firstStageId = track?.stages?.[0]?.id || null;
        onSelect(trackId, firstStageId);
      }
    });
  });

  canvas.querySelectorAll('[data-yt-stage]').forEach((stageEl) => {
    const stageId = stageEl.getAttribute('data-yt-stage');
    const trackId = stageEl.getAttribute('data-yt-track');

    stageEl.addEventListener('pointerdown', (e) => {
      if (spaceHeld || e.button === 1 || panning) return;
      e.stopPropagation();
    });

    stageEl.addEventListener('click', (e) => {
      if (spaceHeld || panning) return;
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('[data-yt-cycle-status]')) {
        e.preventDefault();
        e.stopPropagation();
        if (trackId && stageId) onCycleStageStatus(trackId, stageId);
        return;
      }
      if (trackId) onSelect(trackId, stageId);
    });
  });
}
