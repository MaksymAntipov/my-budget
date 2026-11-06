// Pure math for the public calculator pages (/kalkulyatory/*). Same formulas as the app:
// 50/30/20 split, «за 10 років» = month × 120, rate = income / (working days × hours per day).
import { roundMoney } from '../utils.js';

/** User-typed amount → number: «1 500,5», «1500.5», «1.500,5» all mean 1500.5; anything else → NaN. */
export function parseAmount(text) {
    let s = String(text ?? '').replace(/[\s\u00a0\u202f]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return s === '' ? NaN : Number(s);
}

const PER_YEAR = { day: 365, week: 52, month: 12 };

function positive(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Monthly income → needs 50% / wants 30% / savings 20%. */
export function split503020(income) {
    const total = positive(income);
    const needs = roundMoney(total * 0.5);
    const wants = roundMoney(total * 0.3);
    // Savings take the remainder so the three parts always add up to the income.
    const savings = roundMoney(roundMoney(total) - needs - wants);
    return { needs, wants, savings };
}

/** A repeated purchase (`amount` × `times` per `period`) → its cost per month, year and 10 years. */
export function habitCost(amount, times, period) {
    const perYearCount = PER_YEAR[period] || 0;
    const perYear = positive(amount) * positive(times) * perYearCount;
    return {
        perMonth: roundMoney(perYear / 12),
        perYear: roundMoney(perYear),
        tenYears: roundMoney(perYear * 10),
    };
}

/** Monthly income → earnings per working day and hour; optional `price` → how many work hours it costs. */
export function workRate(income, workingDays, hoursPerDay, price = 0) {
    const total = positive(income);
    const days = positive(workingDays);
    const hours = days * positive(hoursPerDay);
    const perHour = hours > 0 ? total / hours : 0;
    return {
        perDay: days > 0 ? roundMoney(total / days) : 0,
        perHour: roundMoney(perHour),
        priceHours: perHour > 0 && positive(price) > 0 ? Math.round((positive(price) / perHour) * 10) / 10 : 0,
    };
}
