/** Shared DOM/string helpers */
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeAttr(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e');
}

export function newId() {
    return crypto.randomUUID();
}

export function jsId(id) {
    return "'" + escapeAttr(String(id)) + "'";
}

export function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('uk-UA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function formatNumberShort(num) {
    if (num === 0) return '0.00';
    if (num >= 1000000) return formatMoney(num / 1000000) + ' млн';
    if (num >= 1000) return formatMoney(num / 1000) + ' тис.';
    return formatMoney(num);
}
