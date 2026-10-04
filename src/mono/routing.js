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
 * Every merchant seen in the user's Monobank operations (all months, ignored ones included) —
 * the rows of the rules screen. `unassigned` counts only operations of the running month that
 * still wait for a category: earlier months are history and never re-routed.
 */
export function summarizeMerchants(months) {
    const merchants = new Map();
    (months || []).forEach(({ expenses, ignored, running }) => {
        const add = (item, waiting) => {
            const key = normalizeMerchant(item.name);
            if (!key) return;
            let merchant = merchants.get(key);
            if (!merchant) {
                merchant = { key, names: new Map(), total: 0, count: 0, unassigned: 0 };
                merchants.set(key, merchant);
            }
            const shown = String(item.name).trim();
            merchant.names.set(shown, (merchant.names.get(shown) || 0) + 1);
            merchant.total += Number(item.amount) || 0;
            merchant.count += 1;
            if (waiting && running) merchant.unassigned += 1;
        };
        (expenses || []).forEach((category) => {
            const waiting = isUnassigned(category) || isLegacyMonoCategory(category);
            (category.items || []).forEach((item) => {
                if (isMonoItem(item)) add(item, waiting);
            });
        });
        (ignored || []).forEach((item) => {
            if (isMonoItem(item)) add(item, false);
        });
    });
    return [...merchants.values()]
        .map(({ key, names, total, count, unassigned }) => ({
            key,
            // The spelling the bank used most often.
            name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
            total: Math.round(total * 100) / 100,
            count,
            unassigned,
        }))
        .sort((a, b) => b.unassigned - a.unassigned || b.total - a.total);
}
