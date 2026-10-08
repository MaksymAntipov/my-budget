/**
 * Small motion helpers: list items entering/leaving, amounts that count to their new
 * value, and swipe-down to close bottom sheets on phones. Everything is skipped when
 * the person asked the system for reduced motion.
 */
import { formatMoney } from './utils.js';

const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reducedMq.matches;

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** A freshly added row slides up into place. */
export function animateIn(el) {
    if (!el || reducedMotion() || !el.animate) return;
    el.animate(
        [{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: EASE_OUT }
    );
}

/** The row collapses and fades, then `done` removes it from the data. */
export function animateOut(el, done) {
    if (!el || reducedMotion() || !el.animate || !el.isConnected) return done();
    if (el.dataset.leaving) return; // second tap while it is already leaving
    el.dataset.leaving = '1';
    const cs = getComputedStyle(el);
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'none';
    const anim = el.animate(
        [
            { opacity: 1, transform: 'none', height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
            { opacity: 0, transform: 'translateX(-16px) scale(0.97)', height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
        ],
        { duration: 260, easing: EASE_IN_OUT, fill: 'forwards' }
    );
    let finished = false;
    const finish = () => { if (!finished) { finished = true; done(); } };
    anim.onfinish = finish;
    anim.oncancel = finish;
}

/** Sets a money amount, counting from the value shown before (first render is instant). */
export function animateMoney(el, value) {
    if (!el) return;
    const to = Number(value) || 0;
    // Mid-count, carry on from the number on screen rather than jumping.
    const from = el._moneyShown ?? el._moneyValue;
    el._moneyValue = to;
    el._moneyShown = undefined;
    if (el._moneyRaf) cancelAnimationFrame(el._moneyRaf);
    if (from === undefined || from === to || reducedMotion() || !el.offsetParent) {
        el.innerText = formatMoney(to);
        return;
    }
    const duration = 650;
    const start = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const shown = t < 1 ? from + (to - from) * eased : to;
        el.innerText = formatMoney(shown);
        el._moneyShown = t < 1 ? shown : undefined;
        el._moneyRaf = t < 1 ? requestAnimationFrame(step) : null;
    };
    el._moneyRaf = requestAnimationFrame(step);
}

/* ---------- Swipe-down to close a bottom sheet (phones) ---------- */

const FULLSCREEN = '.yt-modal-content, .ft-modal-content, .rw-modal-content';
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.6; // px per ms

function canScrollUp(el, sheet) {
    for (let node = el; node && node !== sheet.parentElement; node = node.parentElement) {
        if (node.scrollTop > 0) return true;
    }
    return false;
}

function closeSheet(overlay) {
    // The overlay's own data-action closes it when the click target is the overlay.
    if (overlay.hasAttribute('data-action')) overlay.click();
    else overlay.querySelector('.btn-close-modal')?.click();
}

export function enableSheetSwipe() {
    let drag = null;

    document.addEventListener('touchstart', (e) => {
        drag = null;
        if (e.touches.length !== 1) return;
        if (!document.documentElement.classList.contains('is-compact') || window.innerWidth >= 700) return;
        const sheet = e.target.closest('.modal-overlay.active .modal-content');
        if (!sheet || sheet.matches(FULLSCREEN)) return;
        if (e.target.closest('input, textarea, select, [contenteditable="true"], .custom-dropdown.open')) return;
        if (canScrollUp(e.target, sheet)) return;
        const t = e.touches[0];
        drag = { sheet, overlay: sheet.closest('.modal-overlay'), x: t.clientX, y: t.clientY, dy: 0, active: false, lastY: t.clientY, lastT: e.timeStamp, v: 0 };
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!drag) return;
        const t = e.touches[0];
        const dy = t.clientY - drag.y;
        const dx = t.clientX - drag.x;
        if (!drag.active) {
            // Up or sideways: leave it to the page/sheet scroll.
            if (dy < 6 || Math.abs(dx) > Math.abs(dy)) { if (dy < -6 || Math.abs(dx) > 10) drag = null; return; }
            drag.active = true;
            drag.sheet.style.transition = 'none';
            drag.overlay.style.transition = 'none';
        }
        e.preventDefault();
        const dt = Math.max(1, e.timeStamp - drag.lastT);
        drag.v = (t.clientY - drag.lastY) / dt;
        drag.lastY = t.clientY;
        drag.lastT = e.timeStamp;
        drag.dy = Math.max(0, dy);
        drag.sheet.style.transform = `translateY(${drag.dy}px)`;
        drag.overlay.style.backgroundColor = `rgba(0, 0, 0, ${0.7 * Math.max(0.2, 1 - drag.dy / drag.sheet.offsetHeight)})`;
    }, { passive: false });

    const end = () => {
        if (!drag || !drag.active) { drag = null; return; }
        const { sheet, overlay, dy, v } = drag;
        drag = null;
        // Hand the position back to CSS: it either slides away (close) or springs back.
        sheet.style.transition = '';
        sheet.style.transform = '';
        overlay.style.transition = '';
        overlay.style.backgroundColor = '';
        if (dy > CLOSE_DISTANCE || (dy > 30 && v > CLOSE_VELOCITY)) closeSheet(overlay);
    };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
}
