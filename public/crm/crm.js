/*
 * «Онбординг» — clickable mockup of an Odoo module, built from the client's spec (ТЗ).
 * Isolated from MySkrynia: no shared code, styles or API. All data lives in localStorage
 * under crm-mock:*. Screens mimic Odoo 17/18 backend views: kanban, list, form + chatter,
 * an eLearning-style lesson player with quizzes, and a settings page.
 */
(() => {
  'use strict';

  const KEY = 'crm-mock:odoo-onboarding:v1';
  try { localStorage.removeItem('crm-mock:onboarding:v1'); } catch { /* the previous mockup's data */ }

  const app = document.getElementById('app');
  const toastHost = document.getElementById('toasts');
  const BOT = 'OdooBot';
  const state = { quiz: null, tab: {}, empFilters: new Set(), mtgFilters: new Set(), q: '', openMenu: null };

  // ---------- utils ----------
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const nowISO = () => new Date().toISOString();
  const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayYMD = () => ymdOf(new Date());
  function ymdShift(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    return ymdOf(new Date(y, m - 1, d + days));
  }
  function isoShift(iso, days) {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  const ymdOfISO = (iso) => ymdOf(new Date(iso));
  function fmtYMD(ymd) {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-');
    return `${d}.${m}.${y}`;
  }
  const fmtDT = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${fmtYMD(ymdOf(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function fmtSpan(ms) {
    const hrs = Math.round(Math.abs(ms) / 3600e3);
    if (hrs < 1) return 'менше години';
    if (hrs < 24) return `${hrs} год`;
    return `${Math.round(hrs / 24)} д`;
  }
  function relTime(iso) {
    const diff = Date.now() - Date.parse(iso);
    if (diff < 60e3) return 'щойно';
    if (diff < 3600e3) return `${Math.round(diff / 60e3)} хв тому`;
    if (diff < 86400e3) return `${Math.round(diff / 3600e3)} год тому`;
    return fmtDT(iso);
  }
  const daysBetween = (a, b) => {
    const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 86400e3);
  };
  const initials = (name) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const AVATAR_COLORS = ['#F06050', '#F4A460', '#F7CD1F', '#6CC1ED', '#814968', '#EB7E7F', '#2C8397', '#475577', '#D6145F', '#30C381', '#9365B8'];
  function avatarColor(name) {
    let n = 0;
    for (const ch of name || '') n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[n % AVATAR_COLORS.length];
  }
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  // Stroke icons (FontAwesome isn't allowed by the site CSP, so a tiny inline set instead).
  const PATHS = {
    apps: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="17" y="3" width="4" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/><rect x="17" y="10" width="4" height="5" rx="1"/><rect x="3" y="17" width="5" height="4" rx="1"/><rect x="10" y="17" width="5" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/>',
    kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
    down: '<polyline points="6 9 12 15 18 9"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  };
  function icon(name, cls = '') {
    const s = h('span', { class: `o-icon ${cls}`, 'aria-hidden': 'true' });
    const filled = name === 'star-fill';
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[filled ? 'star' : name]}</svg>`;
    return s;
  }

  // Section content is rich text edited in place; keep only a small, safe subset of HTML.
  const ALLOWED = new Set(['P', 'H3', 'H4', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'DIV', 'SPAN']);
  function sanitize(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html || '';
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (!ALLOWED.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(child.tagName)) { child.remove(); continue; }
          walk(child);
          child.replaceWith(...child.childNodes);
          continue;
        }
        const href = child.tagName === 'A' ? child.getAttribute('href') : null;
        for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
        if (href && /^https?:\/\//i.test(href)) { child.setAttribute('href', href); child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
        walk(child);
      }
    };
    walk(tpl.content);
    return tpl.innerHTML;
  }
  function richContent(html) {
    const div = h('div', { class: 'o-rich' });
    div.innerHTML = sanitize(html);
    // Highlight [placeholders] the HR still has to fill in.
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (/\[[^\]]+\]/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = node.nodeValue.split(/(\[[^\]]+\])/).map((p) => (/^\[[^\]]+\]$/.test(p) ? h('mark', { class: 'o-ph', title: 'Потрібно заповнити' }, p.slice(1, -1)) : p));
      node.replaceWith(...parts);
    }
    return div;
  }

  // ---------- seed (content from the ТЗ; questions are drafts to agree with the client) ----------
  const q = (text, answers, correct) => ({ id: uid(), text, answers: answers.map((a, i) => ({ id: uid(), text: a, correct: i === correct })) });

  function defaultSections() {
    return [
      {
        id: 's1', icon: '🏢', title: 'Інформація про компанію',
        goal: 'Уміти коротко пояснити, чим займається компанія, хто її клієнти та як його робота впливає на спільний результат.',
        content: `<h3>Назва компанії та короткий опис діяльності</h3><p><b>«Демо Рекрутинг»</b> — кадрове агентство, що закриває вакансії для рітейлу, логістики та IT. [Демо-текст — замініть на опис вашої компанії]</p>
<h3>Основні послуги / продукти та клієнти</h3><ul><li>Масовий підбір персоналу для складів і магазинів.</li><li>Підбір фахівців середньої ланки та IT.</li><li>Клієнти: торговельні мережі, логістичні оператори, IT-компанії.</li></ul>
<h3>Місія, цінності та принципи роботи</h3><p>Швидко знаходити людей, які залишаються працювати надовго.</p><ul><li>Чесність з кандидатом і замовником.</li><li>Швидкість без втрати якості.</li><li>Відповідальність за результат.</li></ul>
<h3>Структура компанії та ключові підрозділи</h3><ul><li>Відділ підбору — рекрутери та керівник напряму.</li><li>Account-менеджери — комунікація із замовниками.</li><li>HR / People team — внутрішні процеси та адаптація.</li></ul>`,
        questions: [
          q('Хто основні клієнти компанії?', ['Торговельні мережі, логістичні оператори та IT-компанії', 'Лише державні установи', 'Приватні особи, які шукають роботу'], 0),
          q('Яка місія компанії?', ['Закрити якомога більше вакансій за будь-яку ціну', 'Швидко знаходити людей, які залишаються працювати надовго', 'Мінімізувати витрати замовника'], 1),
          q('Хто відповідає за комунікацію із замовниками?', ['HR / People team', 'Бухгалтерія', 'Account-менеджери'], 2),
        ],
      },
      {
        id: 's2', icon: '👥', title: 'Команда та взаємодія',
        goal: 'Розуміння про склад своєї команди та куди звертатися залежно від питання.',
        content: `<p>Заздалегідь визначте, до кого звертатися з робочих питань.</p>
<table><thead><tr><th>Роль / контакт</th><th>За що відповідає</th><th>Коли звертатися</th></tr></thead><tbody>
<tr><td>Безпосередній керівник</td><td>Пріоритети, цілі, складні кейси</td><td>Питання щодо результатів і пріоритетів</td></tr>
<tr><td>HR / People team</td><td>Адаптація, політики, документи</td><td>Організаційні питання</td></tr>
<tr><td>Hiring manager / замовник</td><td>Вимоги до кандидата, рішення</td><td>Уточнення профілю та зворотний зв’язок</td></tr>
<tr><td>Колега / buddy</td><td>Поточні процеси та поради</td><td>Щоденні практичні запитання</td></tr></tbody></table>`,
        questions: [
          q('До кого звертатися з питаннями щодо пріоритетів і цілей?', ['До безпосереднього керівника', 'До колеги / buddy', 'До hiring manager'], 0),
          q('Хто ухвалює рішення щодо вимог до кандидата?', ['HR / People team', 'Hiring manager / замовник', 'Колега / buddy'], 1),
          q('Куди звертатися з організаційними питаннями (документи, політики)?', ['До замовника', 'До колеги / buddy', 'До HR / People team'], 2),
          q('З ким найкраще розбирати щоденні практичні запитання?', ['З колегою / buddy', 'З hiring manager', 'З HR'], 0),
        ],
      },
      {
        id: 's3', icon: '🎯', title: 'Функціональні обов’язки',
        goal: 'Розуміння про свої функціональні обов’язки.',
        content: `<ul><li>Приймає заявку на підбір і уточнює вимоги до вакансії.</li><li>Формує профіль кандидата та погоджує умови вакансії.</li><li>Планує пошук, обирає джерела та готує оголошення.</li><li>Проводить первинний скринінг і фіксує результати.</li><li>Організовує співбесіди, підтримує контакт із кандидатами.</li><li>Збирає зворотний зв’язок і супроводжує кандидата до виходу.</li><li>Веде базу / ATS та готує звітність.</li><li>Вчасно повідомляє про ризики, затримки й нестачу кандидатів.</li></ul>
<p><b>Кому передає кандидатів на наступний етап:</b> [ім’я / роль]</p>`,
        questions: [
          q('Хто уточнює вимоги до вакансії після отримання заявки?', ['Кандидат', 'Рекрутер', 'Бухгалтерія'], 1),
          q('Кандидатів на вакансію не вистачає. Що робити?', ['Вчасно повідомити керівника про ризик', 'Чекати, поки з’являться', 'Знизити вимоги без погодження'], 0),
          q('Хто веде базу кандидатів і готує звітність?', ['Керівник', 'Замовник', 'Рекрутер'], 2),
        ],
      },
      {
        id: 's4', icon: '🧩', title: 'Процес рекрутингу',
        goal: 'Розуміння про процес рекрутингу в компанії.',
        content: `<p>Єдиний процес допомагає не втрачати кандидатів і бачити статус кожної вакансії. Кожен кандидат має мати актуальний статус, дату останнього контакту та наступний крок у системі обліку.</p>
<ol><li><b>Заявка</b> — уточнити причину відкриття, обов’язкові вимоги, зарплату, графік, локацію та дедлайн.</li><li><b>Профіль кандидата</b> — розділити вимоги на обов’язкові та бажані; погодити критерії відбору.</li><li><b>Пошук</b> — обрати джерела, підготувати оголошення й план пошуку.</li><li><b>Скринінг</b> — перевірити досвід, мотивацію, доступність, очікування та відповідність умовам.</li><li><b>Передавання</b> — надати замовнику короткий структурований профіль кандидата.</li><li><b>Співбесіда</b> — узгодити час, підтвердити участь і нагадати кандидату про зустріч.</li><li><b>Зворотний зв’язок</b> — отримати рішення в погоджений термін і повідомити кандидата про наступні кроки.</li><li><b>Офер і вихід</b> — погодити умови, підтримувати контакт і підтвердити дату виходу.</li><li><b>Закриття вакансії</b> — оновити статуси в CRM, зафіксувати результат і причини відмов / успіху.</li></ol>`,
        questions: [
          q('Що обов’язково має бути в кожного кандидата в системі?', ['Лише резюме', 'Актуальний статус, дата останнього контакту та наступний крок', 'Фото та рекомендації'], 1),
          q('Який етап іде одразу після скринінгу?', ['Передавання профілю замовнику', 'Офер і вихід', 'Закриття вакансії'], 0),
          q('Що потрібно зробити під час закриття вакансії?', ['Видалити всіх кандидатів', 'Нічого, вакансія вже закрита', 'Оновити статуси та зафіксувати причини відмов / успіху'], 2),
          q('Що уточнюють на етапі «Заявка»?', ['Причину відкриття, вимоги, зарплату, графік, локацію та дедлайн', 'Лише назву посади', 'Тільки бюджет на оголошення'], 0),
        ],
      },
      {
        id: 's5', icon: '🛠️', title: 'Інструменти та джерела пошуку',
        goal: 'Розуміння про інструменти та джерела пошуку.',
        content: `<table><thead><tr><th>Інструмент</th><th>Для чого використовуємо</th><th>Доступ / посилання</th></tr></thead><tbody>
<tr><td>ATS / CRM / таблиця</td><td>Статуси кандидатів, база, історія контактів</td><td>[додати посилання]</td></tr>
<tr><td>Work.ua / Robota.ua</td><td>Пошук і публікація вакансій</td><td>[доступ / відповідальний]</td></tr>
<tr><td>LinkedIn / Djinni</td><td>Професійний і IT-пошук</td><td>[доступ / відповідальний]</td></tr>
<tr><td>Facebook / Telegram / Viber</td><td>Профільні групи та локальний пошук</td><td>[правила розміщення]</td></tr>
<tr><td>Корпоративна пошта / календар</td><td>Комунікація та планування співбесід</td><td>[інструкція]</td></tr>
<tr><td>Шаблони / база знань</td><td>Оголошення, скрипти, звіти, політики</td><td>[посилання]</td></tr></tbody></table>`,
        questions: [
          q('Де насамперед шукаємо IT-кандидатів?', ['У Viber-групах', 'На LinkedIn / Djinni', 'На Work.ua'], 1),
          q('Для чого використовується ATS / CRM?', ['Статуси кандидатів, база та історія контактів', 'Бухгалтерський облік', 'Особисте листування'], 0),
          q('Де взяти шаблони оголошень і скрипти?', ['Скопіювати в конкурентів', 'Писати щоразу з нуля', 'У базі знань'], 2),
        ],
      },
      {
        id: 's6', icon: '📊', title: 'KPI та звітність',
        goal: 'Розуміння про ведення звітності та вимоги щодо KPI.',
        content: `<p>Показники мають бути прозорими, реалістичними та погодженими з керівником.</p>
<table><thead><tr><th>Показник</th><th>Що показує</th><th>Ціль / період</th></tr></thead><tbody>
<tr><td>Опрацьовані кандидати</td><td>Обсяг первинної роботи</td><td>[узгодити]</td></tr>
<tr><td>Якісні скринінги</td><td>Кандидати, що відповідають ключовим критеріям</td><td>[узгодити]</td></tr>
<tr><td>Передані замовнику</td><td>Релевантність пошуку</td><td>[узгодити]</td></tr>
<tr><td>Призначені співбесіди</td><td>Результативність комунікації</td><td>[узгодити]</td></tr>
<tr><td>Виходи на роботу / закриття</td><td>Фінальний результат підбору</td><td>[узгодити]</td></tr>
<tr><td>Конверсія етапів</td><td>Де втрачаються кандидати</td><td>[аналізувати]</td></tr></tbody></table>
<p><b>Формат звіту:</b> виконані дії → кількісні результати → складнощі → причини відмов → план наступних кроків.</p>
<p><b>Частота звітності:</b> [щодня / щотижня / інше]</p>`,
        questions: [
          q('Який показник показує, де втрачаються кандидати?', ['Кількість дзвінків', 'Кількість оголошень', 'Конверсія етапів'], 2),
          q('Який правильний порядок звіту?', ['Дії → результати → складнощі → причини відмов → план', 'План → складнощі → дії', 'Лише кількісні результати'], 0),
          q('Хто встановлює цілі за KPI?', ['Рекрутер сам', 'Погоджуються з керівником', 'Замовник'], 1),
        ],
      },
      {
        id: 's7', icon: '💬', title: 'Стандарти комунікації',
        goal: 'Розуміння про стандарти комунікації з кандидатами.',
        content: `<p>Кандидат має розуміти умови вакансії та знати, що відбуватиметься далі.</p>
<ul><li>Чітко презентувати реальні умови вакансії без перебільшень.</li><li>Не приховувати зарплату, графік, локацію та істотні вимоги.</li><li>Погоджувати з кандидатом зручний час для дзвінка чи зустрічі.</li><li>Після кожного етапу повідомляти про наступний крок і терміни.</li><li>Не залишати кандидата без відповіді; давати коректний зворотний зв’язок.</li><li>Фіксувати домовленості та статуси в системі.</li><li>Дотримуватися конфіденційності та професійного тону.</li></ul>
<p><b>Скрипт першого контакту:</b> привітання → хто телефонує → назва вакансії → ключові умови → 2–4 питання → наступний крок.</p>`,
        questions: [
          q('Чи можна приховати від кандидата зарплату чи графік?', ['Так, якщо вакансія складна', 'Ні, істотні умови не приховуються', 'Лише на першому дзвінку'], 1),
          q('Що робити після кожного етапу?', ['Повідомити кандидата про наступний крок і терміни', 'Чекати, поки кандидат напише сам', 'Нічого'], 0),
          q('Який порядок першого контакту?', ['Одразу питання про досвід', 'Умови → привітання → питання', 'Привітання → хто телефонує → вакансія → умови → 2–4 питання → наступний крок'], 2),
          q('Кандидату відмовили. Як діяти?', ['Не відповідати', 'Дати коректний зворотний зв’язок', 'Повідомити через місяць'], 1),
        ],
      },
    ];
  }

  const MEETING_FIELDS = [
    { id: 'selfDone', label: 'Що працівник уже робить самостійно' },
    { id: 'training', label: 'Що потребує додаткового навчання' },
    { id: 'results', label: 'Основні результати за період' },
    { id: 'blockers', label: 'Складнощі / блокери', employee: true },
    { id: 'goals', label: 'Цілі на наступні 30 днів' },
    { id: 'comment', label: 'Коментар керівника' },
  ];
  const KPIS = [
    { id: 'processed', label: 'Опрацьовано кандидатів', color: '#714B67' },
    { id: 'interviews', label: 'Призначено співбесід', color: '#017E84' },
    { id: 'hires', label: 'Виходів на роботу', color: '#E99D00' },
  ];

  function seed() {
    const now = new Date();
    const at = (daysAgo, hour, min = 0) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hour, min, 0, 0); return d.toISOString(); };
    const sections = defaultSections();
    const data = {
      version: 1,
      manager: { name: 'Марія Литвин', job: 'Head of Recruitment' },
      settings: { deadlineDays: 1, firstMeetingDays: 7, meetingEveryDays: 14, shuffle: true, revealMistakes: false },
      sections, employees: [], meetings: [], messages: [],
      ui: { role: 'manager', empUser: null, empView: 'kanban' },
    };
    const log = (model, resId, author, body, date, kind = 'log') => data.messages.push({ id: uid(), model, resId, author, body, date, kind });

    const addEmp = (props, attempts, passedDay, passedHour) => {
      const emp = { id: uid(), progress: {}, completedAt: null, ...props };
      log('employee', emp.id, BOT, 'Онбординг створено. Доступ до CRM надано.', emp.accessAt);
      attempts.forEach((n, i) => {
        if (!n) return;
        const passed = n > 0;
        const s = sections[i];
        const when = at(passedDay, passedHour, 10 + i * 6);
        emp.progress[s.id] = { attempts: Math.abs(n), passed, passedAt: passed ? when : null };
        if (passed) log('employee', emp.id, BOT, `Розділ «${s.title}» пройдено ${n === 1 ? 'з першої спроби' : `зі спроби № ${n}`}.`, when);
      });
      data.employees.push(emp);
      return emp;
    };
    const addMeeting = (emp, n, date, st, extra = {}) => {
      const m = { id: uid(), empId: emp.id, n, date, state: st, rating: 0, kpi: {}, fields: {}, doneAt: null, ...extra };
      data.meetings.push(m);
      return m;
    };
    const today = todayYMD();

    // 1. Finished long ago, three meetings held — shows the dynamics.
    const olena = addEmp({ name: 'Олена Коваль', job: 'Рекрутер', buddy: 'Дмитро Савчук', accessAt: at(40, 9) }, [1, 1, 1, 2, 1, 1, 1], 40, 13);
    olena.completedAt = at(40, 15);
    log('employee', olena.id, BOT, 'Усі розділи пройдено — онбординг завершено.', olena.completedAt);
    const oDates = [ymdShift(today, -33), ymdShift(today, -19), ymdShift(today, -5)];
    const oData = [
      { rating: 1, kpi: { processed: 38, interviews: 3, hires: 0 }, fields: {
        selfDone: 'Самостійно публікує вакансії на Work.ua та веде статуси кандидатів у системі.',
        training: 'Структура скринінгового дзвінка, робота із запереченнями.',
        results: 'Опрацьовано 38 кандидатів, призначено 3 співбесіди.',
        blockers: 'Не завжди зрозуміло, кому із замовників передавати профіль.',
        goals: 'Провести 5+ співбесід, закрити першу вакансію.',
        comment: 'Хороший старт, треба пришвидшити скринінг.' } },
      { rating: 2, kpi: { processed: 72, interviews: 6, hires: 1 }, fields: {
        selfDone: 'Проводить скринінг за скриптом, передає профілі замовнику.',
        training: 'Аналіз конверсії етапів.',
        results: '72 кандидати, 6 співбесід, перший вихід на роботу.',
        blockers: 'Довгий зворотний зв’язок від замовника по складу.',
        goals: 'Вийти на 2–3 виходи на місяць.',
        comment: 'Прогрес помітний, перший вихід є.' } },
      { rating: 3, kpi: { processed: 115, interviews: 10, hires: 3 }, fields: {
        selfDone: 'Веде 5 вакансій повністю самостійно, готує щотижневий звіт.',
        training: 'IT-підбір: Djinni, LinkedIn.',
        results: '115 кандидатів, 10 співбесід, 3 виходи.',
        blockers: 'Немає.',
        goals: 'Взяти першу IT-вакансію, конверсія скринінг → співбесіда 10%+.',
        comment: 'Адаптацію фактично завершено, переходимо до звичайних 1:1.' } },
    ];
    oDates.forEach((d, i) => {
      const m = addMeeting(olena, i + 1, d, 'done', { ...oData[i], doneAt: `${d}T12:00:00.000Z` });
      log('meeting', m.id, data.manager.name, 'Зустріч проведено.', m.doneAt);
      log('employee', olena.id, data.manager.name, `Проведено зустріч адаптації № ${i + 1}.`, m.doneAt);
    });
    addMeeting(olena, 4, ymdShift(today, 9), 'planned');
    log('employee', olena.id, data.manager.name, 'Добре освоїла масовий підбір, наступний крок — IT-вакансії.', at(4, 18), 'note');

    // 2. Finished a day late, first meeting coming up.
    const andriy = addEmp({ name: 'Андрій Мельник', job: 'IT-рекрутер', buddy: 'Олена Коваль', accessAt: at(6, 10) }, [1, 2, 1, 3, 1, 2, 1], 4, 11);
    andriy.completedAt = at(4, 12);
    log('employee', andriy.id, BOT, 'Усі розділи пройдено — онбординг завершено (із запізненням відносно дедлайну).', andriy.completedAt);
    const am = addMeeting(andriy, 1, ymdShift(today, 3), 'planned');
    log('employee', andriy.id, BOT, `Заплановано зустріч адаптації на ${fmtYMD(am.date)}.`, andriy.completedAt);

    // 3. Deadline missed, stuck on section 3.
    addEmp({ name: 'Тарас Бондар', job: 'Junior-рекрутер', buddy: 'Ірина Шевчук', accessAt: at(2, 11) }, [1, 1, -2, 0, 0, 0, 0], 2, 15);

    // 4. Just started — the default "employee" persona for the demo.
    const accessIryna = new Date(now.getTime() - 3 * 3600e3).toISOString();
    const iryna = { id: uid(), name: 'Ірина Шевчук', job: 'Рекрутер (масовий підбір)', buddy: 'Дмитро Савчук', accessAt: accessIryna, progress: {}, completedAt: null };
    data.employees.push(iryna);
    log('employee', iryna.id, BOT, 'Онбординг створено. Доступ до CRM надано.', accessIryna);
    [0, 1].forEach((i) => {
      const when = new Date(now.getTime() - (2 - i * 0.7) * 3600e3).toISOString();
      iryna.progress[sections[i].id] = { attempts: 1, passed: true, passedAt: when };
      log('employee', iryna.id, BOT, `Розділ «${sections[i].title}» пройдено з першої спроби.`, when);
    });

    data.ui.empUser = iryna.id;
    return data;
  }

  // ---------- storage ----------
  let storageOk = true;
  const valid = (d) => d && Array.isArray(d.sections) && Array.isArray(d.employees) && Array.isArray(d.meetings) && Array.isArray(d.messages) && d.settings && d.ui;
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return valid(d) ? d : null;
    } catch {
      storageOk = false;
      return null;
    }
  }
  let saveTimer;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); storageOk = true; } catch { storageOk = false; }
      const ind = document.getElementById('save-ind');
      if (ind) {
        ind.textContent = storageOk ? 'Збережено' : 'Не вдалося зберегти';
        ind.className = `o-save-ind ${storageOk ? '' : 'is-err'} is-on`;
        clearTimeout(ind._t);
        ind._t = setTimeout(() => ind.classList.remove('is-on'), 1400);
      }
    };
    if (now) write(); else saveTimer = setTimeout(write, 300);
  }
  const commit = () => { save(); render(); };

  let db = load();
  if (!db) { db = seed(); save(true); }

  // ---------- domain ----------
  const byId = (list, id) => list.find((x) => x.id === id);
  const currentEmp = () => byId(db.employees, db.ui.empUser) || db.employees[0];
  const isManager = () => db.ui.role === 'manager';
  const userName = () => (isManager() ? db.manager.name : currentEmp()?.name || '');
  const log = (model, resId, author, body, kind = 'log') => db.messages.push({ id: uid(), model, resId, author, body, date: nowISO(), kind });

  function empMeetings(emp) {
    return db.meetings.filter((m) => m.empId === emp.id).sort((a, b) => a.date.localeCompare(b.date));
  }
  function info(emp) {
    const passed = db.sections.filter((s) => emp.progress[s.id]?.passed).length;
    const total = db.sections.length;
    const started = Object.values(emp.progress).some((p) => p.attempts > 0);
    const deadline = isoShift(emp.accessAt, db.settings.deadlineDays);
    const done = !!emp.completedAt;
    const overdue = !done && Date.now() > Date.parse(deadline);
    const lateDone = done && Date.parse(emp.completedAt) > Date.parse(deadline);
    const meetings = empMeetings(emp);
    const next = meetings.find((m) => m.state === 'planned') || null;
    const state = done ? 'done' : started ? 'learning' : 'new';
    let deadlineBadge;
    if (done) deadlineBadge = lateDone ? { cls: 'muted', text: 'Пройдено із запізненням' } : { cls: 'success', text: 'Пройдено вчасно' };
    else if (overdue) deadlineBadge = { cls: 'danger', text: `Прострочено на ${fmtSpan(Date.now() - Date.parse(deadline))}` };
    else deadlineBadge = { cls: 'warning', text: `Залишилось ${fmtSpan(Date.parse(deadline) - Date.now())}` };
    return { passed, total, pct: total ? Math.round((passed / total) * 100) : 0, deadline, done, overdue, lateDone, meetings, next, state, deadlineBadge };
  }
  const STATES = [{ key: 'new', label: 'Новий' }, { key: 'learning', label: 'Навчання' }, { key: 'done', label: 'Онбординг пройдено' }];

  function activityStatus(dueYMD) {
    const d = daysBetween(todayYMD(), dueYMD);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    return 'planned';
  }
  function activities(emp) {
    const i = info(emp);
    const list = [];
    if (!i.done) list.push({ title: 'Пройти всі розділи онбордингу', user: emp.name, due: ymdOfISO(i.deadline) });
    for (const m of i.meetings) if (m.state === 'planned') list.push({ title: `Зустріч адаптації № ${m.n}`, user: db.manager.name, due: m.date, href: `#/meetings/${m.id}` });
    return list.map((a) => ({ ...a, status: activityStatus(a.due) }));
  }
  function worstActivity(list) {
    if (list.some((a) => a.status === 'overdue')) return 'overdue';
    if (list.some((a) => a.status === 'today')) return 'today';
    return list.length ? 'planned' : null;
  }

  function createMeeting(emp, date) {
    const m = { id: uid(), empId: emp.id, n: empMeetings(emp).length + 1, date, state: 'planned', rating: 0, kpi: {}, fields: {}, doneAt: null };
    db.meetings.push(m);
    return m;
  }
  function completeOnboarding(emp) {
    emp.completedAt = nowISO();
    log('employee', emp.id, BOT, 'Усі розділи пройдено — онбординг завершено.');
    if (!empMeetings(emp).some((m) => m.state === 'planned')) {
      const m = createMeeting(emp, ymdShift(todayYMD(), db.settings.firstMeetingDays));
      log('employee', emp.id, BOT, `Заплановано першу зустріч адаптації на ${fmtYMD(m.date)} (керівник: ${db.manager.name}).`);
      return m;
    }
    return null;
  }
  function markMeetingDone(m) {
    const emp = byId(db.employees, m.empId);
    m.state = 'done';
    m.doneAt = nowISO();
    log('meeting', m.id, userName(), 'Зустріч проведено.');
    log('employee', emp.id, userName(), `Проведено зустріч адаптації № ${m.n}.`);
    let next = null;
    if (!empMeetings(emp).some((x) => x.state === 'planned')) {
      const base = m.date > todayYMD() ? m.date : todayYMD();
      next = createMeeting(emp, ymdShift(base, db.settings.meetingEveryDays));
      log('meeting', next.id, BOT, `Зустріч створено автоматично: наступна після № ${m.n}.`);
      log('employee', emp.id, BOT, `Заплановано зустріч адаптації № ${next.n} на ${fmtYMD(next.date)}.`);
    }
    save();
    toast('Зустріч проведено', next ? `Наступну зустріч заплановано на ${fmtYMD(next.date)}.` : 'Наступна зустріч уже запланована.', 'success');
    render();
  }

  // ---------- small components ----------
  function avatar(name, size = 'md') {
    return h('span', { class: `o-avatar o-avatar-${size}`, style: `background:${avatarColor(name)}`, title: name, 'aria-hidden': 'true' }, initials(name));
  }
  const badge = (text, cls = 'muted') => h('span', { class: `o-badge o-badge-${cls}` }, text);
  function progressBar(pct, label) {
    return h('div', { class: 'o-progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': label || 'Прогрес' },
      h('div', { class: 'o-progress-bar', style: `width:${pct}%` }));
  }
  function stars(value, onSet) {
    return h('span', { class: `o-priority${onSet ? ' is-edit' : ''}`, role: onSet ? 'radiogroup' : 'img', 'aria-label': `Оцінка ${value} з 3` },
      [1, 2, 3].map((n) => {
        const on = n <= value;
        const star = icon(on ? 'star-fill' : 'star', on ? 'is-on' : '');
        if (!onSet) return star;
        return h('button', { type: 'button', class: 'o-star-btn', title: `${n} з 3`, 'aria-label': `${n} з 3`, onclick: (e) => { e.stopPropagation(); onSet(value === n ? 0 : n); } }, star);
      }));
  }
  function statusbar(states, current) {
    const idx = states.findIndex((s) => s.key === current);
    return h('div', { class: 'o-statusbar', 'aria-label': 'Етап' },
      states.map((s, i) => h('span', { class: `o-arrow${i === idx ? ' is-current' : ''}${i < idx ? ' is-past' : ''}`, 'aria-current': i === idx ? 'step' : null }, s.label)));
  }
  function activityIcon(status) {
    if (!status) return h('span', { class: 'o-activity-icon is-none', title: 'Немає запланованих дій' }, icon('clock'));
    const labels = { overdue: 'Є прострочені дії', today: 'Дії на сьогодні', planned: 'Заплановані дії' };
    return h('span', { class: `o-activity-icon is-${status}`, title: labels[status] }, icon('clock'));
  }
  function toast(title, body, kind = 'info') {
    const t = h('div', { class: `o-toast is-${kind}`, role: 'status' }, h('strong', null, title), body && h('div', null, body),
      h('button', { type: 'button', class: 'o-toast-x', 'aria-label': 'Закрити', onclick: () => t.remove() }, icon('x')));
    toastHost.append(t);
    setTimeout(() => t.classList.add('is-out'), 4200);
    setTimeout(() => t.remove(), 4700);
  }
  function autosize(t) {
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 2}px`;
  }
  function dropdown(key, toggle, items, cls = '') {
    const open = state.openMenu === key;
    return h('div', { class: `o-dropdown ${cls}${open ? ' is-open' : ''}` },
      h('button', { type: 'button', class: 'o-dropdown-toggle', 'aria-expanded': String(open), onclick: (e) => { e.stopPropagation(); state.openMenu = open ? null : key; render(); } }, toggle),
      open && h('div', { class: 'o-dropdown-menu', role: 'menu' }, items));
  }
  const menuItem = (label, onclick, cls = '') => h('button', { type: 'button', role: 'menuitem', class: `o-dropdown-item ${cls}`, onclick: () => { state.openMenu = null; onclick(); } }, label);

  function modal({ title, body, footer, size = '' }) {
    const close = () => { dlg.close(); };
    const dlg = h('dialog', { class: `o-modal ${size}`, 'aria-label': title },
      h('header', { class: 'o-modal-header' }, h('h4', null, title), h('button', { type: 'button', class: 'o-btn-icon', 'aria-label': 'Закрити', onclick: close }, icon('x'))),
      h('div', { class: 'o-modal-body' }, body),
      footer && h('footer', { class: 'o-modal-footer' }, footer(close)));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  // ---------- chatter ----------
  function chatter(model, resId, acts = []) {
    const msgs = db.messages.filter((m) => m.model === model && m.resId === resId).sort((a, b) => b.date.localeCompare(a.date));
    const key = `${model}:${resId}`;
    const open = state.composer === key;
    let textarea;
    const post = () => {
      const body = textarea.value.trim();
      if (!body) return;
      log(model, resId, userName(), body, 'note');
      state.composer = null;
      commit();
    };
    return h('aside', { class: 'o-chatter', 'aria-label': 'Чаттер' },
      h('div', { class: 'o-chatter-top' },
        h('button', { type: 'button', class: `o-btn ${open ? 'o-btn-primary' : 'o-btn-secondary'} o-btn-sm`, onclick: () => { state.composer = open ? null : key; render(); } }, 'Записати нотатку'),
        h('span', { class: 'o-chatter-count' }, icon('chat'), ` ${msgs.length}`)),
      open && h('div', { class: 'o-composer' },
        avatar(userName(), 'sm'),
        h('div', { class: 'o-composer-main' },
          (textarea = h('textarea', { class: 'o-input', rows: '3', placeholder: 'Внутрішня нотатка…', 'data-keep': 'composer', onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); } })),
          h('div', null, h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onclick: post }, 'Записати')))),
      acts.length > 0 && h('div', { class: 'o-chatter-acts' },
        h('div', { class: 'o-chatter-sep' }, h('span', null, 'Заплановані дії')),
        acts.map((a) => h('div', { class: 'o-act' },
          avatar(a.user, 'sm'),
          h('div', null,
            h('div', null, h('span', { class: `o-act-due is-${a.status}` }, a.status === 'overdue' ? `Прострочено: ${fmtYMD(a.due)}` : a.status === 'today' ? 'Сьогодні' : fmtYMD(a.due)),
              ' ', a.href ? h('a', { href: a.href, class: 'o-link' }, a.title) : h('b', null, a.title)),
            h('div', { class: 'o-muted o-small' }, `для ${a.user}`))))),
      h('div', { class: 'o-chatter-sep' }, h('span', null, 'Історія')),
      msgs.map((m) => h('div', { class: `o-msg${m.kind === 'note' ? ' is-note' : ''}` },
        m.author === BOT ? h('span', { class: 'o-avatar o-avatar-sm o-bot', 'aria-hidden': 'true' }, '🤖') : avatar(m.author, 'sm'),
        h('div', { class: 'o-msg-main' },
          h('div', { class: 'o-msg-head' }, h('b', null, m.author), h('span', { class: 'o-muted o-small' }, relTime(m.date)), m.kind === 'note' && badge('нотатка', 'muted')),
          h('div', { class: 'o-msg-body' }, m.body)))),
      !msgs.length && h('p', { class: 'o-muted o-small' }, 'Поки що немає записів.'));
  }

  // ---------- search bar ----------
  function searchBar({ facets = [], filters = [], placeholder = 'Пошук…' }) {
    const open = state.openMenu === 'filters';
    return h('div', { class: 'o-search' },
      h('div', { class: 'o-search-input' },
        icon('search', 'o-search-icon'),
        facets.map((f) => h('span', { class: 'o-facet' }, h('span', { class: 'o-facet-cat' }, f.cat), h('span', null, f.label),
          h('button', { type: 'button', class: 'o-facet-x', 'aria-label': `Прибрати ${f.label}`, onclick: f.remove }, icon('x')))),
        h('input', { type: 'search', class: 'o-search-field', placeholder: facets.length ? '' : placeholder, value: state.q, 'data-keep': 'search', 'aria-label': 'Пошук',
          oninput: (e) => { state.q = e.target.value; render(); },
          onkeydown: (e) => { if (e.key === 'Backspace' && !e.target.value && facets.length) facets[facets.length - 1].remove(); } }),
        filters.length > 0 && h('button', { type: 'button', class: 'o-search-toggle', 'aria-label': 'Фільтри', 'aria-expanded': String(open), onclick: (e) => { e.stopPropagation(); state.openMenu = open ? null : 'filters'; render(); } }, icon('down'))),
      open && h('div', { class: 'o-search-panel', onclick: (e) => e.stopPropagation() },
        h('div', { class: 'o-search-panel-title' }, icon('alert', 'o-filter-ico'), ' Фільтри'),
        filters.map((f) => h('button', { type: 'button', class: `o-dropdown-item${f.active ? ' is-checked' : ''}`, onclick: f.toggle }, f.active && icon('check'), f.label))));
  }

  // ---------- views: manager ----------
  const EMP_FILTERS = [
    { key: 'overdue', label: 'Прострочений дедлайн', test: (i) => i.overdue },
    { key: 'learning', label: 'Проходять навчання', test: (i) => !i.done },
    { key: 'done', label: 'Онбординг пройдено', test: (i) => i.done },
  ];

  function employeesView() {
    const term = state.q.trim().toLowerCase();
    const rows = db.employees.map((e) => ({ e, i: info(e) }))
      .filter(({ e, i }) => (!term || `${e.name} ${e.job}`.toLowerCase().includes(term))
        && EMP_FILTERS.filter((f) => state.empFilters.has(f.key)).every((f) => f.test(i)));
    const facets = EMP_FILTERS.filter((f) => state.empFilters.has(f.key)).map((f) => ({ cat: 'Фільтр', label: f.label, remove: () => { state.empFilters.delete(f.key); render(); } }));
    const filters = EMP_FILTERS.map((f) => ({ label: f.label, active: state.empFilters.has(f.key), toggle: () => { if (state.empFilters.has(f.key)) state.empFilters.delete(f.key); else state.empFilters.add(f.key); render(); } }));
    const viewSwitch = h('div', { class: 'o-switch', role: 'group', 'aria-label': 'Вигляд' },
      [['kanban', 'Канбан'], ['list', 'Список']].map(([v, label]) => h('button', { type: 'button', class: db.ui.empView === v ? 'is-active' : '', title: label, 'aria-label': label, 'aria-pressed': String(db.ui.empView === v), onclick: () => { db.ui.empView = v; commit(); } }, icon(v))));

    let body;
    if (db.ui.empView === 'list') {
      body = h('div', { class: 'o-list-wrap' }, h('table', { class: 'o-list' },
        h('thead', null, h('tr', null, h('th', null, 'Працівник'), h('th', null, 'Посада'), h('th', null, 'Доступ до CRM'), h('th', null, 'Дедлайн'), h('th', null, 'Розділи'), h('th', null, 'Наступна зустріч'), h('th', null, 'Етап'))),
        h('tbody', null, rows.map(({ e, i }) => h('tr', { tabindex: '0', onclick: () => { location.hash = `#/employees/${e.id}`; }, onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `#/employees/${e.id}`; } },
          h('td', null, h('span', { class: 'o-cell-user' }, avatar(e.name, 'xs'), e.name)),
          h('td', null, e.job),
          h('td', null, fmtDT(e.accessAt)),
          h('td', null, badge(i.deadlineBadge.text, i.deadlineBadge.cls)),
          h('td', { class: 'o-cell-progress' }, progressBar(i.pct), h('span', { class: 'o-small' }, `${i.passed} / ${i.total}`)),
          h('td', null, i.next ? fmtYMD(i.next.date) : '—'),
          h('td', null, badge(STATES.find((s) => s.key === i.state).label, i.state === 'done' ? 'success' : i.state === 'learning' ? 'info' : 'muted')))),
          !rows.length && h('tr', null, h('td', { colspan: '7', class: 'o-empty-cell' }, 'Нічого не знайдено')))));
    } else {
      body = h('div', { class: 'o-kanban' }, STATES.map((st) => {
        const col = rows.filter(({ i }) => i.state === st.key);
        const acts = col.map(({ e }) => worstActivity(activities(e)));
        const seg = (k) => (col.length ? (acts.filter((a) => a === k).length / col.length) * 100 : 0);
        return h('section', { class: 'o-kanban-group', 'aria-label': st.label },
          h('header', { class: 'o-kanban-header' }, h('span', { class: 'o-kanban-title' }, st.label), h('span', { class: 'o-kanban-count' }, col.length)),
          h('div', { class: 'o-kanban-bar', title: 'Стан запланованих дій' },
            h('span', { class: 'is-planned', style: `width:${seg('planned')}%` }), h('span', { class: 'is-today', style: `width:${seg('today')}%` }), h('span', { class: 'is-overdue', style: `width:${seg('overdue')}%` })),
          col.map(({ e, i }) => h('a', { class: 'o-kanban-record', href: `#/employees/${e.id}` },
            h('div', { class: 'o-kr-top' }, h('div', { class: 'o-kr-main' }, h('b', null, e.name), h('span', { class: 'o-muted' }, e.job)), avatar(e.name)),
            h('div', { class: 'o-kr-progress' }, h('span', { class: 'o-small o-muted' }, `Розділи ${i.passed} / ${i.total}`), progressBar(i.pct)),
            h('div', { class: 'o-kr-bottom' },
              badge(i.deadlineBadge.text, i.deadlineBadge.cls),
              h('span', { class: 'o-kr-right' },
                i.next && h('span', { class: 'o-small o-muted', title: 'Наступна зустріч' }, icon('calendar'), ` ${fmtYMD(i.next.date).slice(0, 5)}`),
                activityIcon(worstActivity(activities(e))))))),
          !col.length && h('div', { class: 'o-kanban-empty' }, '—'));
      }));
    }
    return {
      crumbs: [{ label: 'Працівники' }],
      buttons: [h('button', { type: 'button', class: 'o-btn o-btn-primary', onclick: newEmployeeDialog }, 'Новий')],
      search: searchBar({ facets, filters, placeholder: 'Пошук працівника…' }),
      right: [h('span', { class: 'o-pager-text' }, `1-${rows.length} / ${rows.length}`), viewSwitch],
      body: h('div', { class: 'o-view-bg' }, body),
    };
  }

  function newEmployeeDialog() {
    const f = { name: h('input', { class: 'o-input', required: true, 'aria-label': 'Ім’я' }), job: h('input', { class: 'o-input', value: 'Рекрутер' }), buddy: h('input', { class: 'o-input' }), access: h('input', { class: 'o-input', type: 'datetime-local' }) };
    const d = new Date();
    f.access.value = `${ymdOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    modal({
      title: 'Новий онбординг',
      body: h('div', { class: 'o-group o-group-1' },
        h('label', { class: 'o-label' }, 'Працівник'), f.name,
        h('label', { class: 'o-label' }, 'Посада'), f.job,
        h('label', { class: 'o-label' }, 'Наставник (buddy)'), f.buddy,
        h('label', { class: 'o-label' }, 'Доступ до CRM надано'), f.access,
        h('p', { class: 'o-muted o-small o-span-2' }, 'У робочій версії онбординг створюється автоматично під час створення співробітника в Odoo.')),
      footer: (close) => [
        h('button', { type: 'button', class: 'o-btn o-btn-primary', onclick: () => {
          const name = f.name.value.trim();
          if (!name) { f.name.focus(); f.name.classList.add('is-invalid'); return; }
          const emp = { id: uid(), name, job: f.job.value.trim(), buddy: f.buddy.value.trim(), accessAt: new Date(f.access.value || Date.now()).toISOString(), progress: {}, completedAt: null };
          db.employees.push(emp);
          log('employee', emp.id, BOT, 'Онбординг створено. Доступ до CRM надано.');
          close();
          save(true);
          location.hash = `#/employees/${emp.id}`;
        } }, 'Створити'),
        h('button', { type: 'button', class: 'o-btn o-btn-secondary', onclick: close }, 'Скасувати'),
      ],
    });
    f.name.focus();
  }

  function pager(list, current, hrefOf) {
    const idx = list.indexOf(current);
    const go = (d) => { const next = list[(idx + d + list.length) % list.length]; location.hash = hrefOf(next); };
    return h('span', { class: 'o-pager' },
      h('span', { class: 'o-pager-text' }, `${idx + 1} / ${list.length}`),
      h('button', { type: 'button', class: 'o-btn-icon', 'aria-label': 'Попередній запис', onclick: () => go(-1) }, icon('left')),
      h('button', { type: 'button', class: 'o-btn-icon', 'aria-label': 'Наступний запис', onclick: () => go(1) }, icon('right')));
  }

  function inlineInput(obj, key, { placeholder = '', cls = '', type = 'text', readonly = false, onchange } = {}) {
    if (readonly) return h('span', { class: `o-field-ro ${cls}` }, obj[key] || '—');
    return h('input', { class: `o-input o-input-inline ${cls}`, type, value: obj[key] || '', placeholder,
      oninput: (e) => { obj[key] = e.target.value; save(); },
      onchange: onchange ? (e) => onchange(e.target.value) : null });
  }

  function employeeForm(emp) {
    const i = info(emp);
    const tab = state.tab.employee || 'sections';
    const meetingsDone = i.meetings.filter((m) => m.state === 'done');
    const schedule = () => {
      const m = createMeeting(emp, ymdShift(todayYMD(), 1));
      log('employee', emp.id, userName(), `Заплановано зустріч адаптації № ${m.n} на ${fmtYMD(m.date)}.`);
      save(true);
      location.hash = `#/meetings/${m.id}`;
    };
    const remove = () => {
      if (!window.confirm(`Видалити онбординг «${emp.name}» разом із зустрічами?`)) return;
      const ids = new Set(db.meetings.filter((m) => m.empId === emp.id).map((m) => m.id));
      db.meetings = db.meetings.filter((m) => m.empId !== emp.id);
      db.messages = db.messages.filter((m) => !(m.model === 'employee' && m.resId === emp.id) && !(m.model === 'meeting' && ids.has(m.resId)));
      db.employees = db.employees.filter((e) => e !== emp);
      save(true);
      location.hash = '#/employees';
    };

    const sheet = h('div', { class: 'o-form-sheet' },
      h('div', { class: 'o-button-box' },
        h('a', { class: 'o-stat-btn', href: `#/meetings?emp=${emp.id}` }, icon('calendar'), h('span', null, h('b', null, i.meetings.length), h('span', null, 'Зустрічі'))),
        h('button', { type: 'button', class: 'o-stat-btn', onclick: () => { state.tab.employee = 'sections'; render(); } }, icon('book'), h('span', null, h('b', null, `${i.passed} / ${i.total}`), h('span', null, 'Розділи')))),
      h('div', { class: 'o-title-row' },
        h('div', { class: 'o-title' }, h('span', { class: 'o-field-label-sm' }, 'Працівник'), inlineInput(emp, 'name', { cls: 'o-h1', onchange: () => render() })),
        avatar(emp.name, 'xl')),
      h('div', { class: 'o-group' },
        h('div', { class: 'o-inner-group' },
          h('label', { class: 'o-label' }, 'Посада'), inlineInput(emp, 'job'),
          h('label', { class: 'o-label' }, 'Керівник'), h('span', { class: 'o-field-ro' }, h('span', { class: 'o-cell-user' }, avatar(db.manager.name, 'xs'), db.manager.name)),
          h('label', { class: 'o-label' }, 'Наставник (buddy)'), inlineInput(emp, 'buddy', { placeholder: 'Не вказано' })),
        h('div', { class: 'o-inner-group' },
          h('label', { class: 'o-label' }, 'Доступ до CRM'), h('span', { class: 'o-field-ro' }, fmtDT(emp.accessAt)),
          h('label', { class: 'o-label' }, 'Дедлайн'), h('span', { class: 'o-field-ro' }, fmtDT(i.deadline), ' ', badge(i.deadlineBadge.text, i.deadlineBadge.cls)),
          h('label', { class: 'o-label' }, 'Пройдено'), h('span', { class: 'o-field-ro' }, i.done ? fmtDT(emp.completedAt) : '—'),
          h('label', { class: 'o-label' }, 'Наступна зустріч'), h('span', { class: 'o-field-ro' }, i.next ? h('a', { class: 'o-link', href: `#/meetings/${i.next.id}` }, `${fmtYMD(i.next.date)} · № ${i.next.n}`) : '—'))),
      h('div', { class: 'o-notebook' },
        h('div', { class: 'o-tabs', role: 'tablist' },
          [['sections', 'Розділи та тести'], ['meetings', `Зустрічі (${i.meetings.length})`], ['dynamics', 'Динаміка']].map(([k, label]) => h('button', {
            type: 'button', role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'is-active' : '', onclick: () => { state.tab.employee = k; render(); },
          }, label))),
        h('div', { class: 'o-tab-pane' },
          tab === 'sections' && h('div', { class: 'o-table-scroll' }, h('table', { class: 'o-list o-list-inner' },
            h('thead', null, h('tr', null, h('th', { class: 'o-col-num' }, '№'), h('th', null, 'Розділ'), h('th', null, 'Тест'), h('th', { class: 'o-num' }, 'Спроб'), h('th', null, 'Пройдено'))),
            h('tbody', null, db.sections.map((s, idx) => {
              const p = emp.progress[s.id] || { attempts: 0 };
              const st = p.passed ? badge('Пройдено', 'success') : p.attempts ? badge('Не пройдено', 'danger') : badge('Не розпочато', 'muted');
              return h('tr', null, h('td', { class: 'o-col-num' }, pad(idx + 1)), h('td', null, `${s.icon} ${s.title}`), h('td', null, st),
                h('td', { class: `o-num${p.attempts > 2 ? ' o-text-warn' : ''}` }, p.attempts || '—'), h('td', null, p.passedAt ? fmtDT(p.passedAt) : '—'));
            })))),
          tab === 'meetings' && h('div', null,
            h('div', { class: 'o-table-scroll' }, h('table', { class: 'o-list o-list-inner' },
              h('thead', null, h('tr', null, h('th', { class: 'o-col-num' }, '№'), h('th', null, 'Дата'), h('th', null, 'Стан'), h('th', null, 'Оцінка'), KPIS.map((k) => h('th', { class: 'o-num' }, k.label)))),
              h('tbody', null, i.meetings.map((m) => h('tr', { tabindex: '0', onclick: () => { location.hash = `#/meetings/${m.id}`; }, onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `#/meetings/${m.id}`; } },
                h('td', { class: 'o-col-num' }, m.n), h('td', null, fmtYMD(m.date)),
                h('td', null, m.state === 'done' ? badge('Проведено', 'success') : badge('Заплановано', 'info')),
                h('td', null, stars(m.rating)),
                KPIS.map((k) => h('td', { class: 'o-num' }, m.state === 'done' ? (m.kpi[k.id] ?? '—') : '—')))),
                !i.meetings.length && h('tr', null, h('td', { colspan: String(4 + KPIS.length), class: 'o-empty-cell' }, i.done ? 'Зустрічей ще немає' : 'Перша зустріч з’явиться після проходження всіх розділів'))))),
            !i.next && h('button', { type: 'button', class: 'o-btn o-btn-link', onclick: schedule }, icon('plus'), ' Запланувати зустріч')),
          tab === 'dynamics' && dynamics(meetingsDone))));

    return {
      crumbs: [{ label: 'Працівники', href: '#/employees' }, { label: emp.name }],
      buttons: [dropdown('emp-actions', [icon('gear'), ' Дія'], [menuItem([icon('trash'), ' Видалити'], remove, 'is-danger')], 'o-actions')],
      right: [pager(db.employees, emp, (e) => `#/employees/${e.id}`)],
      body: h('div', { class: 'o-form-view' },
        h('div', { class: 'o-form-main' },
          h('div', { class: 'o-form-statusbar' },
            h('div', { class: 'o-form-buttons' }, !i.next && h('button', { type: 'button', class: 'o-btn o-btn-primary', onclick: schedule }, 'Запланувати зустріч')),
            statusbar(STATES, i.state)),
          sheet),
        chatter('employee', emp.id, activities(emp))),
    };
  }

  function dynamics(done) {
    if (!done.length) return h('p', { class: 'o-muted o-empty-cell' }, 'Динаміка з’явиться після першої проведеної зустрічі.');
    const card = (k) => {
      const vals = done.map((m) => Number(m.kpi[k.id]) || 0);
      const last = vals[vals.length - 1];
      const delta = vals.length > 1 ? last - vals[vals.length - 2] : null;
      const max = Math.max(1, ...vals);
      return h('div', { class: 'o-dyn-card' },
        h('div', { class: 'o-muted o-small' }, k.label),
        h('div', { class: 'o-dyn-value' }, last, delta != null && h('span', { class: `o-dyn-delta ${delta >= 0 ? 'is-up' : 'is-down'}` }, `${delta >= 0 ? '▲ +' : '▼ '}${delta}`)),
        h('div', { class: 'o-dyn-bars', role: 'img', 'aria-label': `${k.label}: ${vals.join(', ')}` },
          done.map((m, idx) => h('div', { class: 'o-dyn-col', title: `№ ${m.n} · ${fmtYMD(m.date)}: ${vals[idx]}` },
            h('span', { class: 'o-dyn-num' }, vals[idx]),
            h('div', { class: 'o-dyn-bar', style: `height:${Math.max(4, (vals[idx] / max) * 64)}px;background:${k.color}` }),
            h('span', { class: 'o-dyn-x' }, `№ ${m.n}`)))));
    };
    return h('div', null,
      h('div', { class: 'o-dyn-grid' }, KPIS.map(card)),
      h('div', { class: 'o-dyn-rating' }, h('span', { class: 'o-muted o-small' }, 'Оцінка періоду: '),
        done.map((m) => h('span', { class: 'o-dyn-rate' }, h('span', { class: 'o-small' }, `№ ${m.n}`), stars(m.rating)))),
      h('p', { class: 'o-muted o-small' }, 'У робочій версії показники можна підтягувати автоматично з модуля «Рекрутинг».'));
  }

  function meetingsView(query) {
    const emp = query.emp ? byId(db.employees, query.emp) : null;
    const term = state.q.trim().toLowerCase();
    const MF = [{ key: 'planned', label: 'Заплановані' }, { key: 'done', label: 'Проведені' }];
    const activeStates = MF.filter((f) => state.mtgFilters.has(f.key)).map((f) => f.key);
    const rows = db.meetings
      .map((m) => ({ m, e: byId(db.employees, m.empId) }))
      .filter(({ m, e }) => e && (!emp || e === emp) && (!activeStates.length || activeStates.includes(m.state)) && (!term || e.name.toLowerCase().includes(term)))
      .sort((a, b) => b.m.date.localeCompare(a.m.date));
    const facets = [
      ...(emp ? [{ cat: 'Працівник', label: emp.name, remove: () => { location.hash = '#/meetings'; } }] : []),
      ...MF.filter((f) => state.mtgFilters.has(f.key)).map((f) => ({ cat: 'Фільтр', label: f.label, remove: () => { state.mtgFilters.delete(f.key); render(); } })),
    ];
    return {
      crumbs: emp ? [{ label: emp.name, href: `#/employees/${emp.id}` }, { label: 'Зустрічі' }] : [{ label: 'Зустрічі адаптації' }],
      buttons: [],
      search: searchBar({ facets, filters: MF.map((f) => ({ label: f.label, active: state.mtgFilters.has(f.key), toggle: () => { if (state.mtgFilters.has(f.key)) state.mtgFilters.delete(f.key); else state.mtgFilters.add(f.key); render(); } })), placeholder: 'Пошук за працівником…' }),
      right: [h('span', { class: 'o-pager-text' }, `1-${rows.length} / ${rows.length}`)],
      body: h('div', { class: 'o-view-bg' }, meetingsTable(rows, true)),
    };
  }

  function meetingsTable(rows, showEmp) {
    return h('div', { class: 'o-list-wrap' }, h('table', { class: 'o-list' },
      h('thead', null, h('tr', null, h('th', null, 'Дата'), showEmp && h('th', null, 'Працівник'), h('th', { class: 'o-col-num' }, '№'), h('th', null, 'Керівник'), h('th', null, 'Стан'), h('th', null, 'Оцінка'))),
      h('tbody', null, rows.map(({ m, e }) => {
        const late = m.state === 'planned' && m.date < todayYMD();
        return h('tr', { tabindex: '0', onclick: () => { location.hash = `#/meetings/${m.id}`; }, onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `#/meetings/${m.id}`; } },
          h('td', { class: late ? 'o-text-danger' : '' }, fmtYMD(m.date)),
          showEmp && h('td', null, h('span', { class: 'o-cell-user' }, avatar(e.name, 'xs'), e.name)),
          h('td', { class: 'o-col-num' }, m.n),
          h('td', null, db.manager.name),
          h('td', null, m.state === 'done' ? badge('Проведено', 'success') : late ? badge('Прострочено', 'danger') : badge('Заплановано', 'info')),
          h('td', null, stars(m.rating)));
      }),
      !rows.length && h('tr', null, h('td', { colspan: '6', class: 'o-empty-cell' }, 'Зустрічей немає')))));
  }

  function meetingForm(m) {
    const emp = byId(db.employees, m.empId);
    const mgr = isManager();
    const planned = m.state === 'planned';
    const prev = empMeetings(emp).filter((x) => x.state === 'done' && x.n < m.n).pop();
    const fieldRO = (text) => h('div', { class: 'o-field-ro o-text-block' }, text || h('span', { class: 'o-muted' }, '—'));

    const sheet = h('div', { class: 'o-form-sheet' },
      h('div', { class: 'o-title-row' },
        h('div', { class: 'o-title' }, h('span', { class: 'o-field-label-sm' }, 'Зустріч адаптації'), h('h1', { class: 'o-h1' }, `№ ${m.n} · ${emp.name}`))),
      h('div', { class: 'o-group' },
        h('div', { class: 'o-inner-group' },
          h('label', { class: 'o-label' }, 'Працівник'), h('span', { class: 'o-field-ro' }, mgr ? h('a', { class: 'o-link', href: `#/employees/${emp.id}` }, emp.name) : emp.name),
          h('label', { class: 'o-label' }, 'Керівник'), h('span', { class: 'o-field-ro' }, db.manager.name),
          h('label', { class: 'o-label', for: 'm-date' }, 'Дата'),
          mgr && planned
            ? h('input', { id: 'm-date', class: 'o-input o-input-inline', type: 'date', value: m.date, onchange: (e) => { if (e.target.value) { m.date = e.target.value; commit(); } } })
            : h('span', { class: 'o-field-ro' }, fmtYMD(m.date))),
        h('div', { class: 'o-inner-group' },
          h('label', { class: 'o-label' }, 'Оцінка періоду'), h('span', { class: 'o-field-ro' }, stars(m.rating, mgr ? (v) => { m.rating = v; commit(); } : null)),
          h('label', { class: 'o-label' }, 'Попередня зустріч'), h('span', { class: 'o-field-ro' }, prev ? h('a', { class: 'o-link', href: `#/meetings/${prev.id}` }, `№ ${prev.n} · ${fmtYMD(prev.date)}`) : '—'))),
      h('div', { class: 'o-separator' }, 'Показники за період'),
      h('div', { class: 'o-kpi-row' }, KPIS.map((k) => h('label', { class: 'o-kpi' },
        h('span', { class: 'o-muted o-small' }, k.label),
        mgr ? h('input', { class: 'o-input o-num-input', type: 'number', min: '0', inputmode: 'numeric', value: m.kpi[k.id] ?? '', placeholder: '0', oninput: (e) => { m.kpi[k.id] = e.target.value === '' ? undefined : Number(e.target.value); save(); } })
          : h('b', { class: 'o-kpi-ro' }, m.kpi[k.id] ?? '—'),
        prev && h('span', { class: 'o-muted o-small' }, `було: ${prev.kpi[k.id] ?? '—'}`)))),
      h('div', { class: 'o-separator' }, 'Підсумки зустрічі'),
      h('div', { class: 'o-fields' }, MEETING_FIELDS.map((f) => {
        const editable = mgr || (f.employee && planned);
        return h('div', { class: 'o-field-block' },
          h('label', { class: 'o-label', for: `mf-${f.id}` }, f.label, f.employee && planned && h('span', { class: 'o-hint' }, mgr ? ' · заповнює працівник до зустрічі' : ' · заповніть до зустрічі')),
          editable
            ? h('textarea', { id: `mf-${f.id}`, class: 'o-input o-textarea', rows: '2', value: m.fields[f.id] || '', placeholder: mgr ? '' : 'Опишіть, що заважає в роботі…', oninput: (e) => { autosize(e.target); m.fields[f.id] = e.target.value; save(); } })
            : fieldRO(m.fields[f.id]));
      })));

    const acts = planned ? [{ title: 'Провести зустріч адаптації', user: db.manager.name, due: m.date, status: activityStatus(m.date) }] : [];
    const crumbs = mgr
      ? [{ label: 'Працівники', href: '#/employees' }, { label: emp.name, href: `#/employees/${emp.id}` }, { label: `Зустріч № ${m.n}` }]
      : [{ label: 'Мої зустрічі', href: '#/my-meetings' }, { label: `Зустріч № ${m.n}` }];
    return {
      crumbs,
      buttons: mgr ? [dropdown('mtg-actions', [icon('gear'), ' Дія'], [menuItem([icon('trash'), ' Видалити'], () => {
        if (!window.confirm('Видалити зустріч?')) return;
        db.meetings = db.meetings.filter((x) => x !== m);
        db.messages = db.messages.filter((x) => !(x.model === 'meeting' && x.resId === m.id));
        save(true);
        location.hash = `#/employees/${emp.id}`;
      }, 'is-danger')], 'o-actions')] : [],
      right: [pager(empMeetings(emp), m, (x) => `#/meetings/${x.id}`)],
      body: h('div', { class: 'o-form-view' },
        h('div', { class: 'o-form-main' },
          h('div', { class: 'o-form-statusbar' },
            h('div', { class: 'o-form-buttons' }, mgr && planned && h('button', { type: 'button', class: 'o-btn o-btn-primary', onclick: () => markMeetingDone(m) }, 'Позначити проведеною')),
            statusbar([{ key: 'planned', label: 'Заплановано' }, { key: 'done', label: 'Проведено' }], m.state)),
          sheet),
        chatter('meeting', m.id, acts)),
    };
  }

  // ---------- views: configuration ----------
  function sectionsView() {
    const add = () => {
      const s = { id: uid(), icon: '📄', title: 'Новий розділ', goal: '', content: '<p></p>', questions: [] };
      db.sections.push(s);
      save(true);
      location.hash = `#/config/sections/${s.id}`;
    };
    return {
      crumbs: [{ label: 'Розділи та тести' }],
      buttons: [h('button', { type: 'button', class: 'o-btn o-btn-primary', onclick: add }, 'Новий')],
      right: [h('span', { class: 'o-pager-text' }, `1-${db.sections.length} / ${db.sections.length}`)],
      body: h('div', { class: 'o-view-bg' }, h('div', { class: 'o-list-wrap' }, h('table', { class: 'o-list' },
        h('thead', null, h('tr', null, h('th', { class: 'o-col-num' }, '№'), h('th', null, 'Розділ'), h('th', null, 'Тест'), h('th', null, 'Після цього розділу працівник має'))),
        h('tbody', null, db.sections.map((s, idx) => {
          const n = s.questions.length;
          const broken = s.questions.some((qq) => !qq.answers.some((a) => a.correct));
          return h('tr', { tabindex: '0', onclick: () => { location.hash = `#/config/sections/${s.id}`; }, onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `#/config/sections/${s.id}`; } },
            h('td', { class: 'o-col-num' }, pad(idx + 1)),
            h('td', null, `${s.icon} ${s.title}`),
            h('td', null, n < 3 || n > 5 || broken ? badge(`${n} пит. · перевірте`, 'warning') : badge(`${n} питання`, 'success')),
            h('td', { class: 'o-cell-clip o-muted' }, s.goal || '—'));
        }))))),
    };
  }

  function editorToolbar(target) {
    const cmd = (c, arg) => (e) => { e.preventDefault(); target().focus(); document.execCommand(c, false, arg); target().dispatchEvent(new Event('input')); };
    const b = (label, title, c, arg) => h('button', { type: 'button', class: 'o-tb-btn', title, 'aria-label': title, onmousedown: cmd(c, arg) }, label);
    return h('div', { class: 'o-toolbar', role: 'toolbar', 'aria-label': 'Форматування' },
      b('Заголовок', 'Заголовок', 'formatBlock', 'h3'), b('Текст', 'Звичайний текст', 'formatBlock', 'p'),
      h('span', { class: 'o-tb-sep' }),
      b(h('b', null, 'B'), 'Жирний', 'bold'), b(h('i', null, 'I'), 'Курсив', 'italic'),
      h('span', { class: 'o-tb-sep' }),
      b('• Список', 'Маркований список', 'insertUnorderedList'), b('1. Список', 'Нумерований список', 'insertOrderedList'));
  }

  function sectionForm(s) {
    const tab = state.tab.section || 'content';
    const idx = db.sections.indexOf(s);
    const n = s.questions.length;
    let editor;
    const remove = () => {
      if (!window.confirm(`Видалити розділ «${s.title}» разом із тестом?`)) return;
      db.sections = db.sections.filter((x) => x !== s);
      save(true);
      location.hash = '#/config/sections';
    };
    const move = (d) => {
      const j = idx + d;
      if (j < 0 || j >= db.sections.length) return;
      [db.sections[idx], db.sections[j]] = [db.sections[j], db.sections[idx]];
      commit();
    };

    const testPane = h('div', null,
      (n < 3 || n > 5) && h('div', { class: 'o-alert o-alert-warning' }, icon('alert'), ` За ТЗ у тесті має бути 3–5 питань, зараз — ${n}.`),
      h('p', { class: 'o-muted o-small' }, 'Розділ зараховується, коли всі відповіді правильні. Позначте правильну відповідь у кожному питанні.'),
      s.questions.map((qq, qi) => {
        const noCorrect = !qq.answers.some((a) => a.correct);
        return h('div', { class: 'o-question' },
          h('div', { class: 'o-question-head' },
            h('span', { class: 'o-question-num' }, qi + 1),
            h('input', { class: 'o-input', value: qq.text, placeholder: 'Текст питання', 'aria-label': `Питання ${qi + 1}`, oninput: (e) => { qq.text = e.target.value; save(); } }),
            h('button', { type: 'button', class: 'o-btn-icon is-danger', title: 'Видалити питання', 'aria-label': 'Видалити питання', onclick: () => { s.questions.splice(qi, 1); commit(); } }, icon('trash'))),
          noCorrect && h('div', { class: 'o-text-danger o-small o-question-warn' }, 'Не позначено правильну відповідь'),
          h('ul', { class: 'o-answers' }, qq.answers.map((a, ai) => h('li', null,
            h('label', { class: 'o-answer-correct', title: 'Правильна відповідь' },
              h('input', { type: 'radio', name: `correct-${qq.id}`, checked: a.correct, onchange: () => { qq.answers.forEach((x) => { x.correct = x === a; }); commit(); } }),
              h('span', { class: 'o-sr' }, 'Правильна')),
            h('input', { class: `o-input${a.correct ? ' is-correct' : ''}`, value: a.text, placeholder: `Варіант ${ai + 1}`, 'aria-label': `Варіант ${ai + 1}`, oninput: (e) => { a.text = e.target.value; save(); } }),
            h('button', { type: 'button', class: 'o-btn-icon', title: 'Видалити варіант', 'aria-label': 'Видалити варіант', onclick: () => { qq.answers.splice(ai, 1); commit(); } }, icon('x'))))),
          h('button', { type: 'button', class: 'o-btn o-btn-link o-btn-sm', onclick: () => { qq.answers.push({ id: uid(), text: '', correct: false }); commit(); } }, icon('plus'), ' Додати варіант'));
      }),
      h('button', { type: 'button', class: 'o-btn o-btn-link', onclick: () => { s.questions.push({ id: uid(), text: '', answers: [{ id: uid(), text: '', correct: true }, { id: uid(), text: '', correct: false }, { id: uid(), text: '', correct: false }] }); commit(); } }, icon('plus'), ' Додати питання'));

    const contentPane = h('div', null,
      editorToolbar(() => editor),
      (editor = h('div', { class: 'o-rich o-editor', 'aria-label': 'Зміст розділу', role: 'textbox', 'aria-multiline': 'true' })),
      h('p', { class: 'o-muted o-small' }, 'Текст у [квадратних дужках] підсвічується працівнику як незаповнене поле — замініть його на дані компанії.'));
    editor.innerHTML = sanitize(s.content);
    editor.contentEditable = 'true';
    editor.addEventListener('input', () => { s.content = sanitize(editor.innerHTML); save(); });

    return {
      crumbs: [{ label: 'Розділи та тести', href: '#/config/sections' }, { label: s.title || 'Без назви' }],
      buttons: [dropdown('sec-actions', [icon('gear'), ' Дія'], [
        menuItem([icon('left'), ' Перемістити вище'], () => move(-1)),
        menuItem([icon('right'), ' Перемістити нижче'], () => move(1)),
        menuItem([icon('trash'), ' Видалити'], remove, 'is-danger'),
      ], 'o-actions')],
      right: [pager(db.sections, s, (x) => `#/config/sections/${x.id}`)],
      body: h('div', { class: 'o-form-view' }, h('div', { class: 'o-form-main is-wide' },
        h('div', { class: 'o-form-sheet' },
          h('div', { class: 'o-title-row' },
            h('div', { class: 'o-title' }, h('span', { class: 'o-field-label-sm' }, `Розділ ${pad(idx + 1)}`),
              h('div', { class: 'o-title-inline' },
                h('input', { class: 'o-input o-input-inline o-icon-input', value: s.icon, maxlength: '4', 'aria-label': 'Іконка', oninput: (e) => { s.icon = e.target.value; save(); } }),
                inlineInput(s, 'title', { cls: 'o-h1', placeholder: 'Назва розділу' })))),
          h('div', { class: 'o-group o-group-1' },
            h('label', { class: 'o-label', for: 's-goal' }, 'Після цього розділу працівник має'),
            h('textarea', { id: 's-goal', class: 'o-input o-textarea', rows: '2', value: s.goal, oninput: (e) => { autosize(e.target); s.goal = e.target.value; save(); } })),
          h('div', { class: 'o-notebook' },
            h('div', { class: 'o-tabs', role: 'tablist' },
              [['content', 'Зміст'], ['test', `Тест (${n})`]].map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'is-active' : '', onclick: () => { state.tab.section = k; render(); } }, label))),
            h('div', { class: 'o-tab-pane' }, tab === 'content' ? contentPane : testPane))))),
    };
  }

  function settingsView() {
    const st = db.settings;
    const num = (key, min, label) => h('input', { class: 'o-input o-num-input', type: 'number', min: String(min), value: st[key], 'aria-label': label,
      onchange: (e) => { const v = Math.max(min, Number(e.target.value) || min); st[key] = v; e.target.value = v; save(); } });
    const box = (title, desc, control, check) => h('div', { class: 'o-setting' },
      h('div', { class: 'o-setting-left' }, check),
      h('div', { class: 'o-setting-right' }, h('div', { class: 'o-setting-title' }, title), h('div', { class: 'o-muted o-small' }, desc), control && h('div', { class: 'o-setting-control' }, control)));
    const toggle = (key, label) => h('input', { type: 'checkbox', checked: !!st[key], 'aria-label': label, onchange: (e) => { st[key] = e.target.checked; save(); } });
    return {
      crumbs: [{ label: 'Параметри' }],
      buttons: [],
      body: h('div', { class: 'o-settings' },
        h('h2', { class: 'o-settings-h' }, 'Онбординг'),
        h('div', { class: 'o-settings-grid' },
          box('Дедлайн проходження', 'Скільки днів після отримання доступу до CRM працівник має пройти всі розділи.', h('span', null, num('deadlineDays', 1, 'Днів на проходження'), ' дн.')),
          box('Перемішувати питання', 'Питання й варіанти відповідей показуються в різному порядку під час кожної спроби.', null, toggle('shuffle', 'Перемішувати питання')),
          box('Показувати помилки', 'Після невдалої спроби підсвічувати питання з неправильною відповіддю. Вимкнено — працівник просто перечитує розділ.', null, toggle('revealMistakes', 'Показувати помилки'))),
        h('h2', { class: 'o-settings-h' }, 'Зустрічі адаптації'),
        h('div', { class: 'o-settings-grid' },
          box('Перша зустріч', 'Через скільки днів після проходження всіх розділів автоматично планується перша зустріч.', h('span', null, num('firstMeetingDays', 1, 'Днів до першої зустрічі'), ' дн.')),
          box('Регулярні зустрічі', 'Після кожної проведеної зустрічі наступна планується автоматично через вказаний інтервал.', h('span', null, 'кожні ', num('meetingEveryDays', 1, 'Інтервал зустрічей'), ' дн.')))),
    };
  }

  // ---------- views: employee ----------
  function myView() {
    const emp = currentEmp();
    const i = info(emp);
    const nextSec = db.sections.find((s) => !emp.progress[s.id]?.passed) || db.sections[0];
    return {
      crumbs: [{ label: 'Моя адаптація' }],
      buttons: [],
      body: h('div', { class: 'o-view-bg' }, h('div', { class: 'o-page' },
        h('section', { class: 'o-course-hero' },
          h('div', { class: 'o-course-hero-main' },
            h('span', { class: 'o-course-kicker' }, 'Онбординг'),
            h('h1', null, 'Гід з адаптації працівника'),
            h('p', null, 'Допомагає швидко зрозуміти компанію, свою роль, робочі інструменти та очікувані результати. У кожному розділі — короткий тест: розділ зараховується, коли всі відповіді правильні.'),
            h('div', { class: 'o-course-meta' },
              h('span', null, icon('book'), ` ${i.total} розділів`),
              h('span', null, icon('clock'), ` Дедлайн: ${fmtDT(i.deadline)}`),
              badge(i.deadlineBadge.text, i.deadlineBadge.cls))),
          h('div', { class: 'o-course-hero-side' },
            h('div', { class: 'o-course-pct' }, `${i.pct}%`),
            progressBar(i.pct, 'Прогрес онбордингу'),
            h('div', { class: 'o-small' }, `Пройдено ${i.passed} з ${i.total}`),
            i.done
              ? h('a', { class: 'o-btn o-btn-light', href: '#/my-meetings' }, icon('calendar'), ' Мої зустрічі')
              : h('a', { class: 'o-btn o-btn-light', href: `#/my/${nextSec.id}` }, icon('play'), i.passed ? ' Продовжити' : ' Почати'))),
        i.done && h('div', { class: 'o-alert o-alert-success' }, icon('trophy'), ` Онбординг пройдено ${fmtDT(emp.completedAt)}. `,
          i.next ? ['Наступна зустріч з керівником — ', h('b', null, fmtYMD(i.next.date)), '.'] : 'Керівник запланує зустріч.'),
        h('section', { class: 'o-card' },
          h('h2', { class: 'o-card-title' }, 'Зміст курсу'),
          h('ol', { class: 'o-lessons' }, db.sections.map((s, idx) => {
            const p = emp.progress[s.id];
            return h('li', null, h('a', { class: 'o-lesson', href: `#/my/${s.id}` },
              h('span', { class: `o-lesson-check${p?.passed ? ' is-done' : ''}` }, p?.passed ? icon('check') : pad(idx + 1)),
              h('span', { class: 'o-lesson-main' }, h('b', null, `${s.icon} ${s.title}`), h('span', { class: 'o-muted o-small' }, s.goal)),
              p?.passed ? badge('Пройдено', 'success') : p?.attempts ? badge('Тест не пройдено', 'danger') : badge(`Тест · ${s.questions.length} пит.`, 'muted')));
          }))))),
    };
  }

  function buildQuiz(s) {
    const qs = db.settings.shuffle ? shuffle(s.questions) : s.questions;
    return { secId: s.id, order: qs.map((x) => x.id), answers: Object.fromEntries(qs.map((x) => [x.id, (db.settings.shuffle ? shuffle(x.answers) : x.answers).map((a) => a.id)])), picked: {}, result: null, wrong: [] };
  }
  function startQuiz(s) {
    state.quiz = buildQuiz(s);
    render();
    app.querySelector('.o-quiz')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitQuiz(emp, s) {
    const qz = state.quiz;
    const wrong = s.questions.filter((x) => !x.answers.find((a) => a.id === qz.picked[x.id])?.correct).map((x) => x.id);
    const p = emp.progress[s.id] || (emp.progress[s.id] = { attempts: 0, passed: false, passedAt: null });
    p.attempts += 1;
    let firstMeeting = null;
    if (!wrong.length) {
      p.passed = true;
      p.passedAt = nowISO();
      log('employee', emp.id, BOT, `Розділ «${s.title}» пройдено ${p.attempts === 1 ? 'з першої спроби' : `зі спроби № ${p.attempts}`}.`);
      qz.result = 'pass';
      if (!emp.completedAt && db.sections.every((x) => emp.progress[x.id]?.passed)) {
        firstMeeting = completeOnboarding(emp);
        qz.finished = true;
      }
    } else if (db.settings.revealMistakes) {
      qz.result = 'fail';
      qz.wrong = wrong;
    } else {
      // Without hints a failed attempt starts over (fresh order, no answers kept), so the test can't be brute-forced.
      state.quiz = { ...buildQuiz(s), result: 'fail' };
    }
    save(true);
    render();
    if (qz.finished) {
      modal({
        title: 'Онбординг пройдено 🎉',
        body: h('div', { class: 'o-finish' },
          icon('trophy', 'o-finish-icon'),
          h('p', null, `Усі ${db.sections.length} розділів пройдено. Керівник ${db.manager.name} отримав сповіщення.`),
          firstMeeting && h('p', null, 'Першу зустріч адаптації заплановано на ', h('b', null, fmtYMD(firstMeeting.date)), '. Перед зустріччю ви зможете описати складнощі, з якими стикнулися.')),
        footer: (close) => [h('a', { class: 'o-btn o-btn-primary', href: '#/my-meetings', onclick: close }, 'Мої зустрічі'), h('button', { type: 'button', class: 'o-btn o-btn-secondary', onclick: close }, 'Закрити')],
      });
    }
  }

  function lessonView(s) {
    const emp = currentEmp();
    const i = info(emp);
    const idx = db.sections.indexOf(s);
    const prev = db.sections[idx - 1];
    const next = db.sections[idx + 1];
    const p = emp.progress[s.id];
    const qz = state.quiz && state.quiz.secId === s.id ? state.quiz : null;

    let quizBlock;
    if (qz && qz.result !== 'pass') {
      const all = qz.order.every((id) => qz.picked[id]);
      quizBlock = h('section', { class: 'o-quiz o-card' },
        h('h2', { class: 'o-card-title' }, 'Тест до розділу'),
        qz.result === 'fail' && h('div', { class: 'o-alert o-alert-danger' }, icon('alert'),
          db.settings.revealMistakes ? ' Є неправильні відповіді — їх підсвічено. Виправте та надішліть ще раз.' : ' Не всі відповіді правильні. Перечитайте розділ і спробуйте ще раз.'),
        qz.order.map((qid, n) => {
          const qq = s.questions.find((x) => x.id === qid);
          if (!qq) return null;
          const isWrong = qz.result === 'fail' && db.settings.revealMistakes && qz.wrong.includes(qid);
          return h('fieldset', { class: `o-quiz-q${isWrong ? ' is-wrong' : ''}` },
            h('legend', null, h('span', { class: 'o-quiz-n' }, `${n + 1}.`), ' ', qq.text),
            qz.answers[qid].map((aid) => {
              const a = qq.answers.find((x) => x.id === aid);
              if (!a) return null;
              return h('label', { class: `o-quiz-a${qz.picked[qid] === aid ? ' is-picked' : ''}` },
                h('input', { type: 'radio', name: `quiz-${qid}`, checked: qz.picked[qid] === aid, onchange: () => { qz.picked[qid] = aid; if (qz.result === 'fail') { qz.result = null; qz.wrong = []; } render(); } }),
                h('span', null, a.text));
            }));
        }),
        h('div', { class: 'o-quiz-foot' },
          h('button', { type: 'button', class: 'o-btn o-btn-primary', disabled: !all, onclick: () => submitQuiz(emp, s) }, 'Перевірити відповіді'),
          h('button', { type: 'button', class: 'o-btn o-btn-secondary', onclick: () => { state.quiz = null; render(); } }, 'Скасувати'),
          h('span', { class: 'o-muted o-small' }, `Спроба № ${(p?.attempts || 0) + 1}`)));
    } else if (p?.passed) {
      quizBlock = h('section', { class: 'o-card o-quiz-done' },
        h('div', { class: 'o-alert o-alert-success' }, icon('check'), ` Розділ пройдено ${fmtDT(p.passedAt)}${p.attempts > 1 ? ` (спроба № ${p.attempts})` : ''}.`),
        next && h('a', { class: 'o-btn o-btn-primary', href: `#/my/${next.id}` }, 'Наступний розділ ', icon('right')),
        !next && h('a', { class: 'o-btn o-btn-primary', href: '#/my' }, 'До змісту курсу'));
    } else {
      quizBlock = h('section', { class: 'o-card o-quiz-cta' },
        h('div', null, h('h2', { class: 'o-card-title' }, 'Тест до розділу'),
          h('p', { class: 'o-muted' }, s.questions.length
            ? `${s.questions.length} питання · розділ зараховується, коли всі відповіді правильні${p?.attempts ? ` · спроб: ${p.attempts}` : ''}.`
            : 'Тест ще не налаштовано — зверніться до керівника.')),
        h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-lg', disabled: !s.questions.length, onclick: () => startQuiz(s) }, icon('play'), p?.attempts ? ' Пройти ще раз' : ' Пройти тест'));
    }

    return {
      crumbs: [{ label: 'Моя адаптація', href: '#/my' }, { label: s.title }],
      buttons: [],
      right: [h('span', { class: 'o-pager-text' }, `${idx + 1} / ${db.sections.length}`)],
      body: h('div', { class: 'o-view-bg' }, h('div', { class: 'o-page o-player' },
        h('nav', { class: 'o-player-nav', 'aria-label': 'Розділи' },
          h('div', { class: 'o-player-nav-head' }, h('b', null, 'Онбординг'), h('span', { class: 'o-small o-muted' }, `${i.passed} / ${i.total} пройдено`), progressBar(i.pct)),
          h('ol', null, db.sections.map((x, n) => {
            const px = emp.progress[x.id];
            return h('li', null, h('a', { href: `#/my/${x.id}`, class: x === s ? 'is-active' : '', 'aria-current': x === s ? 'page' : null },
              h('span', { class: `o-lesson-check is-sm${px?.passed ? ' is-done' : ''}` }, px?.passed ? icon('check') : n + 1),
              h('span', { class: 'o-player-nav-title' }, `${x.icon} ${x.title}`)));
          }))),
        h('div', { class: 'o-player-main' },
          !i.done && i.overdue && h('div', { class: 'o-alert o-alert-danger' }, icon('alert'), ` Дедлайн минув ${fmtDT(i.deadline)}. Пройдіть розділи якомога швидше.`),
          h('article', { class: 'o-card o-lesson-card' },
            h('div', { class: 'o-lesson-head' }, h('span', { class: 'o-lesson-num' }, pad(idx + 1)), h('h1', null, `${s.icon} ${s.title}`)),
            richContent(s.content),
            s.goal && h('div', { class: 'o-goal' }, h('b', null, 'Після цього розділу ви маєте'), h('div', null, s.goal))),
          quizBlock,
          h('div', { class: 'o-player-foot' },
            prev ? h('a', { class: 'o-btn o-btn-secondary', href: `#/my/${prev.id}` }, icon('left'), ' Назад') : h('span'),
            next ? h('a', { class: 'o-btn o-btn-secondary', href: `#/my/${next.id}` }, 'Далі ', icon('right')) : h('span'))))),
    };
  }

  function myMeetingsView() {
    const emp = currentEmp();
    const rows = empMeetings(emp).slice().reverse().map((m) => ({ m, e: emp }));
    return {
      crumbs: [{ label: 'Мої зустрічі' }],
      buttons: [],
      right: [h('span', { class: 'o-pager-text' }, `1-${rows.length} / ${rows.length}`)],
      body: h('div', { class: 'o-view-bg' }, h('div', { class: 'o-page' },
        !rows.length && h('div', { class: 'o-empty' }, icon('calendar', 'o-empty-icon'), h('b', null, 'Зустрічей ще немає'), h('p', { class: 'o-muted' }, 'Перша зустріч з керівником з’явиться автоматично після проходження всіх розділів онбордингу.'), h('a', { class: 'o-btn o-btn-primary', href: '#/my' }, 'До онбордингу')),
        rows.length > 0 && meetingsTable(rows, false))),
    };
  }

  // ---------- shell ----------
  function route() {
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const [a, b, c] = parts;
    if (a === 'employees' && b) return { name: 'employee', id: b, menu: 'employees' };
    if (a === 'employees') return { name: 'employees', menu: 'employees' };
    if (a === 'meetings' && b) return { name: 'meeting', id: b, menu: isManager() ? 'meetings' : 'my-meetings' };
    if (a === 'meetings') return { name: 'meetings', query, menu: 'meetings' };
    if (a === 'config' && b === 'sections' && c) return { name: 'section', id: c, menu: 'config' };
    if (a === 'config' && b === 'sections') return { name: 'sections', menu: 'config' };
    if (a === 'config' && b === 'settings') return { name: 'settings', menu: 'config' };
    if (a === 'my' && b) return { name: 'lesson', id: b, menu: 'my' };
    if (a === 'my') return { name: 'my', menu: 'my' };
    if (a === 'my-meetings') return { name: 'myMeetings', menu: 'my-meetings' };
    return { name: 'home' };
  }
  const MANAGER_ONLY = new Set(['employees', 'employee', 'meetings', 'section', 'sections', 'settings']);
  const EMPLOYEE_ONLY = new Set(['my', 'lesson', 'myMeetings']);

  function resolve(r) {
    const mgr = isManager();
    if (r.name === 'home' || (mgr && EMPLOYEE_ONLY.has(r.name)) || (!mgr && MANAGER_ONLY.has(r.name))) return { redirect: mgr ? '#/employees' : '#/my' };
    switch (r.name) {
      case 'employees': return employeesView();
      case 'employee': { const e = byId(db.employees, r.id); return e ? employeeForm(e) : { redirect: '#/employees' }; }
      case 'meetings': return meetingsView(r.query);
      case 'meeting': {
        const m = byId(db.meetings, r.id);
        if (!m || (!mgr && m.empId !== currentEmp().id)) return { redirect: mgr ? '#/meetings' : '#/my-meetings' };
        return meetingForm(m);
      }
      case 'sections': return sectionsView();
      case 'section': { const s = byId(db.sections, r.id); return s ? sectionForm(s) : { redirect: '#/config/sections' }; }
      case 'settings': return settingsView();
      case 'my': return myView();
      case 'lesson': { const s = byId(db.sections, r.id); return s ? lessonView(s) : { redirect: '#/my' }; }
      case 'myMeetings': return myMeetingsView();
      default: return { redirect: '#/' };
    }
  }

  function demoBar() {
    const switchTo = (role, empId) => {
      db.ui.role = role;
      if (empId) db.ui.empUser = empId;
      state.quiz = null;
      state.q = '';
      save(true);
      location.hash = role === 'manager' ? '#/employees' : '#/my';
      render();
    };
    return h('div', { class: 'o-demo-bar' },
      h('span', { class: 'o-demo-tag' }, 'Мокап'),
      h('span', { class: 'o-demo-text' }, 'Модуль «Онбординг» для Odoo · дані зберігаються лише в цьому браузері'),
      h('span', { class: 'o-demo-switch' },
        h('span', { class: 'o-demo-label' }, 'Дивитися як:'),
        h('button', { type: 'button', class: isManager() ? 'is-active' : '', 'aria-pressed': String(isManager()), onclick: () => switchTo('manager') }, 'Керівник / HR'),
        h('button', { type: 'button', class: !isManager() ? 'is-active' : '', 'aria-pressed': String(!isManager()), onclick: () => switchTo('employee') }, 'Працівник'),
        !isManager() && h('select', { class: 'o-demo-select', 'aria-label': 'Працівник', onchange: (e) => switchTo('employee', e.target.value) },
          db.employees.map((e) => h('option', { value: e.id, selected: e.id === currentEmp().id }, e.name)))));
  }

  function navbar(r) {
    const mgr = isManager();
    const menus = mgr
      ? [{ key: 'employees', label: 'Працівники', href: '#/employees' }, { key: 'meetings', label: 'Зустрічі', href: '#/meetings' },
        { key: 'config', label: 'Налаштування', children: [{ label: 'Розділи та тести', href: '#/config/sections' }, { label: 'Параметри', href: '#/config/settings' }] }]
      : [{ key: 'my', label: 'Моя адаптація', href: '#/my' }, { key: 'my-meetings', label: 'Мої зустрічі', href: '#/my-meetings' }];
    const overdueCount = mgr ? db.employees.reduce((n, e) => n + activities(e).filter((a) => a.status !== 'planned').length, 0)
      : activities(currentEmp()).filter((a) => a.status !== 'planned' && a.user === currentEmp().name).length;
    const menuNodes = menus.map((m) => (m.children
      ? dropdown(`nav-${m.key}`, [m.label, icon('down', 'o-caret')], m.children.map((c) => menuItem(c.label, () => { location.hash = c.href; })), `o-nav-dd${r.menu === m.key ? ' is-active' : ''}`)
      : h('a', { class: `o-nav-link${r.menu === m.key ? ' is-active' : ''}`, href: m.href }, m.label)));
    const user = userName();
    return h('header', { class: 'o-navbar' },
      h('a', { class: 'o-apps', href: '#/', title: 'Головне меню', 'aria-label': 'Головне меню' }, icon('apps')),
      h('a', { class: 'o-brand', href: '#/' }, 'Онбординг'),
      h('nav', { class: 'o-nav', 'aria-label': 'Меню модуля' }, menuNodes),
      dropdown('nav-burger', icon('menu'), menus.flatMap((m) => (m.children ? m.children : [m])).map((m) => menuItem(m.label, () => { location.hash = m.href; })), 'o-burger'),
      h('div', { class: 'o-systray' },
        h('span', { class: 'o-systray-item', title: 'Повідомлення' }, icon('chat')),
        h('span', { class: 'o-systray-item', title: overdueCount ? `Дії, що потребують уваги: ${overdueCount}` : 'Немає термінових дій' }, icon('clock'), overdueCount > 0 && h('span', { class: 'o-systray-badge' }, overdueCount)),
        dropdown('user', [avatar(user, 'sm'), h('span', { class: 'o-user-name' }, user)], [
          h('div', { class: 'o-dropdown-header' }, user, h('div', { class: 'o-muted o-small' }, isManager() ? db.manager.job : currentEmp().job)),
          menuItem('Скинути демо-дані', () => {
            if (!window.confirm('Повернути демо-дані? Усі зміни буде втрачено.')) return;
            db = seed();
            state.quiz = null;
            save(true);
            location.hash = '#/';
            render();
          }, 'is-danger'),
        ], 'o-user')));
  }

  function controlPanel(v) {
    return h('div', { class: 'o-control-panel' },
      h('div', { class: 'o-cp-left' },
        h('ol', { class: 'o-breadcrumb' }, v.crumbs.map((c, i) => h('li', { class: i === v.crumbs.length - 1 ? 'is-active' : '' },
          c.href ? h('a', { href: c.href }, c.label) : h('span', null, c.label)))),
        h('div', { class: 'o-cp-buttons' }, v.buttons, h('span', { id: 'save-ind', class: 'o-save-ind', 'aria-live': 'polite' }))),
      v.search ? h('div', { class: 'o-cp-search' }, v.search) : h('div'),
      h('div', { class: 'o-cp-right' }, v.right || []));
  }

  let lastName = '';
  function render() {
    const active = document.activeElement;
    const keep = active?.dataset?.keep;
    const caret = keep ? active.selectionStart : null;
    const r = route();
    if (r.name !== lastName) { state.q = ''; lastName = r.name; }
    if (r.name !== 'lesson') state.quiz = null;
    else if (state.quiz && state.quiz.secId !== r.id) state.quiz = null;
    const v = resolve(r);
    if (v.redirect) { location.replace(v.redirect); return; }
    app.replaceChildren(demoBar(), navbar(r), h('main', { class: 'o-action' }, controlPanel(v), v.body));
    app.querySelectorAll('textarea.o-textarea').forEach(autosize);
    if (window.matchMedia('(max-width: 900px)').matches) {
      const cur = app.querySelector('.o-player-nav a.is-active');
      if (cur) cur.parentElement.parentElement.scrollLeft = cur.offsetLeft - 16;
    }
    if (keep) {
      const el = app.querySelector(`[data-keep="${keep}"]`);
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch { /* not a text input */ } }
    }
    document.title = `${v.crumbs[v.crumbs.length - 1].label} · Онбординг`;
  }

  window.addEventListener('hashchange', () => { state.openMenu = null; state.composer = null; render(); window.scrollTo(0, 0); });
  document.addEventListener('click', (e) => {
    if (state.openMenu && !e.target.closest('.o-dropdown-menu, .o-search-panel')) { state.openMenu = null; render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.openMenu) { state.openMenu = null; render(); } });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { const d = load(); if (d) { db = d; render(); } } });

  render();
})();
