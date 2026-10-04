import './styles.css';
import { emptyTree, ensureSelfPerson, createPerson, normalizeTree } from './model.js';
import { fetchTreeFromServer, saveTreeToServer } from './api.js';
import { renderFamilyTreeApp } from './render.js';
import {
  buildArchiveResearchPrompt,
  copyTextToClipboard,
} from './export-prompt.js';

/** @type {null | (() => { userId?: string, name?: string, surname?: string, accountType?: string, authenticated?: boolean, apiUrl?: string })} */
let getSession = null;

/** @type {import('./model.js').FamilyTree} */
let tree = emptyTree();
let selectedId = null;
let saveStatus = '';
let saveTimer = null;
let mounted = false;
/** True only after a successful load for the current session open. */
let hydrated = false;
/** True when local tree diverged from last loaded/saved snapshot via user edits. */
let dirty = false;

/**
 * Bind family-tree module to the host app.
 * Does not touch finance state — only reads session via getter.
 *
 * @param {{ getSession: typeof getSession }} deps
 */
export function initFamilyTree(deps) {
  getSession = deps.getSession;
  ensureDom();
  mounted = true;
  syncNavVisibility();
}

export function syncFamilyTreeNavVisibility() {
  syncNavVisibility();
}

export function openFamilyTree() {
  if (!mounted) ensureDom();
  const session = getSession?.() || {};
  if (!session.userId) return;

  const modal = document.getElementById('family-tree-modal');
  if (!modal) return;

  modal.classList.add('active');
  hydrated = false;
  dirty = false;
  saveStatus = 'Завантаження…';
  paint();

  fetchTreeFromServer({
    apiUrl: session.apiUrl || '',
    userId: session.userId,
    authenticated: session.authenticated !== false && Boolean(session.userId),
  }).then((loaded) => {
    const before = JSON.stringify(loaded);
    tree = ensureSelfPerson(loaded, {
      name: session.name,
      surname: session.surname,
    });
    selectedId = tree.rootPersonId || tree.people[0]?.id || null;
    hydrated = true;
    // Only persist if ensureSelfPerson actually filled missing self — never blank-overwrite on open.
    dirty = JSON.stringify(tree) !== before;
    saveStatus = tree.people.length ? 'Завантажено' : '';
    if (dirty) scheduleSave(true);
    paint();
  });
}

export function closeFamilyTree(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('family-tree-modal');
  const wasOpen = modal?.classList.contains('active');
  if (modal) modal.classList.remove('active');
  if (wasOpen && hydrated && dirty) flushSave();
  if (wasOpen && typeof window.__onSkryniaOverlayClosed === 'function') {
    window.__onSkryniaOverlayClosed();
  }
}

function ensureDom() {
  // Nav entry lives in host «Скриня» switcher — only ensure modal DOM here.
  document.getElementById('btn-family-tree')?.remove();

  let modal = document.getElementById('family-tree-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'family-tree-modal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', closeFamilyTree);
    modal.innerHTML = `
      <div class="modal-content ft-modal-content" data-stop-propagation="1">
        <div id="family-tree-root"></div>
      </div>`;
    document.body.appendChild(modal);
  }
}

function syncNavVisibility() {
  // Host app owns «Скриня» switcher visibility.
  document.getElementById('btn-family-tree')?.remove();
}

function paint() {
  const root = document.getElementById('family-tree-root');
  if (!root) return;

  const active = document.activeElement;
  const focusField =
    active instanceof HTMLElement && root.contains(active)
      ? active.getAttribute('data-ft-field')
      : null;
  const focusSelect =
    active instanceof HTMLElement && root.contains(active)
      ? active.closest('[data-ft-select]')?.getAttribute('data-ft-select')
      : null;
  const selectionStart =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active.selectionStart
      : null;
  const selectionEnd =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active.selectionEnd
      : null;

  const wrapBefore = root.querySelector('[data-ft-canvas-wrap]');
  const savedScrollLeft = wrapBefore ? wrapBefore.scrollLeft : 0;
  const savedScrollTop = wrapBefore ? wrapBefore.scrollTop : 0;

  const panelBefore = root.querySelector('[data-ft-panel]');
  const savedPanelScroll = panelBefore ? panelBefore.scrollTop : 0;

  renderFamilyTreeApp(root, {
    tree,
    selectedId,
    saveStatus,
    onClose: () => closeFamilyTree(),
    onSelect: handleSelect,
    onAddPerson: handleAddPerson,
    onUpdatePerson: handleUpdatePerson,
    onDeletePerson: requestDeletePerson,
    onAddRelative: handleAddRelative,
    onRemoveLink: handleRemoveLink,
    onMovePerson: handleMovePerson,
    onExportPrompt: handleExportPrompt,
  });

  const wrapAfter = root.querySelector('[data-ft-canvas-wrap]');
  if (wrapAfter) {
    wrapAfter.scrollLeft = savedScrollLeft;
    wrapAfter.scrollTop = savedScrollTop;
  }

  const panelAfter = root.querySelector('[data-ft-panel]');
  if (panelAfter) {
    panelAfter.scrollTop = savedPanelScroll;
  }

  if (focusField) {
    const next = root.querySelector(`[data-ft-field="${focusField}"]`);
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      next.focus({ preventScroll: true });
      if (selectionStart != null && selectionEnd != null) {
        try {
          next.setSelectionRange(selectionStart, selectionEnd);
        } catch {
          /* date inputs etc. */
        }
      }
    } else if (next instanceof HTMLElement) {
      next.focus({ preventScroll: true });
    }
  } else if (focusSelect) {
    const trigger = root.querySelector(
      `[data-ft-select="${focusSelect}"] [data-ft-select-trigger]`,
    );
    if (trigger instanceof HTMLElement) {
      trigger.focus({ preventScroll: true });
    }
  }

  // Re-apply panel scroll after focus (focus can still nudge scroll in some browsers)
  if (panelAfter) {
    panelAfter.scrollTop = savedPanelScroll;
  }
}

function handleSelect(id) {
  selectedId = id;
  paint();
}

async function handleExportPrompt() {
  if (!tree.people.length) {
    saveStatus = 'Спочатку додайте людей у дерево';
    paint();
    return;
  }

  const prompt = buildArchiveResearchPrompt(tree);
  const copied = await copyTextToClipboard(prompt);

  saveStatus = copied ? 'Промпт скопійовано' : 'Не вдалося скопіювати';
  paint();
  setTimeout(() => {
    if (saveStatus === 'Промпт скопійовано' || saveStatus === 'Не вдалося скопіювати') {
      saveStatus = '';
      paint();
    }
  }, 2500);
}

function handleAddPerson() {
  const session = getSession?.() || {};
  const isFirst = tree.people.length === 0;
  const person = createPerson({
    id: crypto.randomUUID(),
    firstName: isFirst ? session.name || '' : '',
    lastName: isFirst ? session.surname || '' : '',
    role: isFirst ? 'self' : 'other',
    gender: 'unspecified',
    x: 80 + tree.people.length * 24,
    y: 80 + tree.people.length * 20,
  });
  tree = normalizeTree({
    ...tree,
    people: [...tree.people, person],
    rootPersonId: tree.rootPersonId || person.id,
  });
  selectedId = person.id;
  scheduleSave();
  paint();
}

function handleUpdatePerson(person) {
  let people = tree.people.map((p) => (p.id === person.id ? person : p));
  if (person.role === 'self') {
    people = people.map((p) =>
      p.id === person.id ? person : p.role === 'self' ? { ...p, role: 'other' } : p,
    );
  }
  tree = normalizeTree({
    ...tree,
    people,
    rootPersonId: person.role === 'self' ? person.id : tree.rootPersonId,
  });
  scheduleSave();
  paint();
}

function requestDeletePerson(id) {
  const person = tree.people.find((p) => p.id === id);
  const name = person ? [person.firstName, person.lastName].filter(Boolean).join(' ') : '';
  const title = 'Видалити людину?';
  const message = name
    ? `Видалити «${name}» та всі звʼязки цієї людини з дерева?`
    : 'Видалити цю людину та всі її звʼязки з дерева?';

  if (typeof window.showConfirm === 'function') {
    window.showConfirm(title, message, () => handleDeletePerson(id));
    return;
  }
  if (window.confirm(message)) handleDeletePerson(id);
}

function handleDeletePerson(id) {
  const people = tree.people.filter((p) => p.id !== id);
  const links = tree.links.filter((l) => l.fromId !== id && l.toId !== id);
  let rootPersonId = tree.rootPersonId === id ? null : tree.rootPersonId;
  if (!rootPersonId) {
    const self = people.find((p) => p.role === 'self');
    rootPersonId = self?.id || people[0]?.id || null;
  }
  tree = normalizeTree({ people, links, rootPersonId });
  selectedId = rootPersonId;
  scheduleSave();
  paint();
}

/**
 * @param {string} fromId
 * @param {'father' | 'mother' | 'partner' | 'child'} kind
 */
function handleAddRelative(fromId, kind) {
  const from = tree.people.find((p) => p.id === fromId);
  if (!from) return;

  const gender =
    kind === 'father' ? 'male' : kind === 'mother' ? 'female' : 'unspecified';

  const offset = {
    father: { x: -40, y: -140 },
    mother: { x: 140, y: -140 },
    partner: { x: 200, y: 0 },
    child: { x: 40, y: 140 },
  }[kind];

  const baseX = typeof from.x === 'number' ? from.x : 200;
  const baseY = typeof from.y === 'number' ? from.y : 200;

  const newbie = createPerson({
    id: crypto.randomUUID(),
    firstName: '',
    lastName: kind === 'child' ? from.lastName || '' : '',
    gender,
    role: 'other',
    x: baseX + offset.x,
    y: baseY + offset.y,
  });

  /** @type {import('./model.js').FamilyLink} */
  let link;
  if (kind === 'father' || kind === 'mother') {
    link = { id: crypto.randomUUID(), fromId: newbie.id, toId: fromId, type: 'parent' };
  } else if (kind === 'child') {
    link = { id: crypto.randomUUID(), fromId: fromId, toId: newbie.id, type: 'parent' };
  } else {
    link = { id: crypto.randomUUID(), fromId: fromId, toId: newbie.id, type: 'spouse' };
  }

  tree = normalizeTree({
    ...tree,
    people: [...tree.people, newbie],
    links: [...tree.links, link],
  });
  selectedId = newbie.id;
  scheduleSave();
  paint();
}

function handleRemoveLink(linkId) {
  if (!linkId) return;
  tree = normalizeTree({
    ...tree,
    links: tree.links.filter((l) => l.id !== linkId),
  });
  scheduleSave();
  paint();
}

function handleMovePerson(id, x, y) {
  tree = normalizeTree({
    ...tree,
    people: tree.people.map((p) => (p.id === id ? { ...p, x, y } : p)),
  });
  scheduleSave();
  paint();
}

function scheduleSave(immediate = false) {
  if (!hydrated) return;
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  if (immediate) {
    flushSave();
    return;
  }
  saveStatus = 'Зміни…';
  const statusEl = document.querySelector('[data-ft-save]');
  if (statusEl) statusEl.textContent = saveStatus;
  saveTimer = setTimeout(() => flushSave(), 700);
}

async function flushSave() {
  if (!hydrated || !dirty) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const session = getSession?.() || {};
  if (!session.userId) return;

  saveStatus = 'Збереження…';
  const statusEl = document.querySelector('[data-ft-save]');
  if (statusEl) statusEl.textContent = saveStatus;

  const result = await saveTreeToServer({
    apiUrl: session.apiUrl || '',
    userId: session.userId,
    authenticated: session.authenticated !== false && Boolean(session.userId),
    tree,
  });

  if (result.ok && !result.localOnly) dirty = false;

  saveStatus = result.ok
    ? result.localOnly
      ? 'Збережено на цьому пристрої'
      : 'Збережено'
    : 'Збережено локально (сервер недоступний)';
  const el = document.querySelector('[data-ft-save]');
  if (el) el.textContent = saveStatus;
}
