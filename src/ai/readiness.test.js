import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasBudgetData } from './readiness.js';

test('an empty or untouched account has nothing to analyse', () => {
    assert.equal(hasBudgetData({}), false);
    assert.equal(hasBudgetData({ 2026: { 10: { initialized: true, incomes: [], expenses: [{ items: [] }] } } }), false);
    assert.equal(hasBudgetData({ 2026: { 10: { initialized: true, incomes: [{ amount: '0' }], expenses: [{ items: [{ amount: 0 }] }] } } }), false);
    // An income typed into a month that was never started does not count.
    assert.equal(hasBudgetData({ 2026: { 10: { initialized: false, incomes: [{ amount: 500 }] } } }), false);
});

test('any income, spending, envelope or debt is enough', () => {
    assert.equal(hasBudgetData({ 2026: { 10: { initialized: true, incomes: [{ amount: 30000 }] } } }), true);
    assert.equal(hasBudgetData({ 2026: { 9: { initialized: true, expenses: [{ items: [{ amount: '125.5' }] }] } } }), true);
    assert.equal(hasBudgetData({}, { jars: [{ balance: 1000 }] }), true);
    assert.equal(hasBudgetData({}, { debts: [{ total_amount: 5000 }] }), true);
});
