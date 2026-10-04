/** Layout constants for year-track columns (stages stacked top → bottom). */

export const STAGE_WIDTH = 220;
export const STAGE_MIN_HEIGHT = 48;
export const TITLE_MIN_HEIGHT = 58;
export const STAGE_GAP = 32;
export const TRACK_PAD_X = 14;
export const TRACK_PAD_TOP = 40;
export const TRACK_PAD_BOTTOM = 16;
export const TRACK_MIN_HEIGHT = 120;
export const CANVAS_PAD = 80;
export const TRACK_ORIGIN_X = 80;
export const TRACK_ORIGIN_Y = 100;
export const TRACK_WIDTH = STAGE_WIDTH + TRACK_PAD_X * 2;
export const TRACK_GAP = 24;
export const TRACK_SLOT_X = TRACK_WIDTH + TRACK_GAP;
/** Leave clear air so the line/arrow never sits under card corners */
export const EDGE_OUTSET = 3;
export const EDGE_INSET_END = 8;

/**
 * @typedef {object} StageLayout
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} EdgeLayout
 * @property {number} x
 * @property {number} y1
 * @property {number} y2
 */

/**
 * @typedef {object} TrackLayout
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {StageLayout[]} stages
 * @property {EdgeLayout[]} edges
 */

/**
 * @typedef {object} BoardLayout
 * @property {TrackLayout[]} tracks
 * @property {number} width
 * @property {number} height
 */

/**
 * Rough text-block height for wrapping labels (no DOM measure).
 * @param {string} text
 * @param {{ contentWidth: number, fontSize: number, lineHeight: number, padY: number, minHeight: number, extraY?: number }} opts
 */
export function estimateBlockHeight(text, opts) {
  const {
    contentWidth,
    fontSize,
    lineHeight,
    padY,
    minHeight,
    extraY = 0,
  } = opts;
  const raw = String(text || 'Без назви').trim() || 'Без назви';
  // Cyrillic/emoji run wider than Latin — keep estimate conservative
  const avgCharW = fontSize * 0.72;
  const charsPerLine = Math.max(6, Math.floor(contentWidth / avgCharW));

  let lineCount = 0;
  for (const part of raw.split(/\n/)) {
    const len = part.length || 1;
    lineCount += Math.max(1, Math.ceil(len / charsPerLine));
  }

  const h = Math.ceil(padY + extraY + lineCount * fontSize * lineHeight + 6);
  return Math.max(minHeight, h);
}

/**
 * @param {import('./model.js').YearBoard} board
 * @returns {BoardLayout}
 */
export function computeBoardLayout(board) {
  const tracks = (board.tracks || []).map((track) => layoutTrack(track));
  let maxX = 900;
  let maxY = 600;
  for (const t of tracks) {
    maxX = Math.max(maxX, t.x + t.width + CANVAS_PAD);
    maxY = Math.max(maxY, t.y + t.height + CANVAS_PAD);
  }
  return { tracks, width: maxX, height: maxY };
}

/**
 * @param {import('./model.js').YearTrack} track
 * @returns {TrackLayout}
 */
function layoutTrack(track) {
  const x = typeof track.x === 'number' ? track.x : 80;
  const y = typeof track.y === 'number' ? track.y : 80;
  const stages = track.stages || [];
  const width = STAGE_WIDTH + TRACK_PAD_X * 2;

  /** @type {StageLayout[]} */
  const stageLayouts = [];
  /** @type {EdgeLayout[]} */
  const edges = [];

  let cursorY = y + TRACK_PAD_TOP;

  stages.forEach((stage, i) => {
    const isTitle = i === 0;
    const sx = x + TRACK_PAD_X;
    // title: full width text; stage: minus checkbox + gap
    const contentWidth = isTitle ? STAGE_WIDTH - 24 : STAGE_WIDTH - 44;
    const reason =
      isTitle &&
      (track.status === 'paused' || track.status === 'blocked' || track.status === 'dropped')
        ? String(track.statusReason || '').trim()
        : '';
    const reasonExtra = reason
      ? estimateBlockHeight(reason, {
          contentWidth,
          fontSize: 11,
          lineHeight: 1.3,
          padY: 4,
          minHeight: 16,
        })
      : 0;
    const height = estimateBlockHeight(stage.title, {
      contentWidth,
      fontSize: isTitle ? 15 : 12,
      lineHeight: isTitle ? 1.28 : 1.38,
      padY: isTitle ? 30 : 22,
      minHeight: isTitle ? TITLE_MIN_HEIGHT : STAGE_MIN_HEIGHT,
      extraY: isTitle ? 20 + reasonExtra : 0, // kicker + optional reason
    });

    stageLayouts.push({
      id: stage.id,
      x: sx,
      y: cursorY,
      width: STAGE_WIDTH,
      height,
    });

    if (i > 0) {
      const prev = stageLayouts[i - 1];
      const cx = prev.x + prev.width / 2;
      const y1 = prev.y + prev.height + EDGE_OUTSET;
      const y2 = cursorY - EDGE_INSET_END;
      // Gap-only connector — never overlaps card bodies
      if (y2 > y1 + 4) {
        edges.push({ x: cx, y1, y2 });
      }
    }

    cursorY += height + STAGE_GAP;
  });

  const contentH =
    stages.length > 0
      ? cursorY - y - STAGE_GAP + TRACK_PAD_BOTTOM
      : TRACK_MIN_HEIGHT;

  return {
    id: track.id,
    x,
    y,
    width,
    height: Math.max(TRACK_MIN_HEIGHT, contentH),
    stages: stageLayouts,
    edges,
  };
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} a
 * @param {{ x: number, y: number, width: number, height: number }} b
 * @param {number} [gap]
 */
export function boxesOverlap(a, b, gap = TRACK_GAP) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/**
 * @param {import('./model.js').YearBoard} board
 * @param {string | null} [ignoreId]
 */
function occupiedBoxes(board, ignoreId = null) {
  return computeBoardLayout(board).tracks.filter((t) => t.id !== ignoreId);
}

/**
 * First non-overlapping slot on a col/row grid.
 * @param {import('./model.js').YearBoard} board
 * @param {number} [width]
 * @param {number} [height]
 * @param {string | null} [ignoreId]
 * @returns {{ x: number, y: number }}
 */
export function findFreeSlot(
  board,
  width = TRACK_WIDTH,
  height = TRACK_MIN_HEIGHT,
  ignoreId = null,
) {
  const occupied = occupiedBoxes(board, ignoreId);
  const rowStride = Math.max(TRACK_MIN_HEIGHT, height) + TRACK_GAP;
  for (let row = 0; row < 24; row += 1) {
    for (let col = 0; col < 16; col += 1) {
      const x = TRACK_ORIGIN_X + col * TRACK_SLOT_X;
      const y = TRACK_ORIGIN_Y + row * rowStride;
      const box = { x, y, width, height };
      if (!occupied.some((o) => boxesOverlap(box, o))) return { x, y };
    }
  }
  const n = (board.tracks || []).length;
  return {
    x: TRACK_ORIGIN_X + n * TRACK_SLOT_X,
    y: TRACK_ORIGIN_Y,
  };
}

/**
 * Nudge a dropped track out of collisions (prefer right, then down).
 * @param {import('./model.js').YearBoard} board
 * @param {string} trackId
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number }}
 */
export function resolveOverlap(board, trackId, x, y) {
  const moved = {
    ...board,
    tracks: (board.tracks || []).map((t) => (t.id === trackId ? { ...t, x, y } : t)),
  };
  const laid = computeBoardLayout(moved);
  const self = laid.tracks.find((t) => t.id === trackId);
  if (!self) return { x, y };
  const others = laid.tracks.filter((t) => t.id !== trackId);
  if (!others.some((o) => boxesOverlap(self, o))) return { x: self.x, y: self.y };

  /** @type {{ x: number, y: number, d: number }[]} */
  const candidates = [];
  for (const o of others) {
    candidates.push({ x: o.x + o.width + TRACK_GAP, y: o.y, d: 0 });
    candidates.push({ x: o.x, y: o.y + o.height + TRACK_GAP, d: 0 });
  }
  const free = findFreeSlot(board, self.width, self.height, trackId);
  candidates.push({ x: free.x, y: free.y, d: 0 });

  for (const c of candidates) {
    c.d = Math.abs(c.x - x) + Math.abs(c.y - y);
  }
  candidates.sort((a, b) => a.d - b.d);

  for (const c of candidates) {
    const trial = { x: c.x, y: c.y, width: self.width, height: self.height };
    if (!others.some((o) => boxesOverlap(trial, o))) {
      return { x: Math.round(c.x), y: Math.round(c.y) };
    }
  }
  return { x: Math.round(free.x), y: Math.round(free.y) };
}
