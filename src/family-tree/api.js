import { emptyTree, normalizeTree } from './model.js';

const LS_PREFIX = 'budget_family_tree_';

function lsKey(userId) {
  return LS_PREFIX + userId;
}

export function loadTreeLocal(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (!raw) return null;
    return normalizeTree(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveTreeLocal(userId, tree) {
  if (!userId) return;
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(tree));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {{ apiUrl: string, userId: string, authenticated?: boolean }} opts
 */
export async function fetchTreeFromServer({ apiUrl, userId, authenticated }) {
  if (!apiUrl || !userId || authenticated === false) {
    return loadTreeLocal(userId) || emptyTree();
  }

  try {
    const response = await fetch(`${apiUrl}/api/family-tree?userId=${encodeURIComponent(userId)}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return loadTreeLocal(userId) || emptyTree();
    }
    const data = await response.json();
    if (data.familyTree) {
      const tree = normalizeTree(
        typeof data.familyTree === 'string' ? JSON.parse(data.familyTree) : data.familyTree,
      );
      saveTreeLocal(userId, tree);
      return tree;
    }
  } catch {
    /* network / parse */
  }

  return loadTreeLocal(userId) || emptyTree();
}

/**
 * @param {{ apiUrl: string, userId: string, authenticated?: boolean, tree: import('./model.js').FamilyTree }} opts
 */
export async function saveTreeToServer({ apiUrl, userId, authenticated, tree }) {
  saveTreeLocal(userId, tree);

  if (!apiUrl || !userId || authenticated === false) {
    return { ok: true, localOnly: true };
  }

  try {
    const response = await fetch(`${apiUrl}/api/family-tree`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, familyTree: tree }),
    });
    if (!response.ok) return { ok: false, localOnly: true };
    return { ok: true };
  } catch {
    return { ok: false, localOnly: true };
  }
}
