// Live sparklines: where the current month's point sits on the big summary charts (income, «Зведення»,
// invoices, payroll). The charts themselves are drawn by app.js as an SVG polyline in a stretched viewBox.

/** "0,12 50,4.5 100,20 " → [100, 20]; null when there is no point. */
export function lastPoint(points) {
    const pairs = String(points || '').trim().split(/\s+/).filter(Boolean);
    const last = pairs[pairs.length - 1];
    if (!last) return null;
    const [x, y] = last.split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** The point inside a `viewBox="0 0 w h"` drawn `heightPx` tall and 100% wide → CSS left (%) and top (px). */
export function dotPosition([x, y], { width, height }, heightPx) {
    if (!(width > 0) || !(height > 0)) return null;
    return {
        left: Math.min(100, Math.max(0, (x / width) * 100)),
        top: Math.round((y / height) * heightPx * 10) / 10,
    };
}
