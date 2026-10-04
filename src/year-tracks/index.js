import './styles.css';
import {
  currentYear,
  createTrack,
  createStage,
  emptyDoc,
  ensureBoard,
  setBoard,
  normalizeDoc,
  nextStageStatus,
  withStageStatus,
  carryUnfinishedTracks,
  getCarryPreview,
  trackStatusReason,
  statusKeepsReason,
  unlinkAfter,
  withAfterId,
  wouldCreateCycle,
  bringToFront,
} from './model.js';
import { fetchDocFromServer, saveDocToServer } from './api.js';
import { renderYearTracksApp } from './render.js';
import { findFreeSlot, TRACK_WIDTH, TRACK_GAP } from './layout.js';

const STATUS_REASON_COPY = {
  paused: {
    title: 'Чому трек на паузі?',
    placeholder: 'Наприклад: чекаю бригаду з травня…',
    confirmLabel: 'Пауза',
  },
  blocked: {
    title: 'Чому трек заблоковано?',
    placeholder: 'Наприклад: чекаю рішення по бюджету…',
    confirmLabel: 'Заблокувати',
  },
  dropped: {
    title: 'Чому не робити?',
    placeholder: 'Наприклад: не мій стек — свідоме ні…',
    confirmLabel: 'Не робити',
  },
};

/** @type {null | (() => { userId?: string, name?: string, surname?: string, accountType?: string, authenticated?: boolean, apiUrl?: string })} */
let getSession = null;

/** @type {import('./model.js').YearTracksDoc} */
let doc = emptyDoc();
let year = currentYear();
/** @type {string | null} */
let selectedTrackId = null;
/** @type {string | null} */
let selectedStageId = null;
let saveStatus = '';
let saveTimer = null;
let mounted = false;
/** True only after a successful load for the current session open. */
let hydrated = false;
/** True when local doc diverged from last loaded/saved snapshot via user edits. */
let dirty = false;

/**
 * Bind year-tracks module to the host app.
 * Isolated from finance state — only reads session via getter.
 *
 * @param {{ getSession: typeof getSession }} deps
 */
export function initYearTracks(deps) {
  getSession = deps.getSession;
  ensureDom();
  mounted = true;
  syncNavVisibility();
}

export function syncYearTracksNavVisibility() {
  syncNavVisibility();
}

/** Latest in-memory tracks doc (empty if the board was never opened this session). */
export function getYearTracksDocSnapshot() {
  return normalizeDoc(doc);
}

export function openYearTracks() {
  if (!mounted) ensureDom();
  const session = getSession?.() || {};
  if (!session.userId) return;

  const modal = document.getElementById('year-tracks-modal');
  if (!modal) return;

  modal.classList.add('active');
  year = currentYear();
  selectedTrackId = null;
  selectedStageId = null;
  hydrated = false;
  dirty = false;
  saveStatus = 'Завантаження…';
  paint();

  fetchDocFromServer({
    apiUrl: session.apiUrl || '',
    userId: session.userId,
    authenticated: session.authenticated !== false && Boolean(session.userId),
  }).then((loaded) => {
    doc = normalizeDoc(loaded);
    const before = JSON.stringify(doc);
    const ensured = ensureBoard(doc, year);
    doc = ensured.doc;
    hydrated = true;
    dirty = JSON.stringify(doc) !== before;
    saveStatus = ensured.board.tracks.length ? 'Завантажено' : '';
    // ensureBoard may create an empty year board — do not push blank docs that wipe history.
    if (dirty && Object.keys(normalizeDoc(loaded).boards || {}).length > 0) {
      scheduleSave(true);
    }
    paint();
  });
}

export function closeYearTracks(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('year-tracks-modal');
  const wasOpen = modal?.classList.contains('active');
  if (modal) modal.classList.remove('active');
  if (wasOpen && hydrated && dirty) flushSave();
  if (wasOpen && typeof window.__onSkryniaOverlayClosed === 'function') {
    window.__onSkryniaOverlayClosed();
  }
}

function ensureDom() {
  // Nav entry lives in host «Скриня» switcher — only ensure modal DOM here.
  document.getElementById('btn-year-tracks')?.remove();

  let modal = document.getElementById('year-tracks-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'year-tracks-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', closeYearTracks);
    modal.innerHTML = `
      <div class="modal-content yt-modal-content" data-stop-propagation="1">
        <div id="year-tracks-root"></div>
      </div>`;
    document.body.appendChild(modal);
  }

  if (!document.getElementById('yt-reason-modal')) {
    const reasonModal = document.createElement('div');
    reasonModal.id = 'yt-reason-modal';
    reasonModal.className = 'yt-reason-overlay';
    reasonModal.innerHTML = `
      <div class="yt-reason-card" role="dialog" aria-modal="true" aria-labelledby="yt-reason-title">
        <h3 id="yt-reason-title">Чому трек заблоковано?</h3>
        <p id="yt-reason-hint" class="yt-reason-text">Вкажіть причину — без неї статус не зміниться.</p>
        <textarea id="yt-reason-input" class="yt-reason-input" rows="3" placeholder="Наприклад: чекаю рішення по бюджету…"></textarea>
        <div class="yt-reason-actions">
          <button type="button" class="yt-btn yt-btn-secondary" data-yt-reason-cancel>Скасувати</button>
          <button type="button" class="yt-btn yt-btn-primary" data-yt-reason-ok>Заблокувати</button>
        </div>
      </div>`;
    document.body.appendChild(reasonModal);
  }
}

/**
 * @param {{ title?: string, hint?: string, placeholder?: string, value?: string, confirmLabel?: string }} opts
 * @returns {Promise<string | null>}
 */
function askStatusReason(opts = {}) {
  ensureDom();
  const modal = document.getElementById('yt-reason-modal');
  const input = document.getElementById('yt-reason-input');
  const titleEl = document.getElementById('yt-reason-title');
  const hintEl = document.getElementById('yt-reason-hint');
  if (!modal || !(input instanceof HTMLTextAreaElement)) {
    const fallback = window.prompt(opts.title || 'Чому трек заблоковано?', opts.value || '');
    return Promise.resolve(fallback && fallback.trim() ? fallback.trim() : null);
  }

  if (titleEl) titleEl.textContent = opts.title || 'Чому трек заблоковано?';
  if (hintEl) {
    hintEl.textContent = opts.hint || 'Вкажіть причину — без неї статус не зміниться.';
  }
  input.placeholder = opts.placeholder || 'Наприклад: чекаю рішення по бюджету…';
  input.value = opts.value || '';
  input.classList.remove('is-invalid');
  modal.classList.add('is-open');
  setTimeout(() => input.focus(), 0);

  return new Promise((resolve) => {
    const cleanup = () => {
      modal.classList.remove('is-open');
      okBtn?.removeEventListener('click', onOk);
      cancelBtn?.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      input.removeEventListener('keydown', onKey);
    };
    const onOk = () => {
      const reason = input.value.trim();
      if (!reason) {
        input.focus();
        input.classList.add('is-invalid');
        return;
      }
      input.classList.remove('is-invalid');
      cleanup();
      resolve(reason);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onBackdrop = (e) => {
      if (e.target === modal) onCancel();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onOk();
    };

    const okBtn = modal.querySelector('[data-yt-reason-ok]');
    const cancelBtn = modal.querySelector('[data-yt-reason-cancel]');
    const okLabel = modal.querySelector('[data-yt-reason-ok]');
    if (okLabel) okLabel.textContent = opts.confirmLabel || 'Заблокувати';

    okBtn?.addEventListener('click', onOk);
    cancelBtn?.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    input.addEventListener('keydown', onKey);
  });
}

function syncNavVisibility() {
  // Host app owns «Скриня» switcher visibility.
  document.getElementById('btn-year-tracks')?.remove();
}

function getBoard() {
  const { doc: next, board } = ensureBoard(doc, year);
  doc = next;
  return board;
}

function paint() {
  const root = document.getElementById('year-tracks-root');
  if (!root) return;

  const active = document.activeElement;
  const focusField =
    active instanceof HTMLElement && root.contains(active)
      ? active.getAttribute('data-yt-field')
      : null;
  const selectionStart =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active.selectionStart
      : null;
  const selectionEnd =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active.selectionEnd
      : null;

  const board = getBoard();

  renderYearTracksApp(root, {
    year,
    board,
    selectedTrackId,
    selectedStageId,
    saveStatus,
    onClose: () => closeYearTracks(),
    onChangeYear: handleChangeYear,
    onSelect: handleSelect,
    onAddTrack: handleAddTrack,
    onUpdateTrack: handleUpdateTrack,
    onChangeTrackStatus: handleChangeTrackStatus,
    onDeleteTrack: requestDeleteTrack,
    onAddStage: handleAddStage,
    onUpdateStage: handleUpdateStage,
    onDeleteStage: handleDeleteStage,
    onCycleStageStatus: handleCycleStageStatus,
    onMoveTrack: handleMoveTrack,
    onLinkAfter: handleLinkAfter,
    onUnlinkAfter: handleUnlinkAfter,
  });

  if (focusField) {
    const next = root.querySelector(`[data-yt-field="${focusField}"]`);
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      next.focus({ preventScroll: true });
      if (selectionStart != null && selectionEnd != null) {
        try {
          next.setSelectionRange(selectionStart, selectionEnd);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/** @param {number} nextYear */
function handleChangeYear(nextYear) {
  flushSave();
  const fromYear = year;
  year = nextYear;
  selectedTrackId = null;
  selectedStageId = null;

  // Open the year first (empty if new). Never auto-copy into the past.
  const preview = getCarryPreview(doc, fromYear, year);
  doc = preview.doc;
  paint();

  if (!preview.canCarry) return;

  const title = 'Перенести треки в новий рік?';
  const message =
    `З ${fromYear} у ${year} можна перенести ${preview.count} незавершених треків ` +
    `(статус не «Реалізовано»). Минулі роки не зміняться. Перенести?`;

  const doCarry = () => {
    // Re-check: still only forward + empty target
    const result = carryUnfinishedTracks(doc, fromYear, year);
    doc = result.doc;
    if (result.carried > 0) {
      saveStatus = `Перенесено незавершених треків: ${result.carried}`;
      scheduleSave();
      paint();
    }
  };

  if (typeof window.showConfirm === 'function') {
    window.showConfirm(title, message, doCarry, {
      confirm: 'Перенести',
      cancel: 'Порожній рік',
    });
    return;
  }
  if (window.confirm(message)) doCarry();
}

/**
 * @param {string | null} trackId
 * @param {string | null} stageId
 */
function handleSelect(trackId, stageId) {
  selectedTrackId = trackId;
  selectedStageId = stageId;
  paint();
}

function handleAddTrack() {
  const board = getBoard();
  const slot = findFreeSlot(board);
  const maxZ = board.tracks.reduce((m, t) => Math.max(m, typeof t.z === 'number' ? t.z : 0), 0);
  const track = createTrack({
    status: 'active',
    x: slot.x,
    y: slot.y,
    z: maxZ + 1,
    stages: [createStage({ title: 'Нова ціль' })],
  });
  doc = setBoard(doc, year, {
    ...board,
    tracks: [...board.tracks, track],
  });
  selectedTrackId = track.id;
  selectedStageId = track.stages[0]?.id || null;
  scheduleSave();
  paint();
}

/** @param {import('./model.js').YearTrack} track */
function handleUpdateTrack(track) {
  const board = getBoard();
  doc = setBoard(doc, year, {
    ...board,
    tracks: board.tracks.map((t) => (t.id === track.id ? track : t)),
  });
  scheduleSave();
  paint();
}

/**
 * @param {import('./model.js').YearTrack} track
 * @param {import('./model.js').TrackStatus} status
 */
async function handleChangeTrackStatus(track, status) {
  if (statusKeepsReason(status)) {
    const copy = STATUS_REASON_COPY[status] || STATUS_REASON_COPY.blocked;
    const reason = await askStatusReason({
      title: copy.title,
      hint: 'Вкажіть причину — без неї статус не зміниться.',
      placeholder: copy.placeholder,
      confirmLabel: copy.confirmLabel,
      value: trackStatusReason(track),
    });
    if (!reason) return;
    handleUpdateTrack({ ...track, status, statusReason: reason });
    return;
  }
  handleUpdateTrack({
    ...track,
    status,
    statusReason: '',
  });
}

/** @param {string} trackId */
function requestDeleteTrack(trackId) {
  const board = getBoard();
  const track = board.tracks.find((t) => t.id === trackId);
  const label = track?.stages?.[0]?.title || 'трек';
  const title = 'Видалити трек?';
  const message = `Видалити «${label}» і всі його стадії?`;

  if (typeof window.showConfirm === 'function') {
    window.showConfirm(title, message, () => handleDeleteTrack(trackId));
    return;
  }
  if (window.confirm(message)) handleDeleteTrack(trackId);
}

/** @param {string} trackId */
function handleDeleteTrack(trackId) {
  const board = getBoard();
  doc = setBoard(doc, year, {
    ...board,
    tracks: unlinkAfter(board.tracks, trackId),
  });
  if (selectedTrackId === trackId) {
    selectedTrackId = null;
    selectedStageId = null;
  }
  scheduleSave();
  paint();
}

/** @param {string} trackId */
function handleAddStage(trackId) {
  const board = getBoard();
  const stage = createStage({ title: '' });
  doc = setBoard(doc, year, {
    ...board,
    tracks: board.tracks.map((t) =>
      t.id === trackId ? { ...t, stages: [...t.stages, stage] } : t,
    ),
  });
  selectedTrackId = trackId;
  selectedStageId = stage.id;
  scheduleSave();
  paint();
}

/**
 * @param {string} trackId
 * @param {import('./model.js').TrackStage} stage
 */
function handleUpdateStage(trackId, stage) {
  const board = getBoard();
  doc = setBoard(doc, year, {
    ...board,
    tracks: board.tracks.map((t) => {
      if (t.id !== trackId) return t;
      // Status change goes through withStageStatus (one "doing" per track)
      if (stage.status && stage.status !== t.stages.find((s) => s.id === stage.id)?.status) {
        const withStatus = withStageStatus(t, stage.id, stage.status);
        return {
          ...withStatus,
          stages: withStatus.stages.map((s) =>
            s.id === stage.id ? { ...s, title: stage.title } : s,
          ),
        };
      }
      return {
        ...t,
        stages: t.stages.map((s) => (s.id === stage.id ? { ...s, ...stage } : s)),
      };
    }),
  });
  scheduleSave();
  paint();
}

/**
 * @param {string} trackId
 * @param {string} stageId
 */
function handleDeleteStage(trackId, stageId) {
  const board = getBoard();
  const track = board.tracks.find((t) => t.id === trackId);
  if (!track) return;
  if (track.stages[0]?.id === stageId) {
    saveStatus = 'Першу стадію (назву треку) видалити не можна';
    paint();
    return;
  }
  if (track.stages.length <= 1) {
    saveStatus = 'У треку має бути хоча б одна стадія';
    paint();
    return;
  }
  doc = setBoard(doc, year, {
    ...board,
    tracks: board.tracks.map((t) =>
      t.id === trackId ? { ...t, stages: t.stages.filter((s) => s.id !== stageId) } : t,
    ),
  });
  if (selectedStageId === stageId) selectedStageId = null;
  scheduleSave();
  paint();
}

/**
 * @param {string} trackId
 * @param {string} stageId
 */
function handleCycleStageStatus(trackId, stageId) {
  const board = getBoard();
  const track = board.tracks.find((t) => t.id === trackId);
  if (!track) return;
  // Title stage (first) has no progress status
  if (track.stages[0]?.id === stageId) return;
  const stage = track.stages.find((s) => s.id === stageId);
  if (!stage) return;
  const next = nextStageStatus(stage.status || 'todo');
  doc = setBoard(doc, year, {
    ...board,
    tracks: board.tracks.map((t) => (t.id === trackId ? withStageStatus(t, stageId, next) : t)),
  });
  scheduleSave();
  paint();
}

/**
 * @param {string} trackId
 * @param {number} x
 * @param {number} y
 */
function handleMoveTrack(trackId, x, y) {
  const board = getBoard();
  const raised = bringToFront(board.tracks, trackId);
  doc = setBoard(doc, year, {
    ...board,
    tracks: raised.map((t) => (t.id === trackId ? { ...t, x, y } : t)),
  });
  scheduleSave();
  paint();
}

/**
 * @param {string} successorId dragged track
 * @param {string} predecessorId drop-zone owner
 */
function handleLinkAfter(successorId, predecessorId) {
  const board = getBoard();
  if (successorId === predecessorId) return;
  if (wouldCreateCycle(board.tracks, successorId, predecessorId)) {
    saveStatus = 'Так буде цикл — оберіть інший трек';
    paint();
    return;
  }
  const pred = board.tracks.find((t) => t.id === predecessorId);
  const succ = board.tracks.find((t) => t.id === successorId);
  if (!pred || !succ) return;
  const x = (typeof pred.x === 'number' ? pred.x : 80) + TRACK_WIDTH + TRACK_GAP;
  const y = typeof pred.y === 'number' ? pred.y : 100;
  const linked = bringToFront(withAfterId(board.tracks, successorId, predecessorId), successorId);
  doc = setBoard(doc, year, {
    ...board,
    tracks: linked.map((t) =>
      t.id === successorId ? { ...t, x, y } : t,
    ),
  });
  scheduleSave();
  paint();
}

/** @param {string} successorId */
function handleUnlinkAfter(successorId) {
  const board = getBoard();
  doc = setBoard(doc, year, {
    ...board,
    tracks: withAfterId(board.tracks, successorId, null),
  });
  scheduleSave();
  paint();
}

function scheduleSave(immediate = false) {
  if (!hydrated) return;
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  if (immediate) {
    flushSave();
    return;
  }
  saveStatus = 'Зміни…';
  const statusEl = document.querySelector('[data-yt-save]');
  if (statusEl) statusEl.textContent = saveStatus;
  saveTimer = setTimeout(() => flushSave(), 700);
}

async function flushSave() {
  if (!hydrated || !dirty) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const session = getSession?.() || {};
  if (!session.userId) return;

  saveStatus = 'Збереження…';
  const statusEl = document.querySelector('[data-yt-save]');
  if (statusEl) statusEl.textContent = saveStatus;

  const result = await saveDocToServer({
    apiUrl: session.apiUrl || '',
    userId: session.userId,
    authenticated: session.authenticated !== false && Boolean(session.userId),
    doc,
  });

  if (result.ok && !result.localOnly) dirty = false;

  saveStatus = result.ok
    ? result.localOnly
      ? 'Збережено на цьому пристрої'
      : 'Збережено'
    : 'Збережено локально (сервер недоступний)';
  const el = document.querySelector('[data-yt-save]');
  if (el) el.textContent = saveStatus;
}
