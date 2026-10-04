const PREFIX = 'myskrynia.ai.chat.v1.';
const MAX_MESSAGES = 40;
const MAX_CHARS = 900_000;

function storageKey(userId) {
  return PREFIX + String(userId || '').trim();
}

function sanitizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const role = raw.role === 'assistant' ? 'assistant' : 'user';
  const kind =
    raw.kind === 'context' || raw.kind === 'assistant' || raw.kind === 'user'
      ? raw.kind
      : role === 'assistant'
        ? 'assistant'
        : 'user';
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (role === 'assistant' && !content.trim()) return null;
  const label = typeof raw.label === 'string' ? raw.label : undefined;
  const mode = raw.mode === 'briefing' || raw.mode === 'data' || raw.mode === 'wide' ? raw.mode : undefined;
  const source = raw.source === 'briefing' || raw.source === 'chat' || raw.source === 'wide' ? raw.source : undefined;
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.map((s) => String(s || '').trim()).filter((s) => s.length >= 8 && s.length <= 90).slice(0, 4)
    : undefined;
  const msg = { role, kind, content };
  if (label) msg.label = label;
  if (mode) msg.mode = mode;
  if (source) msg.source = source;
  if (suggestions?.length) msg.suggestions = suggestions;
  if (!msg.source && role === 'assistant' && /HELICOPTER VIEW|КАПІТАЛ ЗАРАЗ/i.test(content)) msg.source = 'briefing';
  return msg;
}

function fitThread(thread) {
  let next = thread.slice(-MAX_MESSAGES);
  const size = () => JSON.stringify(next).length;
  if (size() <= MAX_CHARS) return next;

  let lastCtx = -1;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].kind === 'context') {
      lastCtx = i;
      break;
    }
  }
  next = next.map((m, i) => {
    if (m.kind !== 'context' || i === lastCtx) return m;
    return {
      ...m,
      content: m.label ? `Контекст Скрині: ${m.label}` : 'Контекст Скрині',
    };
  });
  while (next.length > 2 && size() > MAX_CHARS) {
    next = next.slice(1);
  }
  return next;
}

/** @param {string | undefined} userId */
export function loadAiHistory(userId) {
  const empty = { thread: [], lastContextPrompt: '', lastBriefingKind: '' };
  if (!userId) return empty;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const thread = Array.isArray(parsed.thread)
      ? parsed.thread.map(sanitizeMessage).filter(Boolean)
      : [];
    const lastContextPrompt =
      typeof parsed.lastContextPrompt === 'string' ? parsed.lastContextPrompt : '';
    const lastBriefingKind =
      parsed.lastBriefingKind === 'growth' || parsed.lastBriefingKind === 'analytics'
        ? parsed.lastBriefingKind
        : '';
    return { thread, lastContextPrompt, lastBriefingKind };
  } catch {
    return empty;
  }
}

/**
 * @param {string | undefined} userId
 * @param {{ thread: unknown[], lastContextPrompt?: string, lastBriefingKind?: string }} payload
 */
export function saveAiHistory(userId, payload) {
  if (!userId) return;
  const thread = fitThread((payload.thread || []).map(sanitizeMessage).filter(Boolean));
  const lastContextPrompt =
    typeof payload.lastContextPrompt === 'string' ? payload.lastContextPrompt : '';
  const lastBriefingKind =
    payload.lastBriefingKind === 'growth' || payload.lastBriefingKind === 'analytics'
      ? payload.lastBriefingKind
      : '';
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ v: 1, thread, lastContextPrompt, lastBriefingKind }),
    );
  } catch {
    try {
      const slim = fitThread(
        thread.map((m) =>
          m.kind === 'context'
            ? { ...m, content: m.label ? `Контекст Скрині: ${m.label}` : 'Контекст Скрині' }
            : m,
        ),
      );
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify({ v: 1, thread: slim, lastContextPrompt: '', lastBriefingKind }),
      );
    } catch {
      /* quota */
    }
  }
}

/** @param {string | undefined} userId */
export function clearAiHistory(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Removes every profile's saved chat (it embeds the financial context prompt). */
export function clearAllAiHistory() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
