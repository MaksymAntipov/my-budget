import { test } from 'node:test';
import assert from 'node:assert/strict';
import { split503020, habitCost, workRate, parseAmount } from './model.js';

test('split503020 splits income 50/30/20', () => {
    assert.deepEqual(split503020(40000), { needs: 20000, wants: 12000, savings: 8000 });
});

test('split503020 parts always add up to the income', () => {
    const { needs, wants, savings } = split503020(33333.33);
    assert.equal(Math.round((needs + wants + savings) * 100), 3333333);
});

test('split503020 treats empty and negative input as zero', () => {
    assert.deepEqual(split503020(''), { needs: 0, wants: 0, savings: 0 });
    assert.deepEqual(split503020(-500), { needs: 0, wants: 0, savings: 0 });
});

test('habitCost: daily coffee for 10 years', () => {
    assert.deepEqual(habitCost(80, 1, 'day'), { perMonth: 2433.33, perYear: 29200, tenYears: 292000 });
});

test('habitCost: monthly subscription matches the app rule month × 120', () => {
    const r = habitCost(299, 1, 'month');
    assert.equal(r.perMonth, 299);
    assert.equal(r.tenYears, 299 * 120);
});

test('habitCost: weekly, several times, unknown period', () => {
    assert.equal(habitCost(150, 2, 'week').perYear, 15600);
    assert.deepEqual(habitCost(150, 2, 'hour'), { perMonth: 0, perYear: 0, tenYears: 0 });
});

test('workRate: per day and per hour', () => {
    assert.deepEqual(workRate(42000, 21, 8), { perDay: 2000, perHour: 250 });
});

test('workRate: zero days or hours give zeros instead of Infinity', () => {
    assert.deepEqual(workRate(42000, 0, 8), { perDay: 0, perHour: 0 });
    assert.deepEqual(workRate(42000, 21, 0), { perDay: 2000, perHour: 0 });
});

test('parseAmount accepts spaces, comma or dot decimals and dot thousands', () => {
    assert.equal(parseAmount('1500,5'), 1500.5);
    assert.equal(parseAmount('1 500,5'), 1500.5);
    assert.equal(parseAmount('1\u00a0500,5'), 1500.5);
    assert.equal(parseAmount('1.500,5'), 1500.5);
    assert.equal(parseAmount('1500.5'), 1500.5);
    assert.ok(Number.isNaN(parseAmount('')));
    assert.ok(Number.isNaN(parseAmount('abc')));
    assert.ok(Number.isNaN(parseAmount('1,2,3')));
});
