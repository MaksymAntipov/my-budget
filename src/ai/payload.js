const BRIEFING_SUMMARY_MAX = 3600;
const TAIL_ASSISTANT_MAX = 1500;
const TAIL_TURNS = 4;

export function isProviderCapacityError(text) {
  return /high demand|try again later|UNAVAILABLE|overloaded|resource.?exhausted|перевантажен/i.test(
    String(text || ''),
  );
}

export function isTransientAiError(text) {
  const s = String(text || '');
  return (
    s.startsWith('Ліміт провайдера') ||
    s.startsWith('Денна квота') ||
    s.startsWith('Забагато запитів') ||
    s.startsWith('Не вдалося звернутися') ||
    s.startsWith('Порожня відповідь') ||
    s.startsWith('Скриня зупинилась') ||
    s.startsWith('Провайдер перевантажений') ||
    /Thinking level/i.test(s) ||
    isProviderCapacityError(s)
  );
}

const HIGH_DEMAND_RE =
  /This model is currently experiencing high demand\.[\s\S]*?Please try again later\.?/gi;

export function stripProviderNoise(text) {
  return String(text || '')
    .replace(HIGH_DEMAND_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const PROVIDER_BUSY_NOTE = 'Провайдер перевантажений. Зачекайте хвилину і спробуйте знову.';

const CONTINUE_CTX_MAX = 14000;

export function clipContextForContinue(text, max = CONTINUE_CTX_MAX) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.45);
  const tail = max - head - 8;
  return `${t.slice(0, head).trimEnd()}\n\n…\n\n${t.slice(-tail).trimStart()}`;
}

export function clipText(text, max) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// Growth report (the only one with HELICOPTER VIEW) and capital report sections.
const BRIEFING_MARKERS = [
  'HELICOPTER VIEW',
  'ТАКТИКА',
  'НА ПОДУМАТИ',
  'ГОЛОВНЕ',
  'КАПІТАЛ ЗАРАЗ',
  'ДИНАМІКА',
  'РИЗИКИ',
  'КУДИ СПРЯМУВАТИ ГРОШІ',
  'ДЕ КАПІТАЛ ВИТІКАЄ',
];
const REPORT_RE = /HELICOPTER VIEW|КАПІТАЛ ЗАРАЗ/i;

const WIDE_LOOK_FINANCE =
  "Користувач просить погляд збоку на свої гроші. Дай звіт про капітал розділами ГОЛОВНЕ / КАПІТАЛ ЗАРАЗ / ДИНАМІКА / РИЗИКИ / КУДИ СПРЯМУВАТИ ГРОШІ / ДЕ КАПІТАЛ ВИТІКАЄ: що є, куди тече, наскільки це стійко і куди спрямувати вільний залишок (не більше 3 дій із сумами). Людською мовою, без таблиць і загальних порад. Цілі, треки, точку Б і ×25 не аналізуй — це стратегія росту; розділів HELICOPTER VIEW / ТАКТИКА / НА ПОДУМАТИ не пиши. Цифри лише з дампу.";

const WIDE_LOOK_GROWTH =
  "Користувач просить погляд збоку на курс життя. Дай повний HELICOPTER VIEW / ТАКТИКА / НА ПОДУМАТИ як стратег росту, не як фінансовий звіт: чи каса фінансує точку Б; яка стеля гри; чи точка Б в іншій грі; що здаємо, якщо чек / горизонт / каса не сумісні. Каса — доказ курсу, не висновок касира: не роби головним «скільки відкласти» і порядок погашення банків. Цифри лише з дампу. Не згортай до одного абзацу.";

export function wideLookUserPrompt(kind, question) {
  const head = kind === 'growth' ? WIDE_LOOK_GROWTH : WIDE_LOOK_FINANCE;
  return `${head}\n\n${question}`;
}

/** Keep the report's section slices instead of a blind prefix. */
export function summarizeBriefing(text, max = BRIEFING_SUMMARY_MAX) {
  const t = String(text || '').replace(/\s+\n/g, '\n').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const hits = BRIEFING_MARKERS.map((marker) => ({ marker, idx: t.indexOf(marker) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  if (hits.length >= 2) {
    const blocks = hits.map((h, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].idx : t.length;
      return t.slice(h.idx, end).trim();
    });
    const budget = Math.max(400, Math.floor(max / blocks.length));
    return blocks.map((p) => clipText(p, budget)).join('\n\n');
  }
  return clipText(t, max);
}

export function coalesceMessages(messages, { freezeFirst = false } = {}) {
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = String(m.content || '');
    const last = out[out.length - 1];
    const frozen = freezeFirst && out.length === 1;
    if (last && last.role === m.role && !frozen) {
      last.content = last.content ? `${last.content}\n\n${content}` : content;
    } else {
      out.push({ role: m.role, content });
    }
  }
  return out;
}

function visibleTurns(thread) {
  const out = [];
  for (let i = 0; i < thread.length; i += 1) {
    const m = thread[i];
    if (!m || m.kind === 'context') continue;
    if (m.role === 'assistant') {
      if (!String(m.content || '').trim() || isTransientAiError(m.content)) continue;
      out.push(m);
      continue;
    }
    if (m.kind === 'user' || m.role === 'user') {
      const next = thread[i + 1];
      if (next?.role === 'assistant' && isTransientAiError(next.content)) continue;
      out.push(m);
    }
  }
  return out;
}

function findBriefingAssistant(turns) {
  const tagged = [...turns]
    .reverse()
    .find((m) => m.role === 'assistant' && (m.source === 'briefing' || m.source === 'wide'));
  if (tagged) return tagged;
  return [...turns]
    .reverse()
    .find((m) => m.role === 'assistant' && REPORT_RE.test(m.content || ''));
}

/**
 * Build the LLM message list for a follow-up (or briefing) turn.
 * @param {Array<{ role: string, content: string, kind?: string, source?: string }>} thread
 * @param {{ briefing?: boolean, wide?: boolean, kind?: 'analytics' | 'growth' }} [opts]
 */
export function buildChatApiMessages(thread, opts = {}) {
  const list = Array.isArray(thread) ? thread : [];
  const ctx = list
    .filter((m) => m?.kind === 'context' && String(m.content || '').trim())
    .map((m) => ({ role: 'user', content: m.content }));

  if (opts.continue) {
    const lastAsst = [...list]
      .reverse()
      .find((m) => m?.role === 'assistant' && String(m.content || '').trim());
    const dump = clipContextForContinue(ctx[0]?.content || '');
    const mapped = [];
    if (dump) {
      mapped.push({
        role: 'user',
        content: `Знімок Скрині (цифри лише звідси):\n${dump}`,
      });
    }
    if (lastAsst) {
      mapped.push({
        role: 'assistant',
        content: clipText(stripProviderNoise(lastAsst.content), 8000),
      });
    }
    mapped.push({ role: 'user', content: CONTINUE_PROMPT });
    return coalesceMessages(mapped, { freezeFirst: Boolean(dump) });
  }

  if (opts.briefing) {
    return coalesceMessages(ctx);
  }

  const turns = visibleTurns(list);
  const lastUserIdx = turns.reduce((idx, m, i) => (m.kind === 'user' || m.role === 'user' ? i : idx), -1);
  const lastUser = lastUserIdx >= 0 ? turns[lastUserIdx] : null;
  const before = lastUserIdx >= 0 ? turns.slice(0, lastUserIdx) : turns;
  const briefingAsst = findBriefingAssistant(turns);

  const mapped = [...ctx];
  if (briefingAsst) {
    mapped.push({
      role: 'assistant',
      content: opts.wide
        ? `Попередній звіт Скрині (можна переглянути курс, якщо цифри це показують):\n${summarizeBriefing(briefingAsst.content)}`
        : `Саммарі звіту Скрині (тримайся цих тез і цифр, не вигадуй нове):\n${summarizeBriefing(briefingAsst.content)}`,
    });
  }

  const tail = before.filter((m) => m !== briefingAsst).slice(-TAIL_TURNS);
  if (!briefingAsst && tail[0]?.role === 'user' && tail.length + (lastUser ? 1 : 0) > 1) {
    mapped.push({
      role: 'assistant',
      content: 'Знімок Скрині прийнято. Далі — лише питання користувача.',
    });
  }
  for (const m of tail) {
    if (m.role === 'assistant') {
      mapped.push({ role: 'assistant', content: clipText(m.content, TAIL_ASSISTANT_MAX) });
    } else {
      mapped.push({ role: 'user', content: m.content });
    }
  }
  if (lastUser) {
    mapped.push({
      role: 'user',
      content: opts.wide
        ? wideLookUserPrompt(opts.kind || briefingKindFromThread(list), lastUser.content)
        : `Питання користувача — відповідай лише на нього, спираючись на дані Скрині та саммарі звіту вище.\n\n${lastUser.content}`,
    });
  }
  return coalesceMessages(mapped, { freezeFirst: ctx.length > 0 });
}

const ANALYTICS_CHIPS = [
  'Подивись на Скриню збоку',
  'Скільки відкласти цього місяця?',
  "Де найбільші необов'язкові витрати?",
  'Що з подушкою безпеки?',
  "Які треки б'ються з бюджетом?",
];

const GROWTH_CHIPS = [
  'Подивись на Скриню збоку',
  'Чи каса фінансує точку Б?',
  'Які треки нереалістичні при цьому капіталі?',
  'Яка стеля гри відносно точки Б?',
  'Що зробити в найближчі 48 годин?',
];

function similar(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y && x === y);
}

export function defaultSuggestions({ kind, lastQuestion, parsed } = {}) {
  const growth = kind === 'growth';
  const pool = [...(growth ? GROWTH_CHIPS : ANALYTICS_CHIPS)];
  const q = String(lastQuestion || '');
  if (/подушк/i.test(q)) pool.unshift('Скільки ще треба до подушки?');
  if (/борг/i.test(q)) pool.unshift('Який борг гасити першим?');
  if (/відклас|заощад/i.test(q)) pool.unshift('Куди класти відкладене — подушка чи інвестиції?');
  if (/трек/i.test(q)) pool.unshift('Який трек фінансувати першим?');
  if (parsed?.months?.length && !growth) {
    pool.unshift('Порівняй цей період з попереднім місяцем');
  }
  const out = [];
  const seen = new Set();
  for (const item of pool) {
    if (similar(item, q)) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 4) break;
  }
  return out;
}

const CONTINUE_PROMPT =
  'Попередня відповідь обірвалась на півслові. Продовж ТОЧНО з наступного слова, без повтору вже написаного. Якщо це звіт — допиши розділи, яких ще немає, у тому ж порядку.';

/** True when a report/stream likely died mid-sentence. */
export function looksTruncatedAiReply(text, { expectReport = false } = {}) {
  const t = String(text || '').trim();
  if (!t) return false;
  // Capital report: complete once its last section is there.
  if (/КАПІТАЛ ЗАРАЗ/i.test(t)) return !/ДЕ КАПІТАЛ ВИТІКАЄ/i.test(t);
  const hasHeli = /HELICOPTER VIEW/i.test(t);
  const hasTac = /ТАКТИКА/i.test(t);
  const hasThink = /НА ПОДУМАТИ/i.test(t);
  if (expectReport || hasHeli) {
    if (!hasTac || !hasThink) return true;
  }
  return false;
}

export function briefingKindFromThread(thread) {
  const list = Array.isArray(thread) ? thread : [];
  const ctx = [...list].reverse().find((m) => m?.kind === 'context');
  if (ctx?.label === 'Стратегія росту') return 'growth';
  if (list.some((m) => m?.source === 'briefing' && /точка Б|roadmap|гелікоптер/i.test(m.content || ''))) {
    return /точка Б|Roadmap|вектор/i.test(list.find((m) => m.source === 'briefing')?.content || '')
      ? 'growth'
      : 'analytics';
  }
  if (ctx?.label === 'Аналіз капіталу' || ctx?.label === 'Аналіз фінансів') return 'analytics';
  const brief = list.find((m) => m?.source === 'briefing');
  if (brief && /точка Б|Roadmap|головний вектор/i.test(brief.content || '')) return 'growth';
  if (brief) return 'analytics';
  return 'analytics';
}
