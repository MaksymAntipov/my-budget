import './styles.css';
import { escapeHtml } from '../utils.js';
import { fetchNbuBonds, fetchPurchases, savePurchases } from './api.js';
import { createInvestForm } from './form.js';
import { MONTHS_SHORT, formatDateUa, instrumentKey, instrumentName, isoMonth, isoYear, purchaseCost, purchaseEvents } from './model.js';
import { fmt, money, renderPage } from './render.js';

/** @type {null | (() => { userId?: string, apiUrl?: string, authenticated?: boolean })} */
let getSession = null;
let mounted = false;
let hydrated = false;
/** @type {object[]} */
let purchases = [];
/** @type {Record<string, any>} */
let bonds = {};
let year = new Date().getFullYear();
let saveState = '';
/** @type {ReturnType<typeof createInvestForm> | null} */
let form = null;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function initInvest(deps) {
  getSession = deps.getSession;
  ensureDom();
  mounted = true;
}

export function openInvest() {
  if (!mounted) ensureDom();
  const session = getSession?.() || {};
  if (!session.userId) return;
  const modal = document.getElementById('invest-modal');
  if (!modal) return;
  modal.classList.add('active');
  hydrated = false;
  year = new Date().getFullYear();
  saveState = '';
  paint();
  fetchPurchases(session).then((list) => {
    purchases = list;
    hydrated = true;
    paint();
  });
  fetchNbuBonds().then((map) => {
    bonds = map || {};
    form?.bondsReady();
  });
}

export function closeInvest(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('invest-modal');
  const wasOpen = modal?.classList.contains('active');
  form?.close();
  hidePopover();
  if (modal) modal.classList.remove('active');
  if (wasOpen && typeof window.__onSkryniaOverlayClosed === 'function') {
    window.__onSkryniaOverlayClosed();
  }
}

function ensureDom() {
  if (document.getElementById('invest-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'invest-modal';
  modal.className = 'modal-overlay';
  modal.addEventListener('click', closeInvest);
  modal.innerHTML = `
    <div class="modal-content inv-modal-content" data-stop-propagation="1">
      <div id="invest-root"></div>
      <div class="inv-pop" data-inv-pop hidden></div>
      <div data-inv-form-host></div>
    </div>`;
  document.body.appendChild(modal);
  const content = modal.querySelector('.inv-modal-content');
  content.addEventListener('click', onClick);
  content.addEventListener('keydown', onKeydown);
  form = createInvestForm({
    host: modal.querySelector('[data-inv-form-host]'),
    getBonds: () => bonds,
    todayIso,
    onSave: upsertPurchase,
    onDelete: deletePurchase,
  });
}

/** Years with any purchase or payout, plus the current one, as a contiguous range. */
function yearRange() {
  const ys = new Set([new Date().getFullYear()]);
  for (const p of purchases) {
    ys.add(isoYear(p.date));
    for (const e of purchaseEvents(p)) ys.add(isoYear(e.date));
  }
  const min = Math.min(...ys), max = Math.max(...ys);
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function paint() {
  const root = document.getElementById('invest-root');
  if (!root) return;
  root.innerHTML = renderPage({ purchases, year, years: yearRange(), todayIso: todayIso(), loading: !hydrated, saveState });
  if (typeof window.updateSkryniaSwitcherUI === 'function') window.updateSkryniaSwitcherUI();
}

/* ---------- persistence: saved right after every add / edit / delete ---------- */

async function persist() {
  const session = getSession?.() || {};
  saveState = 'Зберігаю…';
  paint();
  const result = await savePurchases({ ...session, purchases });
  saveState = result.ok && !result.localOnly ? 'Збережено' : result.ok ? 'Збережено на цьому пристрої' : 'Не вдалося зберегти — спробую ще раз при наступній зміні';
  paint();
}

function upsertPurchase(p) {
  if (!hydrated) return;
  const i = purchases.findIndex((x) => x.id === p.id);
  if (i >= 0) purchases[i] = p; else purchases.push(p);
  year = isoYear(p.date);
  persist();
}

function deletePurchase(id) {
  if (!hydrated) return;
  purchases = purchases.filter((p) => p.id !== id);
  persist();
}

/* ---------- clicks ---------- */

function onClick(e) {
  const t = e.target;
  if (!t.closest('[data-inv-pop]') && !t.closest('[data-inv-cell]')) hidePopover();
  if (t.closest('[data-inv-close]')) { closeInvest(); return; }
  if (t.closest('[data-inv-add]')) { if (hydrated) form.open(null); return; }
  const yearBtn = t.closest('[data-inv-year]');
  if (yearBtn) { year = Number(yearBtn.dataset.invYear); paint(); return; }
  const cell = t.closest('[data-inv-cell]');
  if (cell) { onCell(cell); return; }
  const edit = t.closest('[data-inv-edit]');
  if (edit) { hidePopover(); openEdit(edit.dataset.invEdit); return; }
  const add = t.closest('[data-inv-pop-add]');
  if (add) { hidePopover(); form.open(null, JSON.parse(add.dataset.invPopAdd)); }
}

function onKeydown(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-inv-cell]')) { e.preventDefault(); onCell(e.target); }
  if (e.key === 'Escape' && !document.querySelector('[data-inv-pop]')?.hidden) hidePopover();
}

function openEdit(id) {
  const p = purchases.find((x) => x.id === id);
  if (p) form.open(p);
}

/** Cell click: one purchase → edit; several → pick one; none → add (or show the month's payouts first). */
function onCell(cell) {
  const key = cell.dataset.invCell;
  const month = Number(cell.dataset.invMonth);
  const rowPurchases = purchases.filter((p) => instrumentKey(p) === key);
  const inMonth = rowPurchases.filter((p) => isoYear(p.date) === year && isoMonth(p.date) === month);
  const events = rowPurchases.flatMap((p) => purchaseEvents(p).map((ev) => ({ ...ev, p })))
    .filter((ev) => isoYear(ev.date) === year && isoMonth(ev.date) === month);
  const sample = rowPurchases[0];
  const preset = {
    date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    kind: sample?.kind || 'ovdp',
    ...(sample?.kind === 'ovdp' ? { isin: sample.isin } : { where: sample?.where || '', months: String(sample?.months || 6) }),
  };
  if (inMonth.length === 1) { hidePopover(); openEdit(inMonth[0].id); return; }
  if (!inMonth.length && !events.length) { hidePopover(); form.open(null, preset); return; }
  showPopover(cell, `
    <b>${escapeHtml(sample ? instrumentName(sample) : '')} · ${MONTHS_SHORT[month]} ${year}</b>
    ${inMonth.map((p) => `
      <div class="inv-pop-item">
        <div class="inv-pop-line"><span>${formatDateUa(p.date)}${p.kind === 'ovdp' ? ` · ${fmt(p.qty)} × ${fmt(p.price, 2)}` : ''}</span><b>${money(purchaseCost(p), p.ccy, 2)}</b></div>
        <button type="button" class="rw-btn" data-inv-edit="${escapeHtml(p.id)}">Редагувати</button>
      </div>`).join('')}
    ${events.map((ev) => `<div class="inv-pop-line"><span><span class="inv-ev ${ev.type}">${ev.type === 'coupon' ? 'відсотки' : 'погашення'}</span>${formatDateUa(ev.date)}</span><b>${money(ev.amount, ev.p.ccy, 2)}</b></div>`).join('')}
    ${!inMonth.length ? `<button type="button" class="rw-btn" data-inv-pop-add="${escapeHtml(JSON.stringify(preset))}">+ Купівля в ${MONTHS_SHORT[month].toLowerCase()}</button>` : ''}`);
}


function showPopover(anchor, html) {
  const pop = document.querySelector('[data-inv-pop]');
  if (!pop) return;
  pop.innerHTML = html;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - pop.offsetWidth - 16))}px`;
  pop.style.top = `${Math.max(16, Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 16))}px`;
}

function hidePopover() {
  const pop = document.querySelector('[data-inv-pop]');
  if (pop) pop.hidden = true;
}
