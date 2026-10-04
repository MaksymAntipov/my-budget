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
    summarizeMerchants,
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

test('summarizeMerchants lists stores by spend; only the running month counts as waiting', () => {
    const rows = summarizeMerchants([
        {
            running: true,
            expenses: [
                { system: 'unassigned', items: [op('1', { name: 'АТБ', amount: 50 })] },
                { key: 'food', name: 'Їжа', items: [op('2', { amount: 300 }), { id: 'manual', name: 'Ринок', amount: 999 }] },
            ],
            ignored: [op('3', { name: 'Steam', amount: 500 })],
        },
        {
            running: false,
            expenses: [
                { system: 'unassigned', items: [op('4', { name: 'сільпо ', amount: 100 })] },
                { name: 'Кафе', source: 'monobank', items: [op('5', { name: 'Кава', amount: 20 })] },
            ],
        },
    ]);
    assert.deepEqual(rows.map((r) => [r.name, r.total, r.count, r.unassigned]), [
        ['АТБ', 50, 1, 1],
        ['Steam', 500, 1, 0],
        ['Сільпо', 400, 2, 0],
        ['Кава', 20, 1, 0],
    ]);
    assert.equal(rows.find((r) => r.name === 'Сільпо').key, 'сільпо');
});
