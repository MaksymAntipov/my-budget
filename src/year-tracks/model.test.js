import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrack,
  createStage,
  normalizeDoc,
  setBoard,
  emptyDoc,
  carryUnfinishedTracks,
  unlinkAfter,
  wouldCreateCycle,
  withAfterId,
  sanitizeAfterIds,
  trackStatusReason,
  statusKeepsReason,
  bringToFront,
  listSequenceChains,
} from './model.js';
import {
  TRACK_WIDTH,
  TRACK_GAP,
  TRACK_SLOT_X,
  TRACK_ORIGIN_X,
  TRACK_ORIGIN_Y,
  boxesOverlap,
  findFreeSlot,
  resolveOverlap,
  computeBoardLayout,
} from './layout.js';

function track(partial) {
  return createTrack({
    stages: [createStage({ title: partial.title || 'T' })],
    ...partial,
  });
}

describe('statusReason', () => {
  it('keeps reason for paused, blocked, and dropped', () => {
    const paused = track({ status: 'paused', statusReason: 'чекаю бригаду' });
    const blocked = track({ status: 'blocked', statusReason: 'немає бюджету' });
    const dropped = track({ status: 'dropped', statusReason: 'не мій стек' });
    assert.equal(paused.statusReason, 'чекаю бригаду');
    assert.equal(blocked.statusReason, 'немає бюджету');
    assert.equal(dropped.statusReason, 'не мій стек');
    assert.equal(trackStatusReason(paused), 'чекаю бригаду');
    assert.equal(trackStatusReason(dropped), 'не мій стек');
    assert.equal(statusKeepsReason('dropped'), true);
  });

  it('clears reason for active / done / plain', () => {
    for (const status of ['active', 'done', 'plain']) {
      const t = track({ status, statusReason: 'залишок' });
      assert.equal(t.statusReason, '');
      assert.equal(statusKeepsReason(status), false);
    }
  });

  it('migrates legacy blockedReason', () => {
    const t = track({ status: 'blocked', blockedReason: 'старий блокер' });
    assert.equal(t.statusReason, 'старий блокер');
  });

  it('survives normalizeDoc roundtrip while paused', () => {
    const t = track({
      id: 'p1',
      status: 'paused',
      statusReason: 'пауза',
    });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [t] });
    const again = normalizeDoc(JSON.parse(JSON.stringify(doc)));
    assert.equal(again.boards['2026'].tracks[0].statusReason, 'пауза');
    assert.equal(again.boards['2026'].tracks[0].status, 'paused');
  });
});

describe('afterId', () => {
  it('roundtrips a valid edge', () => {
    const a = track({ id: 'a', title: 'A' });
    const b = track({ id: 'b', title: 'B', afterId: 'a' });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [a, b] });
    const again = normalizeDoc(JSON.parse(JSON.stringify(doc)));
    assert.equal(again.boards['2026'].tracks.find((t) => t.id === 'b').afterId, 'a');
  });

  it('nulls self, missing, and cyclic refs', () => {
    const a = track({ id: 'a', afterId: 'a' });
    assert.equal(a.afterId, null);

    const x = track({ id: 'x', afterId: 'ghost' });
    const y = track({ id: 'y' });
    const cleaned = sanitizeAfterIds([x, y]);
    assert.equal(cleaned.find((t) => t.id === 'x').afterId, null);

    const p = track({ id: 'p', afterId: 'q' });
    const q = track({ id: 'q', afterId: 'p' });
    const cycle = sanitizeAfterIds([p, q]);
    assert.equal(cycle.every((t) => t.afterId == null), true);
  });

  it('rejects a new edge that would cycle', () => {
    const a = track({ id: 'a' });
    const b = track({ id: 'b', afterId: 'a' });
    assert.equal(wouldCreateCycle([a, b], 'a', 'b'), true);
    const next = withAfterId([a, b], 'a', 'b');
    assert.equal(next.find((t) => t.id === 'a').afterId, null);
  });

  it('unlinkAfter clears incoming edges and removes the track', () => {
    const a = track({ id: 'a' });
    const b = track({ id: 'b', afterId: 'a' });
    const c = track({ id: 'c' });
    const next = unlinkAfter([a, b, c], 'a');
    assert.deepEqual(
      next.map((t) => t.id),
      ['b', 'c'],
    );
    assert.equal(next.find((t) => t.id === 'b').afterId, null);
  });

  it('leaves parallel tracks unlinked', () => {
    const a = track({ id: 'a' });
    const b = track({ id: 'b' });
    const cleaned = sanitizeAfterIds([a, b]);
    assert.equal(cleaned[0].afterId, null);
    assert.equal(cleaned[1].afterId, null);
  });

  it('nulls afterId pointing at a dropped track and on the dropped track itself', () => {
    const a = track({ id: 'a', status: 'dropped' });
    const b = track({ id: 'b', afterId: 'a' });
    const c = track({ id: 'c', status: 'dropped', afterId: 'b' });
    const cleaned = sanitizeAfterIds([a, b, c]);
    assert.equal(cleaned.find((t) => t.id === 'b').afterId, null);
    assert.equal(cleaned.find((t) => t.id === 'c').afterId, null);
  });

  it('listSequenceChains walks A→B→C and a parallel root', () => {
    const a = track({ id: 'a', title: 'A' });
    const b = track({ id: 'b', title: 'B', afterId: 'a' });
    const c = track({ id: 'c', title: 'C', afterId: 'b' });
    const d = track({ id: 'd', title: 'D' });
    const names = listSequenceChains([a, b, c, d]).map((ch) =>
      ch.map((t) => t.stages[0].title),
    );
    assert.deepEqual(names, [
      ['A', 'B', 'C'],
      ['D'],
    ]);
  });

  it('listSequenceChains forks into two paths sharing a prefix', () => {
    const a = track({ id: 'a', title: 'A' });
    const b = track({ id: 'b', title: 'B', afterId: 'a' });
    const c = track({ id: 'c', title: 'C', afterId: 'a' });
    const names = listSequenceChains([a, b, c]).map((ch) =>
      ch.map((t) => t.stages[0].title),
    );
    assert.equal(names.length, 2);
    assert.deepEqual(names[0].slice(0, 1), ['A']);
    assert.deepEqual(names[1].slice(0, 1), ['A']);
    const tails = names.map((n) => n[1]).sort();
    assert.deepEqual(tails, ['B', 'C']);
  });
});

describe('carryUnfinishedTracks', () => {
  it('copies pause reason and remaps afterId; drops link to done', () => {
    const a = track({ id: 'a', title: 'A', status: 'active' });
    const b = track({
      id: 'b',
      title: 'B',
      status: 'paused',
      statusReason: 'чекаю',
      afterId: 'a',
    });
    const done = track({ id: 'd', title: 'Done', status: 'done' });
    const skipped = track({
      id: 'x',
      title: 'Skip',
      status: 'dropped',
      statusReason: 'не треба',
    });
    const c = track({ id: 'c', title: 'C', status: 'active', afterId: 'd' });
    let doc = setBoard(emptyDoc(), 2025, { year: 2025, tracks: [a, b, done, skipped, c] });
    const result = carryUnfinishedTracks(doc, 2025, 2026);
    assert.equal(result.carried, 3);
    const next = result.doc.boards['2026'].tracks;
    assert.equal(next.length, 3);
    const names = Object.fromEntries(next.map((t) => [t.stages[0].title, t]));
    assert.equal(names.B.status, 'paused');
    assert.equal(names.B.statusReason, 'чекаю');
    assert.equal(names.B.afterId, names.A.id);
    assert.equal(names.C.afterId, null);
    assert.equal(next.some((t) => t.stages[0].title === 'Done'), false);
    assert.equal(next.some((t) => t.stages[0].title === 'Skip'), false);
    assert.notEqual(names.A.id, 'a');
  });
});

describe('layout overlap', () => {
  it('uses a slot wider than the column plus gap', () => {
    assert.ok(TRACK_SLOT_X >= TRACK_WIDTH + TRACK_GAP);
    assert.ok(TRACK_SLOT_X > 248);
  });

  it('findFreeSlot skips an occupied origin', () => {
    const a = track({
      id: 'a',
      x: TRACK_ORIGIN_X,
      y: TRACK_ORIGIN_Y,
    });
    const slot = findFreeSlot({ year: 2026, tracks: [a] }, TRACK_WIDTH, 120);
    assert.notEqual(slot.x, TRACK_ORIGIN_X);
    const box = { x: slot.x, y: slot.y, width: TRACK_WIDTH, height: 120 };
    const occ = computeBoardLayout({ year: 2026, tracks: [a] }).tracks[0];
    assert.equal(boxesOverlap(box, occ), false);
  });

  it('resolveOverlap nudges a dropped overlap', () => {
    const a = track({ id: 'a', x: TRACK_ORIGIN_X, y: TRACK_ORIGIN_Y });
    const b = track({ id: 'b', x: TRACK_ORIGIN_X + TRACK_SLOT_X, y: TRACK_ORIGIN_Y });
    const board = { year: 2026, tracks: [a, b] };
    const next = resolveOverlap(board, 'b', TRACK_ORIGIN_X + 10, TRACK_ORIGIN_Y);
    const laid = computeBoardLayout({
      year: 2026,
      tracks: board.tracks.map((t) => (t.id === 'b' ? { ...t, ...next } : t)),
    });
    assert.equal(boxesOverlap(laid.tracks[0], laid.tracks[1]), false);
  });
});

describe('stacking z', () => {
  it('roundtrips z and bringToFront raises the moved track', () => {
    const a = track({ id: 'a', z: 1 });
    const b = track({ id: 'b', z: 2 });
    const doc = setBoard(emptyDoc(), 2026, { year: 2026, tracks: [a, b] });
    assert.equal(doc.boards['2026'].tracks.find((t) => t.id === 'b').z, 2);
    const next = bringToFront(doc.boards['2026'].tracks, 'a');
    assert.ok(next.find((t) => t.id === 'a').z > next.find((t) => t.id === 'b').z);
  });
});
