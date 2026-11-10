// Is there anything for «Аналіз капіталу» to look at? A brand-new account sent the model a full analyst brief
// with no numbers and got six «даних замало» sections back — a wasted reply and a slice of the free Gemini quota.

/**
 * @param {Record<string, Record<string, {initialized?: boolean, incomes?: Array<{amount?: unknown}>, expenses?: Array<{items?: Array<{amount?: unknown}>}>}>>} appData
 * @param {{ jars?: Array<{balance?: unknown}>, debts?: Array<{total_amount?: unknown}> }} [extra]
 */
export function hasBudgetData(appData, { jars = [], debts = [] } = {}) {
    const positive = (v) => Number(v) > 0;
    const months = Object.values(appData || {}).flatMap((year) => Object.values(year || {}));
    const anyMonth = months.some((m) => m && m.initialized && (
        (m.incomes || []).some((i) => positive(i?.amount))
        || (m.expenses || []).some((cat) => (cat?.items || []).some((it) => positive(it?.amount)))
    ));
    return anyMonth || jars.some((j) => positive(j?.balance)) || debts.some((d) => positive(d?.total_amount));
}
