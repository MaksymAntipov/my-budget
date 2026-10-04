/** Shared DOM/string helpers */
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape for a double-quoted HTML attribute value, e.g. data-args="${escapeAttr(JSON.stringify(args))}".
 * The browser decodes the entities back, so getAttribute() returns the original string intact.
 */
export function escapeAttr(str) {
    return escapeHtml(str);
}

export function newId() {
    return crypto.randomUUID();
}

/** Loose id equality for legacy numeric ids vs string ids from the DOM. */
export function sameId(a, b) {
    return String(a) === String(b);
}

export function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('uk-UA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/** Calendar days in a 0-based month. */
export function countDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

/** Monday–Friday days in a 0-based month. */
export function countWeekdaysInMonth(year, month) {
    const days = countDaysInMonth(year, month);
    let count = 0;
    for (let day = 1; day <= days; day++) {
        const dow = new Date(year, month, day).getDay();
        if (dow !== 0 && dow !== 6) count++;
    }
    return count;
}

export function formatNumberShort(num) {
    if (num === 0) return '0.00';
    if (num >= 1000000) return formatMoney(num / 1000000) + ' млн';
    if (num >= 1000) return formatMoney(num / 1000) + ' тис.';
    return formatMoney(num);
}
