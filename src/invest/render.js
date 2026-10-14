import { escapeHtml } from '../utils.js';
import {
  MONTHS_SHORT,
  buildSummary,
  buildYearMatrix,
  formatDateUa,
  splitByInstrument,
  upcomingPayouts,
} from './model.js';

const SYM = { UAH: '₴', USD: '$', EUR: '€' };

export function fmt(n, digits = 0) {
  return (Number(n) || 0).toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 1 234 ₴ / $1 234 / €1 234 */
export function money(n, ccy, digits = 0) {
  return ccy === 'UAH' || !SYM[ccy] ? `${fmt(n, digits)} ₴` : `${SYM[ccy]}${fmt(n, digits)}`;
}

export function currencySymbol(ccy) {
  return SYM[ccy] || '₴';
}

/** Header + summary + matrix + payouts + split. Purchases are already normalized. */
export function renderPage({ purchases, year, years, todayIso, loading, saveState }) {
  return `
    <div class="inv-shell">
      <header class="rw-header">
        <h2 class="rw-title">Інвестиції</h2>
        <div class="rw-header-actions">
          ${saveState ? `<span class="inv-save" data-inv-save>${escapeHtml(saveState)}</span>` : ''}
          <div class="rw-pills" role="group" aria-label="Рік">
            ${years.map((y) => `<button type="button" class="rw-pill${y === year ? ' is-on' : ''}" data-inv-year="${y}">${y}</button>`).join('')}
          </div>
          <button type="button" class="rw-btn" data-inv-add>+ Купівля</button>
          <div class="skrynia-switcher" data-skrynia-switcher style="display:none;">
            <button type="button" class="skrynia-switcher-btn" data-action="toggleSkryniaSwitcher" data-pass-event="1">Скриня <span style="opacity:0.7;font-size:10px;">▾</span></button>
            <div class="skrynia-switcher-dropdown"></div>
          </div>
          <button type="button" class="rw-btn" data-inv-close aria-label="Закрити">✕</button>
        </div>
      </header>
      <div class="rw-body">
        <div class="inv-page">
          ${loading ? '<div class="rw-empty"><p>Завантажую інвестиції…</p></div>'
            : purchases.length ? renderBody(purchases, year, todayIso) : renderEmpty()}
        </div>
      </div>
    </div>`;
}

function renderEmpty() {
  return `
    <div class="rw-empty">
      <p>Ще немає інвестицій</p>
      <span>Додай першу купівлю ОВДП або депозит — тут з’явиться таблиця по місяцях і графік виплат.</span>
    </div>
    <button type="button" class="btn-add inv-empty-add" data-inv-add>+ Додати купівлю</button>`;
}

function renderBody(purchases, year, todayIso) {
  return `
    ${renderSummary(purchases, year, todayIso)}
    <section>
      <h3 class="inv-h">Вкладення по місяцях <small>сума у валюті покупки, під нею — у гривні</small></h3>
      <div class="schedule-matrix-wrapper inv-matrix-wrap">${renderMatrix(purchases, year, todayIso)}</div>
      <div class="inv-legend">
        <span><span class="inv-ev coupon">↓ відсотки</span>тобі прийдуть відсотки в цьому місяці</span>
        <span><span class="inv-ev maturity">↓ погашення</span>повернеться облігація або депозит</span>
        <span>Натисни на суму — відкриється редагування</span>
      </div>
    </section>
    <div class="inv-two">
      <section>
        <h3 class="inv-h">Майбутні виплати <small>відсотки і погашення</small></h3>
        <div class="info-block inv-list">${renderPayouts(purchases, todayIso)}</div>
      </section>
      <section>
        <h3 class="inv-h">Розподіл <small>за інструментами, у гривні</small></h3>
        <div class="info-block inv-list">${renderSplit(purchases)}</div>
      </section>
    </div>`;
}

function renderSummary(purchases, year, todayIso) {
  const s = buildSummary(purchases, year, todayIso);
  const next = s.next;
  const tipRows = s.perPurchase.map((x) => `
    <span class="inv-tip-row"><span>${escapeHtml(x.name)} · до ${formatDateUa(x.purchase.mat)}</span><b>${x.profitUah >= 0 ? '+' : ''}${money(x.profitUah, 'UAH')}</b></span>`).join('');
  return `
    <div class="inv-summary">
      <div class="inv-stat">
        <div class="employee-field-label">Вкладено за ${year}</div>
        <div class="inv-stat-val">${money(s.investedUah, 'UAH')}</div>
        <div class="inv-ccy-split">${Object.entries(s.byCcy).map(([c, v]) => `<span class="rw-delta is-flat">${money(v, c)}</span>`).join('')}</div>
      </div>
      <div class="inv-stat">
        <div class="employee-field-label">Покупок</div>
        <div class="inv-stat-val">${s.count}</div>
        <div class="inv-stat-hint">${s.instruments} інструментів</div>
      </div>
      <div class="inv-stat inv-has-tip" tabindex="0">
        <div class="employee-field-label"><span class="rw-tip-val">Очікуваний дохід</span></div>
        <div class="inv-stat-val is-up">${s.incomeUah >= 0 ? '+' : ''}${money(s.incomeUah, 'UAH')}</div>
        <div class="inv-stat-hint">за весь період до погашення</div>
        <span class="inv-stat-tip" role="tooltip">
          <b>Прибуток за весь період</b> по кожній покупці: від дня покупки до погашення.
          Відсотки + повернення облігацій і депозитів − скільки заплатив. Валюта — за курсом на день покупки.
          <span class="inv-tip-rows">${tipRows}</span>
        </span>
      </div>
      <div class="inv-stat">
        <div class="employee-field-label">Найближча виплата</div>
        <div class="inv-stat-val">${next ? formatDateUa(next.date).slice(0, 5) : '—'}</div>
        <div class="inv-stat-hint">${next ? `${next.type === 'coupon' ? 'Відсотки' : 'Погашення'} · ${money(next.amount, next.purchase.ccy)}` : 'немає'}</div>
      </div>
    </div>`;
}

function renderMatrix(purchases, year, todayIso) {
  const m = buildYearMatrix(purchases, year);
  const nowMonth = Number(todayIso.slice(0, 4)) === year ? Number(todayIso.slice(5, 7)) - 1 : -1;
  let html = `<table class="schedule-table inv-table">
    <colgroup><col class="c-inst">${'<col>'.repeat(12)}<col class="c-total"></colgroup>
    <thead><tr><th>Інструмент</th>${MONTHS_SHORT.map((name, i) => `<th class="${i === nowMonth ? 'is-now' : ''}">${name}</th>`).join('')}<th>Разом</th></tr></thead><tbody>`;
  for (const group of m.groups) {
    html += `<tr class="inv-group"><td>${escapeHtml(group.label)}</td><td colspan="13"></td></tr>`;
    for (const row of group.rows) {
      html += `<tr><td><div class="inv-name">${escapeHtml(row.name)}</div>
        <div class="inv-meta"><span class="inv-ccy inv-ccy-${row.ccy}">${row.ccy}</span>до ${formatDateUa(row.mat)}</div></td>`;
      row.months.forEach((cell, mi) => {
        const tags = [
          cell.coupon ? `<span class="inv-ev coupon"><small>↓ відсотки</small>+${money(cell.coupon, row.ccy)}</span>` : '',
          cell.maturity ? `<span class="inv-ev maturity"><small>↓ погашення</small>${money(cell.maturity, row.ccy)}</span>` : '',
        ].join('');
        const body = cell.ids.length
          ? `<div class="inv-amt">${money(cell.sum, row.ccy)}</div>${row.ccy !== 'UAH' ? `<div class="inv-uah">${money(cell.sumUah, 'UAH')}</div>` : ''}`
          : '·';
        html += `<td class="inv-cell${cell.ids.length ? '' : ' is-empty'}" tabindex="0" data-inv-cell="${escapeHtml(row.key)}" data-inv-month="${mi}">${body}${tags ? `<div class="inv-evs">${tags}</div>` : ''}</td>`;
      });
      html += `<td class="inv-total"><div>${row.total ? money(row.total, row.ccy) : '—'}</div>${row.ccy !== 'UAH' && row.total ? `<div class="inv-uah">${money(row.totalUah, 'UAH')}</div>` : ''}</td></tr>`;
    }
  }
  html += `</tbody><tfoot>
    <tr><td>Разом у гривні</td>${m.monthUah.map((v) => `<td>${v ? fmt(v) : '—'}</td>`).join('')}<td>${money(m.totalUah, 'UAH')}</td></tr>
    <tr class="inv-cum"><td>Наростаючим підсумком</td>${m.cumUah.map((v) => `<td>${v ? fmt(v) : '—'}</td>`).join('')}<td></td></tr>
  </tfoot></table>`;
  return html;
}

function renderPayouts(purchases, todayIso) {
  const rows = upcomingPayouts(purchases, todayIso, 7);
  if (!rows.length) return '<div class="inv-empty-note">Майбутніх виплат немає.</div>';
  return rows.map((e) => {
    const p = e.purchase;
    const sub = p.kind === 'deposit' ? `вклад ${money(p.amount, p.ccy)} · ${p.months} міс.` : `${fmt(p.qty)} шт · ${escapeHtml(p.where || '')}`;
    return `
      <div class="inv-row">
        <div class="inv-date">${formatDateUa(e.date).slice(0, 5)}<small>${e.date.slice(0, 4)}</small></div>
        <div class="inv-what"><b><span class="inv-ev ${e.type}">${e.type === 'coupon' ? 'відсотки' : 'погашення'}</span>${escapeHtml(p.kind === 'deposit' ? `Депозит · ${p.where || 'банк'}` : p.isin)}</b><div>${sub}</div></div>
        <div class="inv-money">${money(e.amount, p.ccy, p.ccy === 'UAH' ? 0 : 2)}${p.ccy !== 'UAH' ? `<small>≈ ${money(e.amount * p.rate, 'UAH')}</small>` : ''}</div>
      </div>`;
  }).join('');
}

function renderSplit(purchases) {
  return splitByInstrument(purchases).map((r) => `
    <div class="inv-row inv-row-split">
      <div class="inv-what"><b>${escapeHtml(r.name)}</b> <span class="inv-ccy inv-ccy-${r.ccy}">${r.ccy}</span>
        <div class="inv-bar"><i style="width:${(r.share * 100).toFixed(1)}%"></i></div></div>
      <div class="inv-money">${money(r.uah, 'UAH')}<small>${fmt(r.share * 100, 1)}%</small></div>
    </div>`).join('');
}
