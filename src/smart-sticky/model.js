// «Smart sticky» for a panel taller than the screen: it scrolls along with the page until its far edge is in
// view, then holds; scrolling back reveals its top again. Without this, a plain `sticky; top: 20px` panel
// taller than the viewport never showed its bottom.

/**
 * The panel's next `top` (px) after the page scrolled by `delta` (down > 0).
 * @param {number} current  current top
 * @param {number} delta    scrollY change since the last frame
 * @param {number} panelHeight
 * @param {number} viewportHeight
 * @param {number} margin   gap to the screen edge when the panel is held
 */
export function nextStickyTop(current, delta, panelHeight, viewportHeight, margin) {
    const maxTop = margin;
    // Fits on screen: a plain sticky panel.
    if (panelHeight + margin * 2 <= viewportHeight) return maxTop;
    const minTop = viewportHeight - panelHeight - margin; // bottom edge `margin` above the screen bottom
    const start = Number.isFinite(current) ? current : maxTop;
    return Math.min(maxTop, Math.max(minTop, start - delta));
}
