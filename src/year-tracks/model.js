import {
  TRACK_ORIGIN_X,
  TRACK_ORIGIN_Y,
  TRACK_SLOT_X,
} from './layout.js';

/** @typedef {'active' | 'paused' | 'plain' | 'done' | 'blocked' | 'dropped'} TrackStatus */
/** @typedef {'todo' | 'doing' | 'done'} StageStatus */

/**
 * @typedef {object} TrackStage
 * @property {string} id
 * @property {string} title
 * @property {StageStatus} status
 */

/**
 * @typedef {object} YearTrack
 * @property {string} id
 * @property {TrackStatus} status
 * @property {string} statusReason
 * @property {string | null} afterId
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [z]
 * @property {TrackStage[]} stages
 */

/**
 * @typedef {object} YearBoard
 * @property {number} year
 * @property {YearTrack[]} tracks
 */

/**
 * @typedef {object} YearTracksDoc
 * @property {number} version
 * @property {Record<string, YearBoard>} boards
 */

export const YEAR_TRACKS_VERSION = 1;

export const TRACK_STATUS_LABELS = {
  active: 'Активний трек',
  paused: 'На паузі',
  plain: 'Без мітки',
  blocked: 'Заблоковано',
  dropped: 'Не робити',
  done: 'Реалізовано',
};

export const STAGE_STATUS_LABELS = {
  todo: 'Очікує',
  doing: 'В процесі',
  done: 'Готово',
};

/** @param {unknown} value @returns {TrackStatus} */
export function normalizeStatus(value) {
  if (
    value === 'active' ||
    value === 'paused' ||
    value === 'plain' ||
    value === 'done' ||
    value === 'blocked' ||
    value === 'dropped'
  ) {
    return value;
  }
  return 'active';
}

/**
 * @param {unknown} value
 * @param {{ done?: unknown }} [legacy]
 * @returns {StageStatus}
 */
export function normalizeStageStatus(value, legacy = {}) {
  if (value === 'todo' || value === 'doing' || value === 'done') return value;
  // migrate old boolean `done`
  if (legacy.done === true || legacy.done === 1 || legacy.done === '1') return 'done';
  return 'todo';
}

/** @param {StageStatus} status @returns {StageStatus} */
export function nextStageStatus(status) {
  if (status === 'todo') return 'doing';
  if (status === 'doing') return 'done';
  return 'todo';
}

/**
 * Set stage status; at most one `doing` per track (title stage ignored by callers).
 * @param {YearTrack} track
 * @param {string} stageId
 * @param {StageStatus} status
 * @returns {YearTrack}
 */
export function withStageStatus(track, stageId, status) {
  const next = normalizeStageStatus(status);
  return {
    ...track,
    stages: track.stages.map((s) => {
      if (s.id === stageId) return { ...s, status: next };
      if (next === 'doing' && s.status === 'doing') return { ...s, status: 'todo' };
      return s;
    }),
  };
}

/**
 * First stage title is the track name.
 * @param {YearTrack | null | undefined} track
 * @returns {string}
 */
export function trackName(track) {
  const title = track?.stages?.[0]?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : 'Без назви';
}

/**
 * Finished tracks stay in the old year; everything else can roll forward.
 * @param {YearTrack} track
 */
export function isTrackFinished(track) {
  return track?.status === 'done' || track?.status === 'dropped';
}

/** @param {TrackStatus} status */
export function statusKeepsReason(status) {
  return status === 'paused' || status === 'blocked' || status === 'dropped';
}

/**
 * @param {YearTrack | null | undefined} track
 * @returns {string}
 */
export function trackStatusReason(track) {
  if (!statusKeepsReason(track?.status || 'plain')) return '';
  if (typeof track?.statusReason === 'string' && track.statusReason.trim()) {
    return track.statusReason.trim();
  }
  return '';
}

/**
 * @param {Partial<YearTrack> & { blockedReason?: unknown }} partial
 * @param {TrackStatus} status
 * @returns {string}
 */
function readStatusReason(partial, status) {
  if (!statusKeepsReason(status)) return '';
  if (typeof partial.statusReason === 'string' && partial.statusReason.trim()) {
    return partial.statusReason;
  }
  if (typeof partial.blockedReason === 'string' && partial.blockedReason.trim()) {
    return partial.blockedReason;
  }
  return '';
}

/**
 * @param {string | null | undefined} afterId
 * @param {string} selfId
 * @returns {string | null}
 */
export function normalizeAfterId(afterId, selfId) {
  if (typeof afterId !== 'string' || !afterId || afterId === selfId) return null;
  return afterId;
}

/**
 * Walking predecessor chain from `predecessorId` reaches `successorId`.
 * @param {YearTrack[]} tracks
 * @param {string} successorId
 * @param {string | null} predecessorId
 */
export function wouldCreateCycle(tracks, successorId, predecessorId) {
  if (!predecessorId || predecessorId === successorId) return true;
  const byId = new Map((tracks || []).map((t) => [t.id, t]));
  if (!byId.has(predecessorId) || !byId.has(successorId)) return true;
  let cur = predecessorId;
  let guard = 0;
  while (cur && guard < tracks.length + 2) {
    guard += 1;
    if (cur === successorId) return true;
    cur = byId.get(cur)?.afterId || null;
  }
  return false;
}

/**
 * Drop dangling / cyclic afterId refs.
 * @param {YearTrack[]} tracks
 * @returns {YearTrack[]}
 */
export function sanitizeAfterIds(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const ids = new Set(list.map((t) => t.id));
  const droppedIds = new Set(list.filter((t) => t.status === 'dropped').map((t) => t.id));
  const cleared = list.map((t) => {
    if (t.status === 'dropped') return { ...t, afterId: null };
    const afterId = normalizeAfterId(t.afterId, t.id);
    if (!afterId || !ids.has(afterId) || droppedIds.has(afterId)) return { ...t, afterId: null };
    return { ...t, afterId };
  });
  const byId = new Map(cleared.map((t) => [t.id, t]));
  return cleared.map((t) => {
    if (!t.afterId) return t;
    if (wouldCreateCycle(cleared, t.id, t.afterId)) return { ...t, afterId: null };
    // unreachable leftover — keep
    return byId.get(t.id) || t;
  });
}

/**
 * @param {YearTrack[]} tracks
 * @param {string} deletedId
 * @returns {YearTrack[]}
 */
export function unlinkAfter(tracks, deletedId) {
  return (tracks || [])
    .filter((t) => t.id !== deletedId)
    .map((t) => (t.afterId === deletedId ? { ...t, afterId: null } : t));
}

/**
 * Linear paths from roots following afterId (successor.afterId = predecessor).
 * Forks become separate paths that share a prefix. Dropped tracks are omitted.
 * @param {YearTrack[]} tracks
 * @returns {YearTrack[][]}
 */
export function listSequenceChains(tracks) {
  const list = (tracks || []).filter((t) => t && t.status !== 'dropped');
  const byId = new Map(list.map((t) => [t.id, t]));
  /** @type {Map<string, YearTrack[]>} */
  const successors = new Map();
  for (const t of list) {
    if (!t.afterId || !byId.has(t.afterId)) continue;
    const arr = successors.get(t.afterId) || [];
    arr.push(t);
    successors.set(t.afterId, arr);
  }
  for (const arr of successors.values()) {
    arr.sort(compareTracksForChain);
  }

  let roots = list.filter((t) => !t.afterId || !byId.has(t.afterId));
  if (!roots.length && list.length) roots = [...list].sort(compareTracksForChain).slice(0, 1);
  roots.sort(compareTracksForChain);

  /** @type {YearTrack[][]} */
  const chains = [];
  /**
   * @param {YearTrack} node
   * @param {YearTrack[]} prefix
   */
  function walk(node, prefix) {
    const path = [...prefix, node];
    const next = successors.get(node.id) || [];
    if (!next.length) {
      chains.push(path);
      return;
    }
    for (const s of next) {
      if (path.some((p) => p.id === s.id)) {
        chains.push(path);
        continue;
      }
      walk(s, path);
    }
  }

  const covered = new Set();
  for (const r of roots) {
    walk(r, []);
    chains.forEach((c) => c.forEach((n) => covered.add(n.id)));
  }
  for (const t of list) {
    if (covered.has(t.id)) continue;
    walk(t, []);
    chains.forEach((c) => c.forEach((n) => covered.add(n.id)));
  }
  return chains;
}

/** @param {YearTrack} a @param {YearTrack} b */
function compareTracksForChain(a, b) {
  const ay = typeof a.y === 'number' ? a.y : 0;
  const by = typeof b.y === 'number' ? b.y : 0;
  if (ay !== by) return ay - by;
  const ax = typeof a.x === 'number' ? a.x : 0;
  const bx = typeof b.x === 'number' ? b.x : 0;
  if (ax !== bx) return ax - bx;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * Last interacted track stays above others after reload.
 * @param {YearTrack[]} tracks
 * @param {string} trackId
 * @returns {YearTrack[]}
 */
export function bringToFront(tracks, trackId) {
  const list = tracks || [];
  let max = 0;
  for (const t of list) {
    if (typeof t.z === 'number' && t.z > max) max = t.z;
  }
  return list.map((t) => (t.id === trackId ? { ...t, z: max + 1 } : t));
}

/**
 * Set successor.afterId = predecessorId (or null to unlink).
 * @param {YearTrack[]} tracks
 * @param {string} successorId
 * @param {string | null} predecessorId
 * @returns {YearTrack[]}
 */
export function withAfterId(tracks, successorId, predecessorId) {
  if (predecessorId && wouldCreateCycle(tracks, successorId, predecessorId)) {
    return tracks;
  }
  return (tracks || []).map((t) =>
    t.id === successorId ? { ...t, afterId: predecessorId || null } : t,
  );
}

/**
 * Deep-clone a track with fresh ids for a new year board.
 * @param {YearTrack} track
 * @param {number} [index]
 * @param {{ id?: string, afterId?: string | null }} [opts]
 * @returns {YearTrack}
 */
export function cloneTrackForCarry(track, index = 0, opts = {}) {
  const status = track.status === 'done' ? 'active' : track.status;
  return createTrack({
    id: opts.id || crypto.randomUUID(),
    status,
    statusReason: statusKeepsReason(status) ? trackStatusReason(track) : '',
    afterId: opts.afterId ?? null,
    x: typeof track.x === 'number' ? track.x : TRACK_ORIGIN_X + index * TRACK_SLOT_X,
    y: typeof track.y === 'number' ? track.y : TRACK_ORIGIN_Y,
    z: typeof track.z === 'number' ? track.z : 0,
    stages: (track.stages || []).map((s) =>
      createStage({
        id: crypto.randomUUID(),
        title: s.title,
        status: s.status,
      }),
    ),
  });
}

/**
 * Preview carry: only forward into an empty future year.
 * Never into the past (history browsing).
 * @param {YearTracksDoc} doc
 * @param {number} fromYear
 * @param {number} toYear
 * @returns {{ canCarry: boolean, count: number, doc: YearTracksDoc }}
 */
export function getCarryPreview(doc, fromYear, toYear) {
  const { doc: next, board: target } = ensureBoard(doc, toYear);
  // Strictly forward only — never copy into older years
  if (!(Number(toYear) > Number(fromYear))) {
    return { canCarry: false, count: 0, doc: next };
  }
  if (target.tracks.length > 0) {
    return { canCarry: false, count: 0, doc: next };
  }
  const source = next.boards[String(fromYear)];
  const count = (source?.tracks || []).filter((t) => !isTrackFinished(t)).length;
  return { canCarry: count > 0, count, doc: next };
}

/**
 * Unfinished tracks from source year → empty *future* year only.
 * @param {YearTracksDoc} doc
 * @param {number} fromYear
 * @param {number} toYear
 * @returns {{ doc: YearTracksDoc, carried: number }}
 */
export function carryUnfinishedTracks(doc, fromYear, toYear) {
  const preview = getCarryPreview(doc, fromYear, toYear);
  if (!preview.canCarry) return { doc: preview.doc, carried: 0 };

  let next = preview.doc;
  const target = next.boards[String(toYear)] || emptyBoard(toYear);
  const source = next.boards[String(fromYear)];
  const sourceTracks = (source?.tracks || []).filter((t) => !isTrackFinished(t));
  /** @type {Map<string, string>} */
  const idMap = new Map(sourceTracks.map((t) => [t.id, crypto.randomUUID()]));
  const carriedTracks = sourceTracks.map((t, i) =>
    cloneTrackForCarry(t, i, {
      id: idMap.get(t.id),
      afterId: t.afterId && idMap.has(t.afterId) ? idMap.get(t.afterId) : null,
    }),
  );

  if (!carriedTracks.length) return { doc: next, carried: 0 };

  next = setBoard(next, toYear, {
    ...target,
    tracks: carriedTracks,
  });
  return { doc: next, carried: carriedTracks.length };
}

/** @returns {number} */
export function currentYear() {
  return new Date().getFullYear();
}

/** @param {number} year @returns {YearBoard} */
export function emptyBoard(year) {
  return {
    year: Number(year) || currentYear(),
    tracks: [],
  };
}

/** @returns {YearTracksDoc} */
export function emptyDoc() {
  return {
    version: YEAR_TRACKS_VERSION,
    boards: {},
  };
}

/**
 * @param {Partial<TrackStage> & { id?: string, done?: unknown }} [partial]
 * @returns {TrackStage}
 */
export function createStage(partial = {}) {
  return {
    id: partial.id || crypto.randomUUID(),
    title: typeof partial.title === 'string' ? partial.title : '',
    status: normalizeStageStatus(partial.status, { done: partial.done }),
  };
}

/**
 * @param {Partial<YearTrack> & { id?: string, blockedReason?: unknown }} [partial]
 * @returns {YearTrack}
 */
export function createTrack(partial = {}) {
  const stages =
    Array.isArray(partial.stages) && partial.stages.length
      ? partial.stages.map((s) => createStage(s))
      : [createStage({ title: '' })];

  // Enforce single "doing" after load/migrate
  let seenDoing = false;
  const normalizedStages = stages.map((s, idx) => {
    if (idx === 0) return { ...s, status: 'todo' }; // title stage has no progress status
    if (s.status === 'doing') {
      if (seenDoing) return { ...s, status: 'todo' };
      seenDoing = true;
    }
    return s;
  });

  const status = normalizeStatus(partial.status);
  const id = partial.id || crypto.randomUUID();
  return {
    id,
    status,
    statusReason: readStatusReason(partial, status),
    afterId: normalizeAfterId(partial.afterId, id),
    x: typeof partial.x === 'number' ? partial.x : TRACK_ORIGIN_X,
    y: typeof partial.y === 'number' ? partial.y : TRACK_ORIGIN_Y,
    z: typeof partial.z === 'number' && Number.isFinite(partial.z) ? partial.z : 0,
    stages: normalizedStages,
  };
}

/**
 * @param {unknown} raw
 * @returns {YearTracksDoc}
 */
export function normalizeDoc(raw) {
  const base = emptyDoc();
  if (!raw || typeof raw !== 'object') return base;

  const src = /** @type {Record<string, unknown>} */ (raw);
  const boardsIn = src.boards && typeof src.boards === 'object' ? src.boards : {};
  /** @type {Record<string, YearBoard>} */
  const boards = {};

  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (boardsIn))) {
    const yearNum = Number(key);
    if (!Number.isFinite(yearNum)) continue;
    boards[String(yearNum)] = normalizeBoard(value, yearNum);
  }

  return {
    version: YEAR_TRACKS_VERSION,
    boards,
  };
}

/**
 * @param {unknown} raw
 * @param {number} year
 * @returns {YearBoard}
 */
export function normalizeBoard(raw, year) {
  const board = emptyBoard(year);
  if (!raw || typeof raw !== 'object') return board;

  const src = /** @type {Record<string, unknown>} */ (raw);
  const tracks = Array.isArray(src.tracks)
    ? sanitizeAfterIds(
        src.tracks.map((t, i) =>
          createTrack({
            ...(typeof t === 'object' && t ? t : {}),
            x:
              typeof /** @type {any} */ (t).x === 'number'
                ? /** @type {any} */ (t).x
                : TRACK_ORIGIN_X + i * TRACK_SLOT_X,
            y:
              typeof /** @type {any} */ (t).y === 'number'
                ? /** @type {any} */ (t).y
                : TRACK_ORIGIN_Y,
          }),
        ),
      )
    : [];

  return {
    year,
    tracks,
  };
}

/**
 * @param {YearTracksDoc} doc
 * @param {number} year
 * @returns {{ doc: YearTracksDoc, board: YearBoard }}
 */
export function ensureBoard(doc, year) {
  const y = Number(year) || currentYear();
  const key = String(y);
  const normalized = normalizeDoc(doc);
  if (!normalized.boards[key]) {
    normalized.boards[key] = emptyBoard(y);
  }
  return { doc: normalized, board: normalized.boards[key] };
}

/**
 * @param {YearTracksDoc} doc
 * @param {number} year
 * @param {YearBoard} board
 * @returns {YearTracksDoc}
 */
export function setBoard(doc, year, board) {
  const { doc: next } = ensureBoard(doc, year);
  next.boards[String(year)] = normalizeBoard(board, year);
  return next;
}
