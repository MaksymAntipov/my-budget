import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    IGNORED_TARGET,
    UNASSIGNED_KEY,
    categoryKey,
    dropEmptySystemCategories,
    ensureCategoryKeys,
    placeOperation,
    removeCardOperations,
    summarizeOperations,
} from './routing.js';

let seq = 0;
const makeId = () => `id-${++seq}`;
const op = (monoId, extra = {}) => ({ id: monoId, monoId, accountId: 'card', name: 'Сільпо', amount: 100, mcc: 5411, mccGroup: 'Продукти', ...extra });

test('category keys match the server and stay put once assigned', () => {
    assert.equal(categoryKey({ name: ' Продукти ' }), 'name:продукти');
    assert.equal(categoryKey({ name: 'Продукти', source: 'monobank' }), 'mono:продукти');
    assert.equal(categoryKey({ system: 'unassigned' }), UNASSIGNED_KEY);

    const month = [{ id: 'a', name: 'Їжа' }, { id: 'b', name: '' }, { id: 'c', name: 'Old', source: 'monobank' }, { id: 'd', key: 'kept', name: 'X' }];
    assert.equal(ensureCategoryKeys(month, makeId), true);
    assert.deepEqual(month.map((c) => c.key), ['name:їжа', 'id-1', undefined, 'kept']);
    month[0].name = 'Їжа вдома';
    assert.equal(categoryKey(month[0]), 'name:їжа'); // a rename keeps the key
    assert.equal(ensureCategoryKeys(month, makeId), false);
});

test('placeOperation routes into the target, else «Нерозподілене», never twice', () => {
    const month = [{ id: 'f', key: 'food', name: 'Їжа', items: [] }];
    assert.equal(placeOperation(month, op('1'), 'food', makeId).name, 'Їжа');
    assert.equal(placeOperation(month, op('2'), 'gone', makeId).name, 'Нерозподілене');
    assert.equal(month[0].system, 'unassigned'); // inbox goes first
    assert.equal(placeOperation(month, op('1'), 'food', makeId), null);
    assert.equal(placeOperation(month, op('3'), IGNORED_TARGET, makeId), null);
});

test('a fresh import replaces only that card, then empty system categories go', () => {
    const month = [
        { id: 'u', system: 'unassigned', items: [op('1')] },
        { id: 'f', key: 'food', name: 'Їжа', items: [op('2'), { id: 'm', name: 'Ринок', amount: 5 }, op('3', { accountId: 'other' })] },
    ];
    removeCardOperations(month, 'card', 'card');
    assert.deepEqual(month[1].items.map((i) => i.id), ['m', '3']);
    assert.deepEqual(dropEmptySystemCategories(month).map((c) => c.id), ['f']);
});

test('summarizeOperations lists groups and codes by spend, with top merchants', () => {
    const rows = summarizeOperations([
        {
            expenses: [
                { system: 'unassigned', items: [op('1', { amount: 300 }), op('2', { name: 'АТБ', amount: 50, mcc: 5499 })] },
                { name: 'Розваги', source: 'monobank', items: [op('3', { mcc: undefined, mccGroup: undefined, amount: 20 })] },
                { key: 'food', name: 'Їжа', items: [{ id: 'manual', amount: 999 }] },
            ],
            ignored: [op('4', { name: 'Steam', mcc: 5816, mccGroup: 'Підписки', amount: 500 })],
        },
    ]);
    assert.deepEqual(rows.map((r) => [r.group, r.total, r.unassigned]), [
        ['Підписки', 500, 0],
        ['Продукти', 350, 2],
        ['Розваги', 20, 1],
    ]);
    assert.deepEqual(rows[1].codes.map((c) => [c.mcc, c.merchants]), [[5411, ['Сільпо']], [5499, ['АТБ']]]);
    assert.deepEqual(rows[2].codes, []); // legacy operations without a code count for the group only
});
