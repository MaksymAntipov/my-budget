/**
 * Event delegation — replaces inline onclick/on* for CSP without script unsafe-inline.
 * Only handlers registered with registerUiActions can run, so injected markup cannot
 * call arbitrary window functions.
 */
const actions = Object.create(null);

/** @param {Record<string, Function>} map */
export function registerUiActions(map) {
  for (const [name, fn] of Object.entries(map)) {
    if (typeof fn === 'function') actions[name] = fn;
  }
}

function action(name) {
  return name && typeof actions[name] === 'function' ? actions[name] : null;
}
function parseArgs(el) {
  const raw = el.getAttribute('data-args');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** Close every `.custom-dropdown.open` except the one being opened (exclusive open). */
export function closeOpenDropdowns(except = null) {
  document.querySelectorAll('.custom-dropdown.open').forEach((el) => {
    if (el !== except) el.classList.remove('open');
  });
}

function setDropdownOpen(el, open) {
  closeOpenDropdowns(el);
  el.classList.toggle('open', open);
}

function invokeAction(el, event) {
  const name = el.getAttribute('data-action');
  if (!name) return false;
  const fn = action(name);
  if (!fn) return false;

  const args = parseArgs(el);
  if (el.hasAttribute('data-pass-event')) {
    fn(event, ...args);
  } else if (el.hasAttribute('data-value-arg')) {
    fn(...args, el.value);
  } else {
    fn(...args);
  }
  return true;
}

function onDelegatedClick(event) {
  const toggleEl = event.target.closest('[data-toggle-open], [data-toggle-expanded]');
  const actionEl = event.target.closest('[data-action]');
  // Only treat [data-action] as "option click" when it is inside the toggle.
  // Ancestor actions (e.g. expense card openModal) must not block dropdown open.
  const actionInsideToggle = !!(toggleEl && actionEl && toggleEl.contains(actionEl));

  if (toggleEl && !actionInsideToggle) {
    if (toggleEl.hasAttribute('data-stop-propagation')) event.stopPropagation();
    if (toggleEl.hasAttribute('data-toggle-open')) {
      setDropdownOpen(toggleEl, !toggleEl.classList.contains('open'));
    }
    if (toggleEl.hasAttribute('data-toggle-expanded')) toggleEl.classList.toggle('is-expanded');
    return;
  }

  const stopOnly = event.target.closest('[data-stop-propagation]:not([data-action])');
  if (stopOnly && actionEl && !stopOnly.contains(actionEl)) {
    event.stopPropagation();
    return;
  }
  if (stopOnly && !actionEl) {
    event.stopPropagation();
    if (stopOnly.hasAttribute('data-toggle-expanded')) stopOnly.classList.toggle('is-expanded');
    if (stopOnly.hasAttribute('data-toggle-open')) {
      setDropdownOpen(stopOnly, !stopOnly.classList.contains('open'));
    }
    return;
  }

  if (!actionEl) return;
  if (event.target.closest('input, textarea, select') && event.target !== actionEl) return;
  if (actionEl.hasAttribute('data-stop-propagation')) event.stopPropagation();
  invokeAction(actionEl, event);
}

function onDelegatedInput(event) {
  const el = event.target.closest('[data-input-action]');
  if (!el || el !== event.target) return;
  const name = el.getAttribute('data-input-action');
  const fn = action(name);
  if (!fn) return;
  const raw = el.getAttribute('data-args');
  if (!raw) {
    fn(el.value);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const args = Array.isArray(parsed) ? parsed : [parsed];
    fn(...args, el.type === 'checkbox' ? el.checked : el.value);
  } catch {
    fn(el.value);
  }
}

function onDelegatedChange(event) {
  const el = event.target.closest('[data-change-action]');
  if (!el || el !== event.target) return;
  const name = el.getAttribute('data-change-action');
  const fn = action(name);
  if (!fn) return;
  const raw = el.getAttribute('data-args');
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (!raw) {
    fn(value);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const args = Array.isArray(parsed) ? parsed : [parsed];
    fn(...args, value);
  } catch {
    fn(value);
  }
}

function invokeDragHandler(el, attr, event) {
  const name = el.getAttribute(attr);
  const fn = action(name);
  if (!fn) return;
  const raw = el.getAttribute('data-args');
  try {
    const args = raw ? JSON.parse(raw) : [];
    fn(event, ...(Array.isArray(args) ? args : [args]));
  } catch {
    fn(event);
  }
}

function bindDragActions(root) {
  root.addEventListener('dragstart', (event) => {
    const startEl = event.target.closest('[data-drag-start]');
    if (startEl) {
      invokeDragHandler(startEl, 'data-drag-start', event);
      return;
    }
    const el = event.target.closest('[data-action="handleScheduleDragStart"]');
    if (!el) return;
    invokeAction(el, event);
  });
  root.addEventListener('dragover', (event) => {
    const el = event.target.closest('[data-drag-over]');
    if (!el) return;
    const fn = action(el.getAttribute('data-drag-over'));
    if (fn) fn(event);
  });
  root.addEventListener('dragleave', (event) => {
    const el = event.target.closest('[data-drag-leave]');
    if (!el) return;
    const fn = action(el.getAttribute('data-drag-leave'));
    if (fn) fn(event);
  });
  root.addEventListener('drop', (event) => {
    const el = event.target.closest('[data-drag-drop]');
    if (!el) return;
    invokeDragHandler(el, 'data-drag-drop', event);
  });
  root.addEventListener('dragend', (event) => {
    const el = event.target.closest('[data-drag-end]');
    if (!el) return;
    const fn = action(el.getAttribute('data-drag-end'));
    if (fn) fn(event);
  });
}

export function bindUiActions(root = document) {
  root.addEventListener('click', onDelegatedClick);
  root.addEventListener('input', onDelegatedInput);
  root.addEventListener('change', onDelegatedChange);
  bindDragActions(root);
}
