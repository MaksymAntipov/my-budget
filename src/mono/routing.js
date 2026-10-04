/**
 * Monobank operations in the user's own categories. The server routes them by rules
 * (my-budget-backend/src/monobank/rules.ts); categoryKey and normalizeMerchant mirror it.
 */

export const UNASSIGNED_KEY = '__unassigned__';
export const IGNORED_TARGET = '__ignored__';
export const UNASSIGNED_NAME = 'Нерозподілене';

export function normalizeMerchant(name) {
    return String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function isUnassigned(category) {
    return category?.system === 'unassigned';
}

/** Old categories that only held Monobank operations; they are re-routed away over time. */
export function isLegacyMonoCategory(category) {
    return category?.source === 'monobank';
}

/** Categories the user owns: rule targets, move destinations. */
export function isOwnCategory(category) {
    return Boolean(category) && !isUnassigned(category) && !isLegacyMonoCategory(category);
}

export function categoryKey(category) {
    if (isUnassigned(category)) return UNASSIGNED_KEY;
    if (typeof category?.key === 'string' && category.key) return category.key;
    const name = normalizeMerchant(category?.name);
    if (isLegacyMonoCategory(category)) return `mono:${name}`;
    return name ? `name:${name}` : `id:${String(category?.id ?? '')}`;
}

/**
 * Gives every own category a stable key before it is saved. Unnamed categories get a random
 * key; named ones keep their name-derived key, so one name shares a key across months.
 */
export function ensureCategoryKeys(expenses, makeId) {
    let changed = false;
    (expenses || []).forEach((category) => {
        if (!isOwnCategory(category) || category.key) return;
        category.key = normalizeMerchant(category.name) ? categoryKey(category) : makeId();
        changed = true;
    });
    return changed;
}

export function txKey(item) {
    return `${String(item?.accountId || '')}:${String(item?.monoId || item?.id || '')}`;
}

export function isMonoItem(item) {
    return Boolean(item?.monoId);
}

function unassignedCategory(makeId) {
    return { id: makeId(), key: UNASSIGNED_KEY, system: 'unassigned', name: UNASSIGNED_NAME, isEssential: false, items: [] };
}

/**
 * Adds a routed operation to the month in place. A target missing from the month lands in
 * «Нерозподілене». Returns the category it landed in, or null (ignored / already there).
 */
export function placeOperation(expenses, item, target, makeId) {
    if (target === IGNORED_TARGET) return null;
    const key = txKey(item);
    if (expenses.some((category) => (category.items || []).some((entry) => txKey(entry) === key))) return null;
    let category = target && target !== UNASSIGNED_KEY
        ? expenses.find((entry) => isOwnCategory(entry) && categoryKey(entry) === target)
        : null;
    if (!category) {
        category = expenses.find(isUnassigned);
        if (!category) {
            category = unassignedCategory(makeId);
            expenses.unshift(category);
        }
    }
    if (!Array.isArray(category.items)) category.items = [];
    category.items.push(item);
    return category;
}

/** Drops «Нерозподілене» and legacy Monobank categories once they are empty and limit-free. */
export function dropEmptySystemCategories(expenses) {
    return (expenses || []).filter((category) => {
        if (!isUnassigned(category) && !isLegacyMonoCategory(category)) return true;
        const limit = Number(category.limit);
        return (category.items || []).length > 0 || (Number.isFinite(limit) && limit > 0);
    });
}

/** Removes a card's Monobank operations (before a fresh statement import puts them back). */
export function removeCardOperations(expenses, accountId, legacyAccountId) {
    (expenses || []).forEach((category) => {
        category.items = (category.items || []).filter((item) => {
            if (!isMonoItem(item)) return true;
            if (item.accountId) return item.accountId !== accountId;
            return accountId !== legacyAccountId;
        });
    });
}

/**
 * Every MCC group and code seen in the user's Monobank operations (all months, ignored ones
 * included), biggest spend first — the rows of the rules screen.
 */
export function summarizeOperations(months) {
    const groups = new Map();
    const add = (item, fallbackGroup) => {
        const groupName = String(item.mccGroup || fallbackGroup || 'Інше');
        const amount = Number(item.amount) || 0;
        let group = groups.get(groupName);
        if (!group) {
            group = { group: groupName, total: 0, count: 0, unassigned: 0, codes: new Map() };
            groups.set(groupName, group);
        }
        group.total += amount;
        group.count += 1;
        const mcc = Number.isInteger(Number(item.mcc)) && item.mcc !== null && item.mcc !== '' ? Number(item.mcc) : null;
        const codeKey = mcc === null ? 'none' : String(mcc);
        let code = group.codes.get(codeKey);
        if (!code) {
            code = { mcc, total: 0, count: 0, merchants: new Map() };
            group.codes.set(codeKey, code);
        }
        code.total += amount;
        code.count += 1;
        const merchant = String(item.name || '').trim();
        if (merchant) code.merchants.set(merchant, (code.merchants.get(merchant) || 0) + amount);
        return group;
    };
    (months || []).forEach(({ expenses, ignored }) => {
        (expenses || []).forEach((category) => {
            const fallback = isLegacyMonoCategory(category) ? category.name : '';
            (category.items || []).forEach((item) => {
                if (!isMonoItem(item)) return;
                const group = add(item, fallback);
                if (isUnassigned(category) || isLegacyMonoCategory(category)) group.unassigned += 1;
            });
        });
        (ignored || []).forEach((item) => {
            if (isMonoItem(item)) add(item, '');
        });
    });
    const round = (value) => Math.round(value * 100) / 100;
    return [...groups.values()]
        .map((group) => ({
            group: group.group,
            total: round(group.total),
            count: group.count,
            unassigned: group.unassigned,
            codes: [...group.codes.values()]
                .filter((code) => code.mcc !== null)
                .map((code) => ({
                    mcc: code.mcc,
                    total: round(code.total),
                    count: code.count,
                    merchants: [...code.merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
                }))
                .sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total);
}
