const STORAGE_KEY = 'myskrynia.llm.v1';

const PROVIDERS = ['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'xai'];

/** @type {Record<string, Array<{ id: string, label: string }>>} */
export const LLM_MODELS = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — щоденний чат' },
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
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
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

export function hasLlmKey() {
  return getLlmSettings().apiKey.trim().length >= 8;
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
