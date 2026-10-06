import { escapeHtml } from '../utils.js';
import {
  GENDER_LABELS,
  DOC_STATUS_LABELS,
  displayName,
  yearsLabel,
  placeLabel,
  showsMaidenName,
  createPerson,
  relationLabelToSelf,
} from './model.js';
import { computeFamilyLayout } from './layout.js';
import { bindTouchGestures } from '../canvas-touch.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   tree: import('./model.js').FamilyTree,
 *   selectedId: string | null,
 *   saveStatus: string,
 *   onClose: () => void,
 *   onSelect: (id: string | null) => void,
 *   onAddPerson: () => void,
 *   onUpdatePerson: (person: import('./model.js').FamilyPerson) => void,
 *   onDeletePerson: (id: string) => void,
 *   onAddRelative: (fromId: string, kind: 'father' | 'mother' | 'partner' | 'child') => void,
 *   onRemoveLink: (linkId: string) => void,
 *   onMovePerson: (id: string, x: number, y: number) => void,
 *   onExportPrompt: () => void,
 * }} handlers
 */
export function renderFamilyTreeApp(root, handlers) {
  const {
    tree,
    selectedId,
    saveStatus,
    onClose,
    onSelect,
    onAddPerson,
    onUpdatePerson,
    onDeletePerson,
    onAddRelative,
    onRemoveLink,
    onMovePerson,
    onExportPrompt,
  } = handlers;

  const selected = tree.people.find((p) => p.id === selectedId) || null;
  const layout = computeFamilyLayout(tree);

  root.innerHTML = `
    <div class="ft-shell ${panelOpen ? '' : 'is-panel-collapsed'}" data-ft-shell>
      <header class="ft-header">
        <div class="ft-header-left">
          <h2 class="ft-title">Сімейне дерево</h2>
          <span class="ft-save-status" data-ft-save>${escapeHtml(saveStatus)}</span>
        </div>
        <div class="ft-header-actions">
          <div class="skrynia-switcher" data-skrynia-switcher style="display:none;">
            <button type="button" class="skrynia-switcher-btn" data-action="toggleSkryniaSwitcher" data-pass-event="1">Скриня <span style="opacity:0.7;font-size:10px;">▾</span></button>
            <div class="skrynia-switcher-dropdown"></div>
          </div>
          <div class="ft-zoom-switch" data-ft-zoom-switch title="Ctrl/⌘ + scroll або pinch — зум">
            <button type="button" data-ft-zoom-out aria-label="Зменшити">−</button>
            <button type="button" class="ft-zoom-label" data-ft-zoom-reset>${Math.round(viewZoom * 100)}%</button>
            <button type="button" data-ft-zoom-in aria-label="Збільшити">+</button>
          </div>
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-panel-toggle
            title="${panelOpen ? 'Сховати панель' : 'Показати панель'}">${panelOpen ? 'Сховати панель' : 'Панель'}</button>
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-export-prompt title="Скопіювати промпт у буфер обміну для пошуку родичів через ШІ">Вивантажити промпт</button>
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-add>+ Людина</button>
          <button type="button" class="ft-btn ft-btn-ghost" data-ft-close aria-label="Закрити">✕</button>
        </div>
      </header>
      <div class="ft-body">
        <div class="ft-canvas-wrap" data-ft-canvas-wrap>
          ${
            tree.people.length === 0
              ? `<div class="ft-empty">
                <p class="ft-empty-title">Сімейне дерево порожнє</p>
                <p class="ft-empty-text">Додайте першу людину — зазвичай це ви</p>
                <button type="button" class="ft-btn ft-btn-primary" data-ft-add-empty>+ Додати людину</button>
              </div>`
              : renderCanvas(tree, layout, selectedId)
          }
        </div>
        <aside class="ft-panel" data-ft-panel ${panelOpen ? '' : 'hidden'} ${selected ? '' : 'data-empty'}>
          <div class="ft-panel-toolbar">
            <button type="button" class="ft-btn ft-btn-ghost ft-panel-collapse" data-ft-panel-toggle aria-label="Сховати панель">›</button>
          </div>
          ${
            selected
              ? renderForm(selected, tree)
              : `<div class="ft-panel-empty"><p>Оберіть картку на полотні або додайте людину</p></div>`
          }
        </aside>
      </div>
    </div>
  `;

  root.querySelector('[data-ft-close]')?.addEventListener('click', onClose);
  root.querySelector('[data-ft-export-prompt]')?.addEventListener('click', onExportPrompt);
  root.querySelectorAll('[data-ft-add], [data-ft-add-empty]').forEach((el) => {
    el.addEventListener('click', () => {
      panelOpen = true;
      onAddPerson();
    });
  });
  root.querySelectorAll('[data-ft-panel-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      panelOpen = !panelOpen;
      const shell = root.querySelector('[data-ft-shell]');
      const panel = root.querySelector('[data-ft-panel]');
      const toggleBtns = root.querySelectorAll('[data-ft-panel-toggle]');
      shell?.classList.toggle('is-panel-collapsed', !panelOpen);
      if (panel instanceof HTMLElement) panel.hidden = !panelOpen;
      toggleBtns.forEach((btn) => {
        if (btn.classList.contains('ft-panel-collapse')) return;
        btn.textContent = panelOpen ? 'Сховати панель' : 'Панель';
        btn.setAttribute('title', panelOpen ? 'Сховати панель' : 'Показати панель');
      });
    });
  });

  const wrap = root.querySelector('[data-ft-canvas-wrap]');
  root.querySelector('[data-ft-zoom-in]')?.addEventListener('click', () => {
    zoomAt(wrap, 1.15);
  });
  root.querySelector('[data-ft-zoom-out]')?.addEventListener('click', () => {
    zoomAt(wrap, 1 / 1.15);
  });
  root.querySelector('[data-ft-zoom-reset]')?.addEventListener('click', () => {
    resetZoom(wrap);
  });

  bindCanvasInteractions(root, {
    onSelect: (id) => {
      if (!panelOpen && id) panelOpen = true;
      onSelect(id);
    },
    onMovePerson,
    tree,
  });
  if (selected) {
    bindForm(root, selected, tree, {
      onUpdatePerson,
      onDeletePerson,
      onAddRelative,
      onRemoveLink,
    });
  }

  if (typeof window.updateSkryniaSwitcherUI === 'function') {
    window.updateSkryniaSwitcherUI();
  }
}

function renderCanvas(tree, layout, selectedId) {
  const byId = new Map(tree.people.map((p) => [p.id, p]));
  const edgesSvg = [
    ...layout.edges.map((e) => `<path class="ft-edge-parent" d="${e.d}" />`),
    ...layout.spouseEdges.map((e) => `<path class="ft-edge-spouse" d="${e.d}" />`),
  ].join('');

  const cards = layout.nodes
    .map((n) => {
      const person = byId.get(n.id);
      if (!person) return '';
      const selected = person.id === selectedId ? 'is-selected' : '';
      const dead = person.deathDate ? 'is-deceased' : '';
      const rel = relationLabelToSelf(person.id, tree);
      const relClass = person.role === 'self' || rel === 'Я' ? 'ft-card-rel is-self' : 'ft-card-rel';
      const place = placeLabel(person);
      return `
        <button type="button"
          class="ft-card ${selected} ${dead}"
          data-ft-card="${escapeHtml(person.id)}"
          style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;">
          ${rel ? `<span class="${relClass}">${escapeHtml(rel)}</span>` : ''}
          <span class="ft-card-name">${escapeHtml(person.firstName || '—')} ${escapeHtml(person.lastName || '')}</span>
          <span class="ft-card-patronymic">${escapeHtml(person.patronymic || '\u00a0')}</span>
          <span class="ft-card-years">${escapeHtml(yearsLabel(person))}</span>
          ${place ? `<span class="ft-card-place">${escapeHtml(place)}</span>` : ''}
        </button>`;
    })
    .join('');

  return `
    <div class="ft-canvas" data-ft-canvas style="width:${layout.width}px;height:${layout.height}px;">
      <svg class="ft-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true">${edgesSvg}</svg>
      ${cards}
    </div>`;
}

function dateParts(iso) {
  const s = String(iso || '');
  const full = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) return { y: full[1], m: full[2], d: full[3] };
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return { y: ym[1], m: ym[2], d: '' };
  const y = s.match(/^(\d{4})$/);
  if (y) return { y: y[1], m: '', d: '' };
  return { y: '', m: '', d: '' };
}

/** Build stored date. Pads only when finalize=true (on blur). */
function composeDate(d, m, y, finalize = false) {
  const yy = String(y || '').replace(/\D/g, '').slice(0, 4);
  const mm = String(m || '').replace(/\D/g, '').slice(0, 2);
  const dd = String(d || '').replace(/\D/g, '').slice(0, 2);
  if (!yy) return '';
  if (yy.length < 4) return finalize ? '' : yy;
  if (!mm) return yy;
  const month = finalize ? mm.padStart(2, '0') : mm;
  if (!dd) return `${yy}-${month}`;
  const day = finalize ? dd.padStart(2, '0') : dd;
  return `${yy}-${month}-${day}`;
}

function renderDateFields(label, field, iso) {
  const p = dateParts(iso);
  return `
    <div class="ft-field">
      <span>${label}</span>
      <div class="ft-date-parts" data-ft-date-group="${escapeHtml(field)}">
        <input type="text" class="ft-date-part" data-ft-date-part="d" data-ft-field="${escapeHtml(field)}-d"
          inputmode="numeric" maxlength="2" placeholder="ДД" value="${escapeHtml(p.d)}" autocomplete="off" />
        <span class="ft-date-sep">.</span>
        <input type="text" class="ft-date-part" data-ft-date-part="m" data-ft-field="${escapeHtml(field)}-m"
          inputmode="numeric" maxlength="2" placeholder="ММ" value="${escapeHtml(p.m)}" autocomplete="off" />
        <span class="ft-date-sep">.</span>
        <input type="text" class="ft-date-part ft-date-year" data-ft-date-part="y" data-ft-field="${escapeHtml(field)}-y"
          inputmode="numeric" maxlength="4" placeholder="РРРР" value="${escapeHtml(p.y)}" autocomplete="off" />
      </div>
    </div>`;
}

function renderSelectField(field, label, value, labels) {
  const items = Object.entries(labels)
    .map(
      ([v, text]) =>
        `<button type="button" class="ft-select-option ${v === value ? 'is-active' : ''}" data-value="${escapeHtml(v)}">${escapeHtml(text)}</button>`,
    )
    .join('');
  return `
    <div class="ft-field">
      <span>${escapeHtml(label)}</span>
      <div class="ft-select" data-ft-select="${escapeHtml(field)}">
        <button type="button" class="ft-select-trigger" data-ft-select-trigger>${escapeHtml(labels[value] || '—')}</button>
        <div class="ft-select-menu" hidden>${items}</div>
      </div>
    </div>`;
}

function renderSelectGender(value) {
  return renderSelectField('gender', 'Стать', value, GENDER_LABELS);
}

function relationSummary(person, tree) {
  const byId = new Map(tree.people.map((p) => [p.id, p]));
  /** @type {{ linkId: string, label: string, name: string }[]} */
  const rows = [];

  for (const link of tree.links) {
    if (link.type === 'parent' && link.toId === person.id) {
      const p = byId.get(link.fromId);
      rows.push({
        linkId: link.id,
        label: p?.gender === 'female' ? 'Мати' : p?.gender === 'male' ? 'Батько' : 'Батьки',
        name: p ? displayName(p) : '—',
      });
    }
    if (link.type === 'parent' && link.fromId === person.id) {
      const c = byId.get(link.toId);
      rows.push({
        linkId: link.id,
        label: 'Дитина',
        name: c ? displayName(c) : '—',
      });
    }
    if (link.type === 'spouse' && (link.fromId === person.id || link.toId === person.id)) {
      const otherId = link.fromId === person.id ? link.toId : link.fromId;
      const o = byId.get(otherId);
      rows.push({
        linkId: link.id,
        label: 'Партнер',
        name: o ? displayName(o) : '—',
      });
    }
  }

  if (!rows.length) {
    return '';
  }

  return `<ul class="ft-rel-list">${rows
    .map(
      (r) => `<li class="ft-rel-item">
        <span class="ft-rel-label">${escapeHtml(r.label)}</span>
        <span class="ft-rel-name">${escapeHtml(r.name)}</span>
        <button type="button" class="ft-rel-remove" data-ft-remove-link="${escapeHtml(r.linkId)}" title="Прибрати звʼязок">✕</button>
      </li>`,
    )
    .join('')}</ul>`;
}

function renderForm(person, tree) {
  const maidenBlock = showsMaidenName(person)
    ? `<label class="ft-field">
        <span>Дівоче прізвище</span>
        <input type="text" data-ft-field="maidenName" value="${escapeHtml(person.maidenName)}" placeholder="До шлюбу" autocomplete="off" />
      </label>`
    : `<p class="ft-hint">Дівоче прізвище приховано (стать ≠ жінка)</p>`;

  const isSelf = person.role === 'self';

  return `
    <div class="ft-form">
      <div class="ft-form-head">
        <h3>Картка людини</h3>
        ${isSelf ? '<span class="ft-chip">Я</span>' : ''}
      </div>

      <label class="ft-check">
        <input type="checkbox" data-ft-self ${isSelf ? 'checked' : ''} />
        <span>Це я (корінь дерева)</span>
      </label>

      ${renderSelectGender(person.gender)}

      <label class="ft-field">
        <span>Імʼя</span>
        <input type="text" data-ft-field="firstName" value="${escapeHtml(person.firstName)}" autocomplete="off" />
      </label>

      <label class="ft-field">
        <span>По батькові</span>
        <input type="text" data-ft-field="patronymic" value="${escapeHtml(person.patronymic)}" autocomplete="off" />
      </label>

      <label class="ft-field">
        <span>Прізвище (поточне)</span>
        <input type="text" data-ft-field="lastName" value="${escapeHtml(person.lastName)}" autocomplete="off" />
      </label>

      ${maidenBlock}

      <label class="ft-field">
        <span>Альтернативні написання</span>
        <input type="text" data-ft-field="nameVariants" value="${escapeHtml(person.nameVariants)}" placeholder="Гонжа / Gonża, Камерист / Камеристий" autocomplete="off" />
      </label>

      ${renderDateFields('Дата народження', 'birthDate', person.birthDate)}
      ${renderDateFields('Дата смерті', 'deathDate', person.deathDate)}
      ${renderDateFields('Дата шлюбу', 'marriageDate', person.marriageDate)}

      <div class="ft-section">
        <div class="ft-section-title">Географія (якір для архівів)</div>
        <label class="ft-field">
          <span>Село / місто народження</span>
          <input type="text" data-ft-field="birthSettlement" value="${escapeHtml(person.birthSettlement)}" placeholder="Обовʼязково для РАЦС / ДАДО" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Район</span>
          <input type="text" data-ft-field="birthDistrict" value="${escapeHtml(person.birthDistrict)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Область</span>
          <input type="text" data-ft-field="birthRegion" value="${escapeHtml(person.birthRegion)}" placeholder="напр. Дніпропетровська" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Історична назва місця</span>
          <input type="text" data-ft-field="birthPlaceHistorical" value="${escapeHtml(person.birthPlaceHistorical)}" placeholder="Якщо змінювалась" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Місце шлюбу</span>
          <input type="text" data-ft-field="marriagePlace" value="${escapeHtml(person.marriagePlace)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Місце смерті</span>
          <input type="text" data-ft-field="deathPlace" value="${escapeHtml(person.deathPlace)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Місце поховання / цвинтар</span>
          <input type="text" data-ft-field="burialPlace" value="${escapeHtml(person.burialPlace)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Гіпотези сіл (не підтверджено)</span>
          <textarea data-ft-field="placeHypotheses" rows="2" placeholder="Петрівка, Васильківщина…">${escapeHtml(person.placeHypotheses)}</textarea>
        </label>
      </div>

      <div class="ft-section">
        <div class="ft-section-title">Документи РАЦС</div>
        ${renderSelectField('docBirthStatus', 'Свідоцтво про народження', person.docBirthStatus, DOC_STATUS_LABELS)}
        <label class="ft-field">
          <span>Акт народження (№ / рік)</span>
          <input type="text" data-ft-field="docBirthAct" value="${escapeHtml(person.docBirthAct)}" autocomplete="off" />
        </label>
        ${renderSelectField('docMarriageStatus', 'Свідоцтво про шлюб', person.docMarriageStatus, DOC_STATUS_LABELS)}
        <label class="ft-field">
          <span>Акт шлюбу (№ / рік)</span>
          <input type="text" data-ft-field="docMarriageAct" value="${escapeHtml(person.docMarriageAct)}" autocomplete="off" />
        </label>
        ${renderSelectField('docDeathStatus', 'Свідоцтво про смерть', person.docDeathStatus, DOC_STATUS_LABELS)}
        <label class="ft-field">
          <span>Акт смерті (№ / рік)</span>
          <input type="text" data-ft-field="docDeathAct" value="${escapeHtml(person.docDeathAct)}" autocomplete="off" />
        </label>
      </div>

      <div class="ft-section">
        <div class="ft-section-title">Війна / архіви</div>
        <label class="ft-field">
          <span>Місце призову</span>
          <input type="text" data-ft-field="militaryDraftPlace" value="${escapeHtml(person.militaryDraftPlace)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Звання</span>
          <input type="text" data-ft-field="militaryRank" value="${escapeHtml(person.militaryRank)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Частина / підрозділ</span>
          <input type="text" data-ft-field="militaryUnit" value="${escapeHtml(person.militaryUnit)}" autocomplete="off" />
        </label>
        <label class="ft-field">
          <span>Памʼять народа / ОБД / нагороди</span>
          <textarea data-ft-field="militaryNotes" rows="2" placeholder="Посилання, похоронка, військовий квиток…">${escapeHtml(person.militaryNotes)}</textarea>
        </label>
      </div>

      <div class="ft-rel-block">
        <div class="ft-rel-title">Звʼязки</div>
        ${relationSummary(person, tree)}
        <div class="ft-rel-actions">
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-rel="father">+ Батько</button>
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-rel="mother">+ Мати</button>
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-rel="partner">+ Партнер</button>
          <button type="button" class="ft-btn ft-btn-secondary" data-ft-rel="child">+ Дитина</button>
        </div>
      </div>

      <label class="ft-field">
        <span>Нотатка</span>
        <textarea data-ft-field="notes" rows="3">${escapeHtml(person.notes)}</textarea>
      </label>

      <p class="ft-summary">${escapeHtml(displayName(person))}</p>

      <button type="button" class="ft-btn ft-btn-danger" data-ft-delete>Видалити людину</button>
    </div>`;
}

function bindForm(root, person, tree, { onUpdatePerson, onDeletePerson, onAddRelative, onRemoveLink }) {
  const apply = (field, value) => {
    const next = createPerson({ ...person, [field]: value });
    if (field === 'gender' && value !== 'female') next.maidenName = '';
    onUpdatePerson(next);
  };

  root.querySelectorAll('input[data-ft-field], textarea[data-ft-field]').forEach((el) => {
    if (el.classList.contains('ft-date-part')) return;
    const field = el.getAttribute('data-ft-field');
    el.addEventListener('input', () => apply(field, /** @type {HTMLInputElement} */ (el).value));
  });

  root.querySelectorAll('[data-ft-date-group]').forEach((group) => {
    const field = group.getAttribute('data-ft-date-group');

    const commit = () => {
      const d = /** @type {HTMLInputElement|null} */ (group.querySelector('[data-ft-date-part="d"]'))?.value || '';
      const m = /** @type {HTMLInputElement|null} */ (group.querySelector('[data-ft-date-part="m"]'))?.value || '';
      const y = /** @type {HTMLInputElement|null} */ (group.querySelector('[data-ft-date-part="y"]'))?.value || '';
      const composed = composeDate(d, m, y, true);
      // Normalize visible values after commit (pad day/month)
      const parts = dateParts(composed);
      const dEl = /** @type {HTMLInputElement|null} */ (group.querySelector('[data-ft-date-part="d"]'));
      const mEl = /** @type {HTMLInputElement|null} */ (group.querySelector('[data-ft-date-part="m"]'));
      const yEl = /** @type {HTMLInputElement|null} */ (group.querySelector('[data-ft-date-part="y"]'));
      if (dEl) dEl.value = parts.d;
      if (mEl) mEl.value = parts.m;
      if (yEl) yEl.value = parts.y;
      apply(field, composed);
    };

    group.querySelectorAll('.ft-date-part').forEach((el) => {
      // Digits only — do NOT save/repaint on each keystroke (that ate typed chars).
      el.addEventListener('input', () => {
        const input = /** @type {HTMLInputElement} */ (el);
        const max = input.getAttribute('maxlength');
        const cleaned = input.value.replace(/\D/g, '');
        input.value = max ? cleaned.slice(0, Number(max)) : cleaned;
      });
      el.addEventListener('blur', (e) => {
        // Stay inside the same date group (tab DD→MM→YYYY) — wait until leaving the group
        const next = /** @type {FocusEvent} */ (e).relatedTarget;
        if (next instanceof Node && group.contains(next)) return;
        commit();
      });
      el.addEventListener('keydown', (e) => {
        if (/** @type {KeyboardEvent} */ (e).key === 'Enter') {
          e.preventDefault();
          /** @type {HTMLInputElement} */ (el).blur();
        }
      });
    });
  });

  const selfBox = root.querySelector('[data-ft-self]');
  if (selfBox) {
    selfBox.addEventListener('change', () => {
      const checked = /** @type {HTMLInputElement} */ (selfBox).checked;
      apply('role', checked ? 'self' : 'other');
    });
  }

  root.querySelectorAll('[data-ft-select]').forEach((wrap) => {
    const field = wrap.getAttribute('data-ft-select');
    const trigger = wrap.querySelector('[data-ft-select-trigger]');
    const menu = wrap.querySelector('.ft-select-menu');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hasAttribute('hidden');
      root.querySelectorAll('.ft-select-menu').forEach((m) => m.setAttribute('hidden', ''));
      root.querySelectorAll('.ft-select').forEach((s) => s.classList.remove('is-open'));
      if (willOpen) {
        menu.removeAttribute('hidden');
        wrap.classList.add('is-open');
      }
    });

    menu.querySelectorAll('.ft-select-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        apply(field, btn.getAttribute('data-value') || '');
      });
    });
  });

  root.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-ft-select]')) return;
    root.querySelectorAll('.ft-select-menu').forEach((m) => m.setAttribute('hidden', ''));
    root.querySelectorAll('.ft-select').forEach((s) => s.classList.remove('is-open'));
  });

  root.querySelectorAll('[data-ft-rel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = /** @type {'father'|'mother'|'partner'|'child'} */ (btn.getAttribute('data-ft-rel'));
      onAddRelative(person.id, kind);
    });
  });

  root.querySelectorAll('[data-ft-remove-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onRemoveLink(btn.getAttribute('data-ft-remove-link') || '');
    });
  });

  root.querySelector('[data-ft-delete]')?.addEventListener('click', () => {
    onDeletePerson(person.id);
  });
}

let spaceHeld = false;
let panKeysBound = false;
/** Viewport pan offset (transform), survives re-renders */
let panOffsetX = 0;
let panOffsetY = 0;
/** Viewport zoom — survives re-renders */
let viewZoom = 1;
/** Right details panel visibility — survives re-renders */
let panelOpen = true;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;

function isTreeOpen() {
  return document.getElementById('family-tree-modal')?.classList.contains('active');
}

function isTypingTarget(t) {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && t.isContentEditable)
  );
}

function applyViewportTransform(canvas) {
  if (!(canvas instanceof HTMLElement)) return;
  canvas.style.transform = `translate(${panOffsetX}px, ${panOffsetY}px) scale(${viewZoom})`;
}

function syncZoomLabel() {
  document.querySelectorAll('[data-ft-zoom-reset]').forEach((el) => {
    el.textContent = `${Math.round(viewZoom * 100)}%`;
  });
}

/**
 * Zoom toward a point in the wrap (client coords). Center if omitted.
 * @param {Element | null} wrap
 * @param {number} factor
 * @param {{ clientX?: number, clientY?: number }} [pivot]
 */
function zoomAt(wrap, factor, pivot = {}) {
  if (!(wrap instanceof HTMLElement)) return;
  const canvas = wrap.querySelector('[data-ft-canvas]');
  if (!(canvas instanceof HTMLElement)) return;

  const rect = wrap.getBoundingClientRect();
  const mx =
    typeof pivot.clientX === 'number' ? pivot.clientX - rect.left : rect.width / 2;
  const my =
    typeof pivot.clientY === 'number' ? pivot.clientY - rect.top : rect.height / 2;

  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewZoom * factor));
  if (Math.abs(next - viewZoom) < 0.0001) return;

  const canvasX = (mx - panOffsetX) / viewZoom;
  const canvasY = (my - panOffsetY) / viewZoom;
  viewZoom = next;
  panOffsetX = mx - canvasX * viewZoom;
  panOffsetY = my - canvasY * viewZoom;
  applyViewportTransform(canvas);
  syncZoomLabel();
}

/** @param {Element | null} wrap */
function resetZoom(wrap) {
  viewZoom = 1;
  panOffsetX = 0;
  panOffsetY = 0;
  if (wrap instanceof HTMLElement) {
    const canvas = wrap.querySelector('[data-ft-canvas]');
    applyViewportTransform(canvas);
  }
  syncZoomLabel();
}

function ensureSpacePanKeys() {
  if (panKeysBound) return;
  panKeysBound = true;

  const setSpace = (on) => {
    spaceHeld = on;
    document.querySelectorAll('[data-ft-canvas-wrap]').forEach((el) => {
      el.classList.toggle('is-space-pan', on);
      if (!on) el.classList.remove('is-panning');
    });
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (!isTreeOpen()) return;
      if (isTypingTarget(e.target)) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        setSpace(true);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const wrap = document.querySelector('#family-tree-modal [data-ft-canvas-wrap]');
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomAt(wrap, 1.15);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomAt(wrap, 1 / 1.15);
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom(wrap);
      }
    },
    true,
  );

  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      setSpace(false);
    },
    true,
  );

  window.addEventListener('blur', () => setSpace(false));
}

function bindCanvasInteractions(root, { onSelect, onMovePerson, tree }) {
  ensureSpacePanKeys();

  const wrap = root.querySelector('[data-ft-canvas-wrap]');
  const canvas = root.querySelector('[data-ft-canvas]');
  if (!canvas || !wrap) return;

  applyViewportTransform(canvas);
  syncZoomLabel();
  if (spaceHeld) wrap.classList.add('is-space-pan');

  let dragId = null;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;
  let moved = false;

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

  const startPan = (pe) => {
    panning = true;
    panStartX = pe.clientX;
    panStartY = pe.clientY;
    panOriginX = panOffsetX;
    panOriginY = panOffsetY;
    wrap.classList.add('is-panning');
    try {
      wrap.setPointerCapture(pe.pointerId);
    } catch {
      /* ignore */
    }
  };

  const movePan = (pe) => {
    if (!panning) return;
    panOffsetX = panOriginX + (pe.clientX - panStartX);
    panOffsetY = panOriginY + (pe.clientY - panStartY);
    applyViewportTransform(canvas);
  };

  const endPan = () => {
    if (!panning) return;
    panning = false;
    wrap.classList.remove('is-panning');
  };

  // Capture phase: Space / middle-button take over before card handlers
  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (!spaceHeld && e.button !== 1) return;
      const pe = /** @type {PointerEvent} */ (e);
      pe.preventDefault();
      pe.stopPropagation();
      startPan(pe);
    },
    true,
  );

  wrap.addEventListener('pointermove', (e) => {
    if (!panning) return;
    e.preventDefault();
    movePan(/** @type {PointerEvent} */ (e));
  });

  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);
  wrap.addEventListener('lostpointercapture', endPan);

  wrap.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Prevent browser image/text drag while panning
  wrap.addEventListener('dragstart', (e) => {
    if (spaceHeld || panning) e.preventDefault();
  });

  bindTouchGestures(wrap, {
    startPan,
    endPan,
    isPanning: () => panning,
    pinch: (factor, clientX, clientY, dx, dy) => {
      zoomAt(wrap, factor, { clientX, clientY });
      panOffsetX += dx;
      panOffsetY += dy;
      applyViewportTransform(canvas);
    },
  });

  wrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const zoomGesture = e.ctrlKey || e.metaKey;
      if (zoomGesture) {
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomAt(wrap, factor, { clientX: e.clientX, clientY: e.clientY });
        return;
      }
      panOffsetX -= e.deltaX;
      panOffsetY -= e.deltaY;
      applyViewportTransform(canvas);
    },
    { passive: false },
  );

  canvas.querySelectorAll('[data-ft-card]').forEach((card) => {
    const id = card.getAttribute('data-ft-card');

    card.addEventListener('pointerdown', (e) => {
      if (spaceHeld || e.button === 1 || panning) return;
      const person = tree.people.find((p) => p.id === id);
      if (!person) return;
      const pe = /** @type {PointerEvent} */ (e);
      dragId = id;
      moved = false;
      startX = pe.clientX;
      startY = pe.clientY;
      const layout = computeFamilyLayout(tree);
      const node = layout.nodes.find((n) => n.id === id);
      origX = typeof person.x === 'number' ? person.x : node?.x || 0;
      origY = typeof person.y === 'number' ? person.y : node?.y || 0;
      try {
        card.setPointerCapture(pe.pointerId);
      } catch {
        /* ignore */
      }
      pe.stopPropagation();
    });

    card.addEventListener('pointermove', (e) => {
      if (dragId !== id) return;
      const pe = /** @type {PointerEvent} */ (e);
      const dx = (pe.clientX - startX) / viewZoom;
      const dy = (pe.clientY - startY) / viewZoom;
      if (Math.abs(dx) + Math.abs(dy) > 4 / viewZoom) moved = true;
      if (!moved) return;
      if (card instanceof HTMLElement) {
        card.classList.add('is-dragging');
        card.style.left = `${origX + dx}px`;
        card.style.top = `${origY + dy}px`;
      }
    });

    card.addEventListener('pointerup', (e) => {
      if (dragId !== id) return;
      const pe = /** @type {PointerEvent} */ (e);
      const dx = (pe.clientX - startX) / viewZoom;
      const dy = (pe.clientY - startY) / viewZoom;
      dragId = null;
      if (card instanceof HTMLElement) card.classList.remove('is-dragging');
      if (moved) {
        onMovePerson(id, Math.round(origX + dx), Math.round(origY + dy));
      } else {
        onSelect(id);
      }
    });
  });
}
