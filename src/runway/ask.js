import { apiFetch } from '../api.js';
import { formatAiMarkdown } from '../ai/markdown.js';
import {
  getLlmSettings,
  hasLlmKey,
  normalizeModel,
  normalizeProvider,
} from '../ai/settings.js';
import { RUNWAY_AI_SYSTEM, RUNWAY_AI_TASK, buildRunwayDump } from './model.js';

/**
 * @param {{
 *   userId: string,
 *   snapshot: object,
 *   signal?: AbortSignal,
 *   onToken: (text: string) => void,
 * }} opts
 */
export async function askRunwayAi(opts) {
  if (!hasLlmKey()) {
    throw new Error('no-key');
  }
  const settings = getLlmSettings();
  const provider = normalizeProvider(settings.provider);
  if (!provider) {
    throw new Error('no-provider');
  }
  const dump = buildRunwayDump(opts.snapshot);
  const res = await apiFetch('/api/ai/chat', {
    method: 'POST',
    signal: opts.signal,
    body: JSON.stringify({
      userId: opts.userId,
      apiKey: settings.apiKey,
      provider,
      model: normalizeModel(provider, settings.model),
      maxOutputTokens: 2048,
      system: RUNWAY_AI_SYSTEM,
      messages: [{ role: 'user', content: `${dump}\n\nЗАВДАННЯ:\n${RUNWAY_AI_TASK}` }],
    }),
  });
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok || !ctype.includes('text/event-stream')) {
    let err = 'Не вдалося звернутися до ШІ';
    try {
      const data = await res.json();
      if (data?.error) err = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Порожня відповідь');
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        if (json.error) throw new Error(String(json.error));
        if (json.t) {
          text += json.t;
          opts.onToken(text);
        }
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e;
      }
    }
  }
  if (!String(text).trim()) throw new Error('Порожня відповідь');
  return text;
}

export function runwayAnswerHtml(text) {
  return formatAiMarkdown(text || '');
}
