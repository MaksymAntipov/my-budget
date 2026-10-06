/**
 * Touch gestures for the pan/zoom canvases (year tracks, family tree):
 * one finger on empty canvas pans, two fingers pinch-zoom and pan with their midpoint.
 * Cards and tracks keep their own pointer handlers — a finger that lands on them drags them.
 *
 * @param {HTMLElement} wrap
 * @param {{
 *   startPan: (e: PointerEvent) => void,
 *   endPan: () => void,
 *   isPanning: () => boolean,
 *   pinch: (factor: number, clientX: number, clientY: number, dx: number, dy: number) => void,
 * }} handlers
 */
export function bindTouchGestures(wrap, { startPan, endPan, isPanning, pinch }) {
  /** @type {Map<number, { x: number, y: number }>} */
  const touches = new Map();
  /** @type {{ x: number, y: number, d: number } | null} */
  let last = null;

  const span = () => {
    const [a, b] = [...touches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  // Capture phase: sees fingers that land on cards too, so a second finger always pinches.
  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      endPan();
      last = span();
    },
    true,
  );

  // Bubble phase: only reached on empty canvas (cards stop propagation).
  wrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || touches.size !== 1 || isPanning()) return;
    startPan(e);
  });

  wrap.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!last || touches.size < 2) return;
      e.preventDefault();
      const next = span();
      const factor = last.d > 0 && next.d > 0 ? next.d / last.d : 1;
      pinch(factor, next.x, next.y, next.x - last.x, next.y - last.y);
      last = next;
    },
    true,
  );

  const lift = (e) => {
    if (e.pointerType !== 'touch') return;
    touches.delete(e.pointerId);
    if (touches.size < 2) last = null;
  };
  wrap.addEventListener('pointerup', lift, true);
  wrap.addEventListener('pointercancel', lift, true);
}
