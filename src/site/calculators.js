// Live calculators on /kalkulyatory/*: <form data-calc="…"> with named inputs, results in [data-out="…"].
import { formatMoney } from '../utils.js';
import { split503020, habitCost, workRate, parseAmount } from './model.js';

const CALCS = {
    '503020': (v) => split503020(v.income),
    habit: (v) => habitCost(v.amount, v.times, v.period),
    rate: (v) => workRate(v.income, v.days, v.hours, v.price),
};

function readValues(form) {
    const values = {};
    for (const el of form.elements) {
        if (!el.name) continue;
        values[el.name] = el.type === 'number' || el.inputMode === 'decimal'
            ? parseAmount(el.value)
            : el.value;
    }
    return values;
}

function render(form) {
    const calc = CALCS[form.dataset.calc];
    if (!calc) return;
    const result = calc(readValues(form));
    for (const out of form.querySelectorAll('[data-out]')) {
        const value = result[out.dataset.out] ?? 0;
        out.textContent = out.dataset.format === 'hours'
            ? value.toLocaleString('uk-UA', { maximumFractionDigits: 1 })
            : formatMoney(value);
        // Long sums get a smaller font so the number and «₴» stay on one line.
        const box = out.closest('.calc-result-value');
        const length = out.textContent.length;
        box?.classList.toggle('is-long', length > 12 && length <= 16);
        box?.classList.toggle('is-very-long', length > 16 && length <= 20);
        box?.classList.toggle('is-huge', length > 20);
    }
}

for (const form of document.querySelectorAll('form[data-calc]')) {
    form.addEventListener('input', () => render(form));
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        render(form);
    });
    render(form);
}
