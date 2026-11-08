import { nextStickyTop } from './model.js';

/**
 * Smart sticky for the desktop summary card (`.right-panel .glass-card`): see model.js.
 * The scroll handler only writes `style.top` once per frame; heights come from ResizeObserver and resize,
 * so scrolling never forces a layout read. On the compact layout the card is static and left alone.
 */
export function initSmartSticky({ selector, margin = 20 }) {
    let panel = null;
    let panelHeight = 0;
    let viewportHeight = window.innerHeight;
    let top = margin;
    let lastY = window.scrollY;
    let frame = 0;

    const active = () => panel && !document.documentElement.classList.contains('is-compact');

    function apply(delta) {
        if (!active()) {
            if (panel) panel.style.top = '';
            return;
        }
        top = nextStickyTop(top, delta, panelHeight, viewportHeight, margin);
        panel.style.top = `${Math.round(top)}px`;
    }

    function onScroll() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            const y = window.scrollY;
            apply(y - lastY);
            lastY = y;
        });
    }

    function attach() {
        panel = document.querySelector(selector);
        if (!panel) return false;
        panelHeight = panel.offsetHeight;
        new ResizeObserver((entries) => {
            panelHeight = entries[0].borderBoxSize?.[0]?.blockSize ?? panel.offsetHeight;
            apply(0);
        }).observe(panel);
        apply(0);
        return true;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
        viewportHeight = window.innerHeight;
        apply(0);
    });
    if (!attach()) document.addEventListener('DOMContentLoaded', attach, { once: true });
}
