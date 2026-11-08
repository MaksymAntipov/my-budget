const STORAGE_KEY = 'myskrynia.llm.v1';

const PROVIDERS = ['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'xai'];

/** @type {Record<string, Array<{ id: string, label: string }>>} */
export const LLM_MODELS = {
  gemini: [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash — щоденний чат' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash — швидка' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — глибше, мало запитів/день' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro — майже без безкоштовної квоти' },
  ],
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  openrouter: [
    { id: 'openai/gpt-4.1', label: 'GPT-4.1' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  groq: [
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B — аналіз' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B — швидка' },
  ],
  xai: [
    { id: 'grok-3', label: 'Grok 3' },
    { id: 'grok-3-mini', label: 'Grok 3 mini' },
  ],
};

/**
 * @typedef {{ provider: string, apiKey: string, model: string, baseUrl: string }} LlmSettings
 */

/** @returns {LlmSettings} */
export function emptyLlmSettings() {
  return { provider: '', apiKey: '', model: '', baseUrl: '' };
}

/** @returns {LlmSettings} */
export function getLlmSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLlmSettings();
    const parsed = JSON.parse(raw);
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : '',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
    };
  } catch {
    return emptyLlmSettings();
  }
}

// Keys saved on the server (encrypted, per email and provider): only hints like «gsk_…WXYZ» reach the browser.
let serverKeys = { enabled: false, loaded: false, hints: /** @type {Record<string, string>} */ ({}) };

/** @param {{ enabled?: boolean, keys?: Array<{ provider: string, hint: string }> }} payload */
export function setServerKeys(payload) {
  const hints = {};
  for (const k of payload?.keys || []) {
    if (k && typeof k.provider === 'string' && typeof k.hint === 'string') hints[k.provider] = k.hint;
  }
  serverKeys = { enabled: Boolean(payload?.enabled), loaded: true, hints };
}

/** @param {string} provider @param {string} hint ('' removes it) */
export function setServerKeyHint(provider, hint) {
  const hints = { ...serverKeys.hints };
  if (hint) hints[provider] = hint;
  else delete hints[provider];
  serverKeys = { ...serverKeys, hints };
}

export function serverKeysState() {
  return serverKeys;
}

/** @param {string} provider */
export function serverKeyHint(provider) {
  return serverKeys.hints[normalizeProvider(provider)] || '';
}

/**
 * Which key the chat request carries: none when the server holds one for this provider (it uses its own),
 * otherwise the key kept in this browser (server storage off, or not migrated yet).
 * @param {LlmSettings} settings @param {string} hint
 */
export function chatRequestKey(settings, hint) {
  return hint ? '' : String(settings?.apiKey || '').trim();
}

/**
 * A key left in this browser from before server storage, to move to the server once:
 * only when storage is on, the provider is known and the server has no key for it yet.
 * @param {LlmSettings} settings @param {{ enabled: boolean, loaded: boolean, hints: Record<string, string> }} state
 */
export function localKeyToMigrate(settings, state) {
  const key = String(settings?.apiKey || '').trim();
  const provider = normalizeProvider(settings?.provider);
  if (!state?.loaded || !state.enabled || key.length < 8 || !provider || state.hints[provider]) return null;
  return { provider, apiKey: key };
}

/**
 * A browser copy of a key the server already holds for that provider (e.g. a migration whose clean-up was cut
 * short by a reload): the server copy wins and the browser one is dropped.
 * @param {LlmSettings} settings @param {{ enabled: boolean, loaded: boolean, hints: Record<string, string> }} state
 */
export function shouldDropLocalKey(settings, state) {
  const provider = normalizeProvider(settings?.provider);
  return Boolean(state?.loaded && state.enabled && String(settings?.apiKey || '').trim() && provider && state.hints[provider]);
}

/**
 * On a device where no provider is chosen yet: the provider of the most recently saved server key,
 * so a key saved elsewhere works here without picking anything.
 * @param {Array<{ provider: string, updatedAt?: number }>} keys
 */
export function preferredServerProvider(keys) {
  const known = (keys || []).filter((k) => normalizeProvider(k?.provider));
  if (!known.length) return '';
  return normalizeProvider(known.reduce((a, b) => ((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a)).provider);
}

export function hasLlmKey() {
  const s = getLlmSettings();
  return Boolean(serverKeyHint(s.provider)) || s.apiKey.trim().length >= 8;
}

/** @param {string} value */
export function normalizeProvider(value) {
  const p = String(value || '').trim().toLowerCase();
  return PROVIDERS.includes(p) ? p : '';
}

/** @param {Partial<LlmSettings>} next */
export function saveLlmSettings(next) {
  const current = getLlmSettings();
  const merged = {
    provider: next.provider !== undefined ? normalizeProvider(next.provider) : current.provider,
    apiKey: next.apiKey ?? current.apiKey,
    model: next.model ?? current.model,
    baseUrl: next.baseUrl ?? current.baseUrl,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function clearLlmSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function maskLlmKey(apiKey) {
  const k = String(apiKey || '').trim();
  if (k.length < 8) return '';
  return `•••• ${k.slice(-4)}`;
}

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  xai: 'xAI',
  openai: 'OpenAI',
};

/** @param {string} provider */
export function providerLabel(provider) {
  const id = normalizeProvider(provider);
  return id ? PROVIDER_LABELS[id] : '';
}

/** @param {string} provider */
export function modelsForProvider(provider) {
  return LLM_MODELS[normalizeProvider(provider)] || [];
}

/** @param {string} provider */
export function defaultModelFor(provider) {
  return modelsForProvider(provider)[0]?.id || '';
}

/** @param {string} provider @param {string} model */
export function normalizeModel(provider, model) {
  const list = modelsForProvider(provider);
  const id = String(model || '').trim();
  if (list.some((m) => m.id === id)) return id;
  return list[0]?.id || '';
}

/** @param {string} provider @param {string} model */
export function modelLabel(provider, model) {
  const hit = modelsForProvider(provider).find((m) => m.id === model);
  return hit?.label || model || '';
}
