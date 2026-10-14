import { escapeHtml, newId } from '../utils.js';
import {
  DEPOSIT_TAX,
  NOMINAL,
  addMonthsIso,
  autoSchedule,
  depositCalc,
  formatDateUa,
  instrumentName,
  nbuSchedule,
  purchaseCost,
  purchaseEvents,
  validatePurchase,
} from './model.js';
import { currencySymbol, fmt, money } from './render.js';
import { fetchNbuRate } from './api.js';

const KIND_OPTIONS = [['ovdp', 'ОВДП (облігації України)'], ['deposit', 'Депозит']];
const CCY_OPTIONS = [['UAH', 'Гривня'], ['USD', 'Долар'], ['EUR', 'Євро']];
const TERM_OPTIONS = [1, 3, 6, 9, 12, 18, 24].map((n) => [String(n), `${n} ${n === 1 ? 'місяць' : n < 5 ? 'місяці' : 'місяців'}`]);
const PAYOUT_OPTIONS = [['end', 'в кінці строку'], ['monthly', 'щомісяця на картку'], ['cap', 'капіталізація']];
const CCY_IN = { UAH: 'у гривні', USD: 'у доларах', EUR: 'у євро' };
const DELETE_WORDS = ['видалити', 'удалить'];
const TAX_PCT = Math.round(DEPOSIT_TAX * 100);

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

function dropdown(name, options, value, label) {
  const current = options.find(([v]) => v === value) || options[0];
  return `
    <div class="custom-dropdown compact" data-inv-dd="${name}">
      <div class="custom-dropdown-selected" tabindex="0" role="button" aria-haspopup="listbox" aria-label="${escapeHtml(label)}">${escapeHtml(current[1])}</div>
      <div class="custom-dropdown-options" role="listbox">
        ${options.map(([v, text]) => `
          <div class="custom-dropdown-option${v === current[0] ? ' selected' : ''}" role="option" tabindex="0" aria-selected="${v === current[0]}" data-value="${escapeHtml(v)}">
            <span class="option-check">${v === current[0] ? '✓' : ''}</span><span class="option-label">${escapeHtml(text)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

/**
 * Add / edit sheet for one purchase plus the typed-word delete confirmation.
 * @param {{ host: HTMLElement, getBonds: () => Record<string, any>, todayIso: () => string,
 *   onSave: (p: object) => void, onDelete: (id: string) => void }} deps
 */
export function createInvestForm({ host, getBonds, todayIso, onSave, onDelete }) {
  /** @type {any} */
  let s = null;
  let rateTouched = false;

  host.innerHTML = `
    <div class="inv-sheet-overlay" data-inv-sheet-overlay hidden></div>
    <div class="inv-confirm-overlay" data-inv-confirm hidden></div>`;
  const overlay = host.querySelector('[data-inv-sheet-overlay]');
  const confirmBox = host.querySelector('[data-inv-confirm]');
  const $ = (sel) => overlay.querySelector(sel);

  function blankState(preset = {}) {
    return {
      editId: null, kind: 'ovdp', date: todayIso(), isin: '', ccy: 'UAH', rate: '', qty: '', price: '', ytm: '',
      where: '', amount: '', months: '6', payout: 'end', tax: true,
      coupons: [], mat: '', matAmt: 0, schedTouched: false, nbu: null, storedFromNbu: false,
      ...preset,
    };
  }

  function stateFromPurchase(p) {
    const base = blankState({
      editId: p.id, kind: p.kind, date: p.date, ccy: p.ccy, rate: p.ccy === 'UAH' ? '' : String(p.rate || ''),
      where: p.where || '', ytm: p.ytm != null ? String(p.ytm) : '',
    });
    if (p.kind === 'deposit') {
      return { ...base, amount: String(p.amount || ''), months: String(p.months || 6), payout: p.payout || 'end', tax: p.tax !== false };
    }
    const sched = Array.isArray(p.schedule) ? p.schedule : [];
    const m = sched.find((r) => r.kind === 'maturity');
    return {
      ...base, isin: p.isin || '', qty: String(p.qty || ''), price: String(p.price || ''),
      coupons: sched.filter((r) => r.kind === 'coupon').map((r) => ({ date: r.date, amt: r.amt })),
      mat: m?.date || p.mat || '', matAmt: m?.amt || 0, schedTouched: true, storedFromNbu: Boolean(p.fromNbu),
    };
  }

  /* ---------- open / close ---------- */

  function open(purchase, preset) {
    s = purchase ? stateFromPurchase(purchase) : blankState(preset || {});
    rateTouched = Boolean(purchase && purchase.ccy !== 'UAH');
    overlay.innerHTML = sheetHtml();
    overlay.hidden = false;
    applyKind();
    if (!purchase) maybeAutoRate();
    requestAnimationFrame(() => overlay.querySelector('.inv-sheet')?.classList.add('is-open'));
  }

  function close() {
    overlay.hidden = true;
    overlay.innerHTML = '';
    closeConfirm();
    s = null;
  }

  const isOpen = () => !overlay.hidden;

  /** NBU list arrived after the sheet opened: re-check the ISIN. */
  function bondsReady() {
    if (!s || s.kind !== 'ovdp') return;
    lookupIsin();
    renderSchedule();
    renderPreview();
  }

  /* ---------- markup ---------- */

  function sheetHtml() {
    return `
      <form class="inv-sheet" novalidate aria-labelledby="inv-form-title">
        <div class="modal-header">
          <div class="modal-title-group"><h3 id="inv-form-title" data-inv-title></h3></div>
          <button type="button" class="btn-close-modal" data-inv-form-close aria-label="Закрити">✕</button>
        </div>

        <div class="limit-editor-title">Куди інвестую</div>
        <div class="inv-field">
          <span class="employee-field-label">Інструмент</span>
          ${dropdown('kind', KIND_OPTIONS, s.kind, 'Інструмент')}
        </div>
        <div class="inv-grid2">
          <div class="inv-field"><label class="employee-field-label" for="inv-f-date" data-inv-l-date>Дата покупки</label>
            <input class="ios-input" id="inv-f-date" type="date" value="${escapeHtml(s.date)}" data-f="date"></div>
          <div class="inv-field" data-only="ovdp"><label class="employee-field-label" for="inv-f-isin">ISIN</label>
            <input class="ios-input" id="inv-f-isin" value="${escapeHtml(s.isin)}" data-f="isin" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="UA4000…"></div>
          <div class="inv-isin-status" data-only="ovdp" data-inv-isin-status role="status"></div>
          <div class="inv-field" data-only="deposit"><span class="employee-field-label">Строк</span>
            ${dropdown('months', TERM_OPTIONS, s.months, 'Строк')}</div>
        </div>

        <div class="limit-editor-title">Сума</div>
        <div class="inv-grid2" data-inv-money-grid>
          <div class="inv-field" data-inv-ccy-field><span class="employee-field-label">Валюта</span>
            ${dropdown('ccy', CCY_OPTIONS, s.ccy, 'Валюта')}</div>
          <div class="inv-field" data-inv-rate-field><label class="employee-field-label" for="inv-f-rate" data-inv-l-rate>Курс до гривні</label>
            <input class="ios-input" id="inv-f-rate" inputmode="decimal" value="${escapeHtml(s.rate)}" data-f="rate" placeholder="напр. 41.85"></div>
        </div>
        <div class="inv-grid2" data-only="ovdp">
          <div class="inv-field"><label class="employee-field-label" for="inv-f-qty">Кількість, шт.</label>
            <input class="ios-input" id="inv-f-qty" inputmode="numeric" value="${escapeHtml(s.qty)}" data-f="qty"></div>
          <div class="inv-field"><label class="employee-field-label" for="inv-f-price">Ціна за 1 шт.</label>
            <input class="ios-input" id="inv-f-price" inputmode="decimal" value="${escapeHtml(s.price)}" data-f="price"></div>
        </div>
        <div class="inv-field" data-only="deposit"><label class="employee-field-label" for="inv-f-amount">Сума депозиту</label>
          <input class="ios-input" id="inv-f-amount" inputmode="decimal" value="${escapeHtml(s.amount)}" data-f="amount"></div>

        <div class="limit-editor-title">Дохід і виплати</div>
        <div class="inv-field"><label class="employee-field-label" for="inv-f-ytm" data-inv-l-ytm>Дохідність, % річних</label>
          <input class="ios-input" id="inv-f-ytm" inputmode="decimal" value="${escapeHtml(s.ytm)}" data-f="ytm"></div>
        <div class="inv-field" data-only="ovdp">
          <span class="employee-field-label" data-inv-l-sched>Графік виплат</span>
          <div class="inv-pays" data-inv-sched></div>
          <button type="button" class="btn-add" data-inv-add-coupon>+ Виплата відсотків</button>
        </div>
        <div class="inv-field" data-only="deposit"><span class="employee-field-label">Відсотки</span>
          ${dropdown('payout', PAYOUT_OPTIONS, s.payout, 'Відсотки')}</div>
        <label class="inv-check" data-only="deposit"><input type="checkbox" data-f="tax" ${s.tax ? 'checked' : ''}> Враховувати податок ${TAX_PCT}% <span>(18% ПДФО + 5% військовий збір)</span></label>
        <div class="inv-field"><label class="employee-field-label" for="inv-f-where" data-inv-l-where>Де купив</label>
          <input class="ios-input" id="inv-f-where" value="${escapeHtml(s.where)}" data-f="where" placeholder="напр. Монобанк"></div>

        <div class="info-block inv-preview" data-inv-preview></div>
        <p class="inv-form-error" data-inv-error role="alert" hidden></p>
        <button class="btn-modal-done" type="submit" data-inv-submit></button>
        <button class="btn-modal-delete" type="button" data-inv-delete hidden></button>
      </form>`;
  }

  /* ---------- state → view ---------- */

  function applyKind() {
    const dep = s.kind === 'deposit';
    overlay.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== s.kind; });
    const editing = Boolean(s.editId);
    $('[data-inv-title]').textContent = editing ? (dep ? 'Редагування депозиту' : 'Редагування купівлі') : (dep ? 'Новий депозит' : 'Нова купівля');
    $('[data-inv-l-date]').textContent = dep ? 'Дата відкриття' : 'Дата покупки';
    $('[data-inv-l-where]').textContent = dep ? 'Де відкрив' : 'Де купив';
    $('[data-inv-l-ytm]').textContent = dep ? 'Ставка, % річних' : 'Дохідність, % річних';
    $('[data-inv-submit]').textContent = editing ? 'Зберегти зміни' : (dep ? 'Додати депозит' : 'Додати купівлю');
    const del = $('[data-inv-delete]');
    del.hidden = !editing;
    del.textContent = dep ? 'Видалити депозит' : 'Видалити купівлю';
    if (dep) s.nbu = null;
    else lookupIsin();
    syncCurrency();
    renderSchedule();
    renderPreview();
  }

  function setDropdown(name, value) {
    const el = $(`[data-inv-dd="${name}"]`);
    if (!el) return;
    const options = { kind: KIND_OPTIONS, ccy: CCY_OPTIONS, months: TERM_OPTIONS, payout: PAYOUT_OPTIONS }[name];
    const label = el.querySelector('.custom-dropdown-selected')?.getAttribute('aria-label') || '';
    el.outerHTML = dropdown(name, options, value, label);
  }

  /** Currency belongs to an NBU bond: hide the picker; the rate field shows only for $ and €. */
  function syncCurrency() {
    const locked = s.kind === 'ovdp' && Boolean(s.nbu);
    setDropdown('ccy', s.ccy);
    $('[data-inv-ccy-field]').hidden = locked;
    const foreign = s.ccy !== 'UAH';
    $('[data-inv-rate-field]').hidden = !foreign;
    $('[data-inv-money-grid]').hidden = locked && !foreign;
    $('[data-inv-money-grid]').classList.toggle('is-single', locked || !foreign);
    if (foreign) {
      $('[data-inv-l-rate]').innerHTML = `Курс ${currencySymbol(s.ccy)} до гривні <span>на дату покупки</span>`;
    }
  }

  function lookupIsin() {
    const code = s.isin.trim().toUpperCase();
    const bonds = getBonds() || {};
    const bond = bonds[code];
    const st = $('[data-inv-isin-status]');
    const was = s.nbu;
    s.nbu = bond ? code : null;
    st.className = 'inv-isin-status';
    if (bond) {
      const sched = nbuSchedule(bond);
      s.coupons = sched.filter((r) => r.kind === 'coupon').map((r) => ({ date: r.date, amt: r.amt }));
      const m = sched.find((r) => r.kind === 'maturity');
      s.mat = m?.date || bond.mat;
      s.matAmt = m?.amt || bond.nominal;
      s.schedTouched = false;
      if (s.ccy !== bond.ccy) { s.ccy = bond.ccy; rateTouched = false; maybeAutoRate(); }
      st.classList.add('is-ok');
      st.innerHTML = `✓ Знайдено в НБУ: <b>ОВДП ${CCY_IN[bond.ccy]}</b>, купон ${fmt(bond.coupon, 2)}% річних, погашення <b>${formatDateUa(bond.mat)}</b>. Валюту і графік виплат заповнено автоматично.`;
    } else if (code.length >= 12) {
      if (was) s.schedTouched = false;
      const known = Object.keys(bonds).length > 0;
      if (!known && s.storedFromNbu && s.coupons.length) {
        st.classList.add('is-ok');
        st.textContent = 'Дані НБУ зараз недоступні — показую збережений графік.';
      } else {
        st.classList.add('is-miss');
        st.textContent = known
          ? 'Такого ISIN немає в даних НБУ. Перевір код або заповни валюту і графік виплат вручну.'
          : 'Не вдалося завантажити дані НБУ. Заповни валюту і графік виплат вручну.';
      }
    } else {
      st.textContent = '';
    }
    if (!s.nbu && !s.schedTouched && s.mat) autoFill();
  }

  const lastCouponAmt = () => s.coupons.find((c) => c.amt)?.amt || 0;

  function autoFill() {
    const amt = lastCouponAmt();
    const sched = autoSchedule(s.date, s.mat, amt);
    s.coupons = sched.filter((r) => r.kind === 'coupon').map((r) => ({ date: r.date, amt: r.amt }));
    s.matAmt = NOMINAL + amt;
  }

  function renderSchedule() {
    if (s.kind !== 'ovdp') return;
    const ro = s.nbu ? ' disabled' : '';
    $('[data-inv-l-sched]').innerHTML = `Графік виплат <span>(сума за 1 шт.)</span>${s.nbu ? '<span class="inv-lock">з НБУ</span>' : ''}`;
    $('[data-inv-add-coupon]').hidden = Boolean(s.nbu);
    let n = 0;
    const coupons = s.coupons.map((c, i) => ((s.nbu || s.storedFromNbu) && c.date && c.date <= s.date) ? '' : `
      <div class="sub-item inv-pay">
        <div class="inv-pay-head"><span><span class="inv-pay-n">${++n}</span>Виплата відсотків</span>${s.nbu ? '' : `<button type="button" class="inv-pay-rm" data-inv-rm="${i}" aria-label="Видалити виплату">✕</button>`}</div>
        <div class="inv-pay-fields">
          <input type="date" value="${escapeHtml(c.date)}" data-cd="${i}" aria-label="Дата виплати відсотків ${n}"${ro}>
          <input inputmode="decimal" value="${c.amt || ''}" data-ca="${i}" placeholder="за 1 шт." aria-label="Сума за 1 шт."${ro}>
        </div>
        <div class="inv-pay-sum"><span>заробіток з відсотків</span><b data-cs="${i}"></b></div>
      </div>`).join('');
    const mat = `
      <div class="sub-item inv-pay is-maturity">
        <div class="inv-pay-head"><span><span class="inv-pay-n">${n + 1}</span>Виплата облігації <em>· погашення</em></span></div>
        <div class="inv-pay-fields">
          <input type="date" value="${escapeHtml(s.mat)}" data-mat aria-label="Дата виплати облігації (погашення)"${ro}>
          <input inputmode="decimal" value="${s.matAmt || ''}" data-mat-amt placeholder="за 1 шт." aria-label="Сума за 1 шт."${ro}>
        </div>
        <div class="inv-pay-sum"><span data-mat-note></span><b data-ms></b></div>
      </div>`;
    $('[data-inv-sched]').innerHTML = coupons + mat;
    updateSums();
  }

  function updateSums() {
    if (s.kind !== 'ovdp') return;
    const qty = num(s.qty);
    const noQty = 'вкажи кількість';
    s.coupons.forEach((c, i) => {
      const el = overlay.querySelector(`[data-cs="${i}"]`);
      if (el) el.textContent = !qty ? noQty : c.amt ? `+${money(qty * c.amt, s.ccy, 2)}` : '—';
    });
    const ms = $('[data-ms]');
    if (ms) ms.textContent = !qty ? noQty : s.matAmt ? money(qty * s.matAmt, s.ccy, 2) : '—';
    const note = $('[data-mat-note]');
    const extra = s.matAmt - NOMINAL;
    if (note) note.textContent = extra > 0 ? `номінал ${fmt(NOMINAL)} + відсотки ${fmt(extra, 2)} за 1 шт.` : `номінал за ${fmt(qty)} шт.`;
  }

  /* ---------- purchase from state ---------- */

  function readPurchase() {
    const rate = s.ccy === 'UAH' ? 1 : num(s.rate);
    const base = { id: s.editId || newId(), kind: s.kind, date: s.date, ccy: s.ccy, rate, where: s.where.trim(), ytm: num(s.ytm) };
    if (s.kind === 'deposit') {
      const months = Number(s.months) || 0;
      return { ...base, amount: num(s.amount), months, payout: s.payout, tax: Boolean(s.tax), mat: addMonthsIso(s.date, months) };
    }
    const schedule = [
      ...s.coupons.filter((c) => c.date).sort((a, b) => a.date.localeCompare(b.date)).map((c) => ({ date: c.date, kind: 'coupon', amt: num(c.amt) })),
      ...(s.mat ? [{ date: s.mat, kind: 'maturity', amt: num(s.matAmt) }] : []),
    ];
    return {
      ...base, isin: s.isin.trim().toUpperCase(), qty: num(s.qty), price: num(s.price), mat: s.mat,
      schedule, fromNbu: Boolean(s.nbu) || (s.storedFromNbu && !Object.keys(getBonds() || {}).length),
    };
  }

  /* ---------- summary with hover tips (runway .rw-tip-val / .rw-tip-box) ---------- */

  const tip = (text, formula) => `<span class="inv-line-tip" role="tooltip">${text}${formula ? `<span class="inv-line-f">${formula}</span>` : ''}</span>`;
  const line = (label, value, tipHtml, cls = '') =>
    `<div class="info-row inv-line" tabindex="0"><span class="text-label"><span class="rw-tip-val">${label}</span></span><span class="text-value${cls}">${value}</span>${tipHtml}</div>`;

  function renderPreview() {
    const box = $('[data-inv-preview]');
    if (!box || !s) return;
    const p = readPurchase();
    const m = (n) => money(n, p.ccy, 2);
    const uahLine = p.ccy !== 'UAH'
      ? line('У гривні', p.rate ? money(purchaseCost(p) * p.rate, 'UAH', 2) : 'вкажи курс',
        tip('Сума, перерахована в гривню за курсом на день покупки.', p.rate ? `${m(purchaseCost(p))} × ${fmt(p.rate, 2)} = ${money(purchaseCost(p) * p.rate, 'UAH', 2)}` : ''))
      : '';

    if (p.kind === 'deposit') {
      const c = depositCalc(p);
      const pct = `${fmt(p.ytm, 2)}%`;
      const grossTip = p.payout === 'cap'
        ? tip('Капіталізація: щомісяця відсотки додаються до суми депозиту, і наступного місяця відсотки нараховуються вже на більшу суму.', `${m(c.amount)} × ((1 + ${pct} / 12)^${c.months} − 1) = ${m(c.gross)}`)
        : tip('Сума депозиту × ставка × строк у роках.', `${m(c.amount)} × ${pct} × ${c.months}/12 = ${m(c.gross)}`);
      const totalTip = p.payout === 'monthly' && c.months
        ? tip(`Щомісяця на картку прийде ~${m(c.net / c.months)} відсотків, а в кінці строку повернеться сума депозиту.`, `${m(c.net / c.months)} × ${c.months} + ${m(c.amount)} = ${m(c.amount + c.net)}`)
        : tip('У кінці строку повернеться сума депозиту разом з відсотками після податку.', `${m(c.amount)} + ${m(c.net)} = ${m(c.amount + c.net)}`);
      box.innerHTML =
        line('Сума депозиту', m(c.amount), tip('Скільки поклав на депозит.')) + uahLine +
        line('Закінчення', p.mat ? formatDateUa(p.mat) : '—', tip('Дата відкриття + строк депозиту.', p.mat ? `${formatDateUa(p.date)} + ${c.months} міс. = ${formatDateUa(p.mat)}` : '')) +
        line('Відсотки до податку', m(c.gross), grossTip) +
        (p.tax ? line(`Податок ${TAX_PCT}%`, `−${m(c.tax)}`, tip('З відсотків по депозиту банк сам утримує 18% ПДФО і 5% військовий збір. З ОВДП податку немає.', `${m(c.gross)} × ${TAX_PCT}% = ${m(c.tax)}`)) : '') +
        line('Отримаю всього', m(c.amount + c.net), totalTip) +
        line('Прибуток', `${c.net >= 0 ? '+' : ''}${m(c.net)}`, tip('Чистий заробіток: відсотки після податку.', p.tax ? `${m(c.gross)} − ${m(c.tax)} = ${m(c.net)}` : ''), c.net >= 0 ? ' is-up' : ' is-warn');
      return;
    }

    const ev = p.date ? purchaseEvents(p) : [];
    const cps = ev.filter((e) => e.type === 'coupon');
    const coupons = cps.reduce((sum, e) => sum + e.amount, 0);
    const payout = ev.filter((e) => e.type === 'maturity').reduce((sum, e) => sum + e.amount, 0);
    const total = coupons + payout;
    const cost = purchaseCost(p);
    const profit = total - cost;
    const q = fmt(p.qty);
    const cRows = p.schedule.filter((r) => r.kind === 'coupon' && r.date > p.date);
    const matRow = p.schedule.find((r) => r.kind === 'maturity') || { amt: 0 };
    const extra = matRow.amt - NOMINAL;
    box.innerHTML =
      line('Сума покупки', m(cost), tip('Скільки ти заплатив за облігації: кількість × ціна за 1 шт.', `${q} × ${m(p.price)} = ${m(cost)}`)) + uahLine +
      line(`Виплати відсотків (${cps.length} ${plural(cps.length, 'виплата', 'виплати', 'виплат')})`, m(coupons),
        tip(cRows.length ? 'Відсотки, які держава виплачує до погашення. Беруться з графіка виплат: сума за 1 шт. × кількість.' : 'У графіку немає виплат відсотків до погашення.',
          cRows.length ? `(${cRows.map((r) => fmt(r.amt, 2)).join(' + ')}) × ${q} = ${m(coupons)}` : '')) +
      line('Виплата облігації', m(payout),
        tip(`Що прийде в день погашення${p.mat ? ` (${formatDateUa(p.mat)})` : ''}: повернення номіналу ${m(NOMINAL)} за 1 шт.${extra > 0 ? ` разом з останньою виплатою відсотків ${m(extra)}` : ''}.`,
          `${extra > 0 ? `(${fmt(NOMINAL)} + ${fmt(extra, 2)})` : fmt(matRow.amt, 2)} × ${q} = ${m(payout)}`)) +
      line('Отримаю всього', m(total), tip('Усі гроші, які повернуться тобі від цієї покупки: виплати відсотків + виплата облігації.', `${m(coupons)} + ${m(payout)} = ${m(total)}`)) +
      line('Прибуток', `${profit >= 0 ? '+' : ''}${m(profit)}`,
        tip(`Чистий заробіток: отримаю всього − сума покупки.${p.price > NOMINAL ? ` Ціна за 1 шт. вища за номінал (${m(p.price)} проти ${m(NOMINAL)}), бо в неї входять відсотки, накопичені з минулої виплати. Тому прибуток менший, ніж сума всіх відсотків.` : ''}`,
          `${m(total)} − ${m(cost)} = ${m(profit)}`), profit >= 0 ? ' is-up' : ' is-warn');
  }

  /* ---------- NBU exchange rate on the purchase day ---------- */

  async function maybeAutoRate() {
    if (!s || s.ccy === 'UAH' || rateTouched || !s.date) return;
    const want = `${s.ccy}:${s.date}`;
    const rate = await fetchNbuRate(s.ccy, s.date);
    if (!s || rateTouched || `${s.ccy}:${s.date}` !== want || !rate) return;
    s.rate = String(rate);
    const input = $('#inv-f-rate');
    if (input) input.value = s.rate;
    const label = $('[data-inv-l-rate]');
    if (label) label.innerHTML = `Курс ${currencySymbol(s.ccy)} до гривні <span>НБУ на ${formatDateUa(s.date)}</span>`;
    renderPreview();
  }

  /* ---------- events ---------- */

  function onDropdownPick(name, value) {
    if (!s) return;
    if (name === 'kind') { s.kind = value; applyKind(); return; }
    if (name === 'ccy') { s.ccy = value; rateTouched = false; if (value === 'UAH') s.rate = ''; syncCurrency(); maybeAutoRate(); updateSums(); renderSchedule(); renderPreview(); return; }
    s[name] = value;
    setDropdown(name, value);
    renderPreview();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); return; }
    const head = e.target.closest('.custom-dropdown-selected');
    const dd = e.target.closest('[data-inv-dd]');
    if (head && dd) {
      const wasOpen = dd.classList.contains('open');
      overlay.querySelectorAll('.custom-dropdown.open').forEach((el) => el.classList.remove('open'));
      dd.classList.toggle('open', !wasOpen);
      if (!wasOpen) dd.querySelector('.custom-dropdown-option.selected')?.focus({ preventScroll: true });
      return;
    }
    const opt = e.target.closest('.custom-dropdown-option');
    if (opt && dd) { onDropdownPick(dd.dataset.invDd, opt.dataset.value); return; }
    if (!dd) overlay.querySelectorAll('.custom-dropdown.open').forEach((el) => el.classList.remove('open'));
    if (e.target.closest('[data-inv-form-close]')) { close(); return; }
    const rm = e.target.closest('[data-inv-rm]');
    if (rm) { s.coupons.splice(Number(rm.dataset.invRm), 1); s.schedTouched = true; renderSchedule(); renderPreview(); return; }
    if (e.target.closest('[data-inv-add-coupon]')) {
      s.coupons.push({ date: '', amt: lastCouponAmt() });
      s.schedTouched = true;
      renderSchedule();
      overlay.querySelector(`[data-cd="${s.coupons.length - 1}"]`)?.focus();
      return;
    }
    if (e.target.closest('[data-inv-delete]')) openConfirm();
  });

  overlay.addEventListener('keydown', (e) => {
    const dd = e.target.closest('[data-inv-dd]');
    if (e.key === 'Escape') {
      if (dd?.classList.contains('open')) { dd.classList.remove('open'); dd.querySelector('.custom-dropdown-selected')?.focus(); }
      else close();
      return;
    }
    if (!dd) return;
    if (e.target.classList.contains('custom-dropdown-selected') && ['Enter', ' ', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); e.target.click(); return;
    }
    const opt = e.target.closest('.custom-dropdown-option');
    if (!opt) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const name = dd.dataset.invDd;
      onDropdownPick(name, opt.dataset.value);
      $(`[data-inv-dd="${name}"] .custom-dropdown-selected`)?.focus();
    } else if (e.key === 'ArrowDown') { e.preventDefault(); opt.nextElementSibling?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opt.previousElementSibling?.focus(); }
  });

  overlay.addEventListener('input', (e) => {
    if (!s) return;
    const t = e.target;
    if (t.dataset.f) {
      const f = t.dataset.f;
      s[f] = t.type === 'checkbox' ? t.checked : t.value;
      if (f === 'isin') { lookupIsin(); syncCurrency(); renderSchedule(); }
      if (f === 'rate') rateTouched = true;
      if (f === 'qty') updateSums();
      renderPreview();
      return;
    }
    if (t.dataset.cd != null) s.coupons[Number(t.dataset.cd)].date = t.value;
    else if (t.dataset.ca != null) s.coupons[Number(t.dataset.ca)].amt = num(t.value);
    else if (t.hasAttribute('data-mat-amt')) s.matAmt = num(t.value);
    else if (t.hasAttribute('data-mat')) { s.mat = t.value; renderPreview(); return; }
    else return;
    s.schedTouched = true;
    updateSums();
    renderPreview();
  });

  overlay.addEventListener('change', (e) => {
    if (!s) return;
    if (e.target.dataset.f === 'date') {
      if (s.kind === 'ovdp' && !s.nbu && !s.schedTouched && s.mat) autoFill();
      if (!rateTouched) maybeAutoRate();
      renderSchedule();
      renderPreview();
    }
    // A new maturity date rebuilds manual interest dates, unless they were entered by hand.
    if (e.target.hasAttribute('data-mat') && !s.nbu && !s.schedTouched) { autoFill(); renderSchedule(); renderPreview(); }
  });

  overlay.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!s) return;
    const p = readPurchase();
    const error = validatePurchase(p);
    const box = $('[data-inv-error]');
    if (error) { box.textContent = error; box.hidden = false; return; }
    box.hidden = true;
    onSave(p);
    close();
  });

  /* ---------- delete with a typed word (app #confirm-modal look) ---------- */

  function openConfirm() {
    if (!s?.editId) return;
    const p = readPurchase();
    const dep = p.kind === 'deposit';
    const what = dep
      ? `<b>${escapeHtml(instrumentName(p))}</b> від ${formatDateUa(p.date)} на <b>${money(p.amount, p.ccy, 2)}</b> зникне з таблиці і з майбутніх виплат.`
      : `<b>${escapeHtml(p.isin)}</b> від ${formatDateUa(p.date)}: ${fmt(p.qty)} шт на <b>${money(purchaseCost(p), p.ccy, 2)}</b> зникне з таблиці і з майбутніх виплат.`;
    confirmBox.innerHTML = `
      <div class="inv-confirm" role="alertdialog" aria-modal="true" aria-labelledby="inv-del-title">
        <div class="inv-confirm-icon" aria-hidden="true">⚠️</div>
        <h3 id="inv-del-title">${dep ? 'Видалити депозит?' : 'Видалити купівлю?'}</h3>
        <p>${what}</p>
        <div class="inv-field">
          <label class="employee-field-label" for="inv-del-input">Щоб підтвердити, введи <b>видалити</b></label>
          <input class="ios-input" id="inv-del-input" autocomplete="off" spellcheck="false" placeholder="видалити">
        </div>
        <div class="inv-confirm-actions">
          <button type="button" class="btn-init-secondary" data-inv-del-cancel>Назад</button>
          <button type="button" class="btn-init-primary inv-btn-danger" data-inv-del-ok disabled>Видалити</button>
        </div>
      </div>`;
    confirmBox.hidden = false;
    confirmBox.querySelector('#inv-del-input').focus();
  }

  function closeConfirm() {
    confirmBox.hidden = true;
    confirmBox.innerHTML = '';
  }

  confirmBox.addEventListener('input', (e) => {
    if (e.target.id !== 'inv-del-input') return;
    confirmBox.querySelector('[data-inv-del-ok]').disabled = !DELETE_WORDS.includes(e.target.value.trim().toLowerCase());
  });
  confirmBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeConfirm(); $('[data-inv-delete]')?.focus(); }
    if (e.key === 'Enter' && e.target.id === 'inv-del-input') confirmBox.querySelector('[data-inv-del-ok]:not(:disabled)')?.click();
  });
  confirmBox.addEventListener('click', (e) => {
    if (e.target === confirmBox || e.target.closest('[data-inv-del-cancel]')) { closeConfirm(); $('[data-inv-delete]')?.focus(); return; }
    const ok = e.target.closest('[data-inv-del-ok]');
    if (ok && !ok.disabled && s?.editId) {
      const id = s.editId;
      close();
      onDelete(id);
    }
  });

  return { open, close, isOpen, bondsReady };
}
