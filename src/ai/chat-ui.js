import { apiFetch } from '../api.js';
import { escapeHtml } from '../utils.js';
import {
  clearLlmSettings,
  defaultModelFor,
  getLlmSettings,
  hasLlmKey,
  maskLlmKey,
  modelLabel,
  modelsForProvider,
  normalizeModel,
  normalizeProvider,
  providerLabel,
  saveLlmSettings,
} from './settings.js';
import { clearAiHistory, clearAllAiHistory, loadAiHistory, saveAiHistory } from './history.js';
import { isWideLookQuestion, parseFocusFromQuestion } from './focus.js';
import { formatAiMarkdown, splitSuggestions } from './markdown.js';
import {
  briefingKindFromThread,
  buildChatApiMessages,
  defaultSuggestions,
  isProviderCapacityError,
  isTransientAiError,
  looksTruncatedAiReply,
  PROVIDER_BUSY_NOTE,
  stripProviderNoise,
} from './payload.js';

const SYSTEM_RULES =
  "Відповідай українською. Лише дані з контексту Скрині та цього чату: не вигадуй цифри, роботодавців, ринки, треки чи курс. Немає в даних — так і скажи. Не ходи в інтернет і не пропонуй зовнішній чат. Питання про місяць, квартал чи «весь час» — лише відповідні блоки «ПЕРІОД»; якщо є блок «ДЕТАЛІЗАЦІЯ ПІД ПИТАННЯ» — рахуй його. Стан «зараз» бери з блоку «ЗАРАЗ» і блоку «ПОТОЧНИЙ МІСЯЦЬ»: блоки «історія» — минуле, і суму з них не називай діючою витратою. Категорії з рядка «Закрито / без витрат цього місяця» і банки з поміткою «ціль закрита» — закриті: не пиши, що я їх досі фінансую. Обов'язкові категорії = база подушки (6 міс.); без міток не вигадуй ціль. Не ріж обов'язкові, поки є необов'язкові — якщо цифри не показують, що саме це правило шкодить (тоді скажи про це прямо). Поле «за 10 років» = місяць×120: мотивуй оптимізувати великі 10-річні потоки; якщо оренда/інший lifestyle за 10 років уже як актив — сигналізуй підміну капіталу (оренда vs іпотека тощо). Ціни ринку не вигадуй. [заощадження] не ріж. Стадії трека (Очікує / В процесі / Готово) — чи крок закритий; каса не закриває стадію. Гео, remote, релокейт і мову — лише з анкети та треків. Суми в гривнях. У долари — лише якщо прямо спитали; курс бери з блоку «КУРС ВАЛЮТ». Не пропонуй конвертацію і не згадуй курс без запиту. Коротке питання — коротка відповідь. Якщо користувач уточнює попередній звіт — розвивай його, не починай аналіз з нуля.";

const SYSTEM_CLOSE =
  " Наприкінці звичайної відповіді (не повного звіту) додай блок НАСТУПНІ ПИТАННЯ: рівно 3 короткі уточнення з дефісом, без пояснень.";

function growthRoleActive() {
  return lastBriefingKind === 'growth';
}

function buildSystemPrompt() {
  if (growthRoleActive()) {
    return (
      "Ти стратег росту MySkrynia, не аналітик капіталу. «Аналіз капіталу» питає, чи каса здорова; ти питаєш, чи курс (точка Б, вектор, треки) оплатний і досяжний. Касу бери коротко як доказ (детальний розбір — «Аналіз капіталу»), потім інтерпретуй для точки Б. Не згортайся лише до кар'єрного чекліста і не підміняй висновок порадами касира. " +
      SYSTEM_RULES +
      " Повний звіт HELICOPTER VIEW / ТАКТИКА / НА ПОДУМАТИ — якщо просили стратегію росту, натиснули цю кнопку, або просять погляд збоку / чи курс хибний." +
      SYSTEM_CLOSE
    );
  }
  return (
    "Ти аналітик капіталу MySkrynia: що є, куди тече і наскільки це стійко. Цілі, треки, точка Б і ×25 — це стратегія росту, не твоя тема. " +
    SYSTEM_RULES +
    " Повний звіт розділами КАПІТАЛ ЗАРАЗ / ДИНАМІКА / РИЗИКИ / КУДИ СПРЯМУВАТИ ГРОШІ / ДЕ КАПІТАЛ ВИТІКАЄ — якщо натиснули «Аналіз капіталу» або просять погляд збоку на гроші. Розділи HELICOPTER VIEW / ТАКТИКА / НА ПОДУМАТИ — лише в стратегії росту, тут їх не пиши." +
    SYSTEM_CLOSE
  );
}

/** @type {null | {
 *   getUserId: () => string | undefined,
 *   isLoggedIn: () => boolean,
 *   buildAnalyticsPrompt: (type: string) => Promise<string>,
 *   buildAiSkryniaDataDump: (opts?: { compact?: boolean, focusMonths?: Array<{year:number, month:number}>, focusCategories?: string[] }) => Promise<string>,
 *   buildGrowthPrompt: (type: string) => Promise<string>,
 *   getAiFocusCatalog: () => { currentYear: number, currentMonth: number, initializedMonths: Array<{year:number, month:number}>, names: string[] },
 *   hasGrowthProfile: () => boolean,
 *   openGrowthModal: () => void,
 * }} */
let deps = null;

/** @type {Array<{ role: 'user' | 'assistant', content: string, kind: string, label?: string, source?: string, suggestions?: string[] }>} */
let thread = [];
let busy = false;
/** @type {AbortController | null} */
let abortCtrl = null;
let lastContextPrompt = '';
/** @type {'' | 'analytics' | 'growth'} */
let lastBriefingKind = '';
let pendingChatOpen = false;
let loadedForUser = '';
let persistTimer = null;
let providerUnlockAt = 0;
let unlockTimer = null;

export function initAiChat(nextDeps) {
  deps = nextDeps;
  hydrateAiChat();
  syncLlmSettingsForm();
  syncAiEntryButtons();
  const input = document.getElementById('ai-chat-input');
  input?.addEventListener('keydown', handleAiChatKeydown);
  input?.addEventListener('input', autoResizeAiInput);
  window.addEventListener('pagehide', persistAiChatNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistAiChatNow();
  });
}

export function hydrateAiChat() {
  const userId = deps?.getUserId();
  if (loadedForUser && loadedForUser !== userId) {
    saveAiHistory(loadedForUser, { thread, lastContextPrompt, lastBriefingKind });
  }
  if (!userId) {
    loadedForUser = '';
    thread = [];
    lastContextPrompt = '';
    lastBriefingKind = '';
    renderAiThread();
    return;
  }
  if (loadedForUser === userId) return;
  loadedForUser = userId;
  const saved = loadAiHistory(userId);
  thread = saved.thread;
  lastContextPrompt = saved.lastContextPrompt;
  lastBriefingKind = saved.lastBriefingKind === 'growth' ? 'growth' : saved.lastBriefingKind === 'analytics' ? 'analytics' : '';
  renderAiThread();
}

export function syncAiEntryButtons() {
  const keyed = hasLlmKey();
  const prompts = document.getElementById('ai-prompt-buttons');
  const agent = document.getElementById('btn-ai-agent');
  const analytics = document.getElementById('ai-analytics-label');
  const growth = document.getElementById('ai-growth-run-label');
  if (prompts) prompts.hidden = keyed;
  if (agent) agent.hidden = !keyed;
  if (analytics) analytics.textContent = 'Промпт: аналіз фінансів';
  if (growth) growth.textContent = 'Промпт: стратегія росту';
  const ready = Boolean(deps?.hasGrowthProfile?.());
  const hint = ready ? '' : 'Спочатку заповніть стратегію росту';
  const chip = document.getElementById('ai-chat-chip-growth');
  if (chip) {
    chip.disabled = !ready;
    chip.title = hint;
  }
  const dash = document.getElementById('btn-ai-growth-run');
  if (dash) {
    dash.disabled = !ready;
    dash.title = hint;
  }
}

export function launchAiAgent() {
  hydrateAiChat();
  openAiChat();
}

export function openLlmSettings() {
  const overlay = document.getElementById('llm-settings-modal');
  if (!overlay) return;
  syncLlmSettingsForm();
  overlay.classList.add('active');
}

export function closeLlmSettings(e) {
  if (e && e.target && e.target.id !== 'llm-settings-modal' && !e.target.closest('.btn-close-modal')) {
    return;
  }
  document.getElementById('llm-settings-modal')?.classList.remove('active');
}

function paintDropdown(rootId, value) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const label = root.querySelector('.custom-dropdown-selected');
  root.querySelectorAll('.custom-dropdown-option').forEach((opt) => {
    let val = '';
    try {
      const args = JSON.parse(opt.getAttribute('data-args') || '[]');
      val = Array.isArray(args) ? args[0] : args;
    } catch {
      val = '';
    }
    const on = val === value;
    opt.classList.toggle('selected', on);
    const check = opt.querySelector('.option-check');
    if (check) check.textContent = on ? '✓' : '';
    if (on && label) {
      label.textContent = opt.querySelector('.option-label')?.textContent?.trim() || String(value);
    }
  });
}

function formProvider() {
  return normalizeProvider(document.getElementById('llm-provider')?.value || '');
}

function paintProviderDropdown(value) {
  const hidden = document.getElementById('llm-provider');
  const chosen = normalizeProvider(value);
  if (hidden) hidden.value = chosen;
  paintDropdown('llm-provider-dd', chosen);
  if (!chosen) {
    const label = document.querySelector('#llm-provider-dd .custom-dropdown-selected');
    if (label) label.textContent = 'Оберіть провайдера';
  }
}

function fillModelOptions(provider) {
  const wrap = document.getElementById('llm-model-wrap');
  const options = document.getElementById('llm-model-options');
  const list = modelsForProvider(provider);
  if (wrap) wrap.hidden = !list.length;
  if (!options) return;
  options.innerHTML = list
    .map(
      (m) =>
        `<div class="custom-dropdown-option" data-action="selectLlmModel" data-pass-event="1" data-args='${JSON.stringify([m.id])}'><span class="option-check"></span><span class="option-label">${escapeHtml(m.label)}</span></div>`
    )
    .join('');
}

function paintModelDropdown(value) {
  const hidden = document.getElementById('llm-model');
  const chosen = String(value || '').trim();
  if (hidden) hidden.value = chosen;
  paintDropdown('llm-model-dd', chosen);
  if (!chosen) {
    const label = document.querySelector('#llm-model-dd .custom-dropdown-selected');
    if (label) label.textContent = 'Оберіть модель';
  }
}

export function selectLlmProvider(event, value) {
  event?.target?.closest?.('.custom-dropdown')?.classList.remove('open');
  paintProviderDropdown(value);
  fillModelOptions(value);
  paintModelDropdown(defaultModelFor(value));
  const prev = getLlmSettings();
  if (prev.apiKey) {
    saveLlmSettings({ provider: value, model: defaultModelFor(value) });
    syncLlmSettingsForm();
    const name = providerLabel(value);
    setLlmSettingsStatus(name ? `Провайдер: ${name}` : '', false);
  }
}

export function selectLlmModel(event, value) {
  event?.target?.closest?.('.custom-dropdown')?.classList.remove('open');
  const provider = formProvider();
  const model = normalizeModel(provider, value);
  paintModelDropdown(model);
  const prev = getLlmSettings();
  if (prev.apiKey) {
    saveLlmSettings({ model });
    syncLlmSettingsForm();
    const name = modelLabel(provider, model);
    setLlmSettingsStatus(name ? `Модель: ${name}` : '', false);
  }
}

export function saveLlmSettingsFromForm() {
  if (hasLlmKey()) {
    setLlmSettingsStatus('Ключ уже збережено. Щоб поставити інший — спочатку видаліть цей.', true);
    return;
  }
  const provider = formProvider();
  if (!provider) {
    setLlmSettingsStatus('Оберіть провайдера', true);
    return;
  }
  const apiKey = document.getElementById('llm-api-key')?.value.trim() || '';
  if (!apiKey) {
    setLlmSettingsStatus('Спочатку вставте ключ у поле нижче', true);
    return;
  }
  if (apiKey.length < 8) {
    setLlmSettingsStatus('Ключ занадто короткий', true);
    return;
  }
  saveLlmSettings({
    provider,
    apiKey,
    model: normalizeModel(provider, document.getElementById('llm-model')?.value),
    baseUrl: '',
  });
  syncLlmSettingsForm();
  setLlmSettingsStatus(`Збережено · ${providerLabel(provider)}`, false);
  if (pendingChatOpen && hasLlmKey()) {
    pendingChatOpen = false;
    closeLlmSettings();
    openAiChat();
  }
}

export function clearLlmSettingsFromForm() {
  if (!getLlmSettings().apiKey) {
    setLlmSettingsStatus('Немає ключа для видалення', true);
    return;
  }
  clearLlmSettings();
  syncLlmSettingsForm();
  const keyInput = document.getElementById('llm-api-key');
  if (keyInput) keyInput.value = '';
  setLlmSettingsStatus('Ключ видалено з цього пристрою', false);
}

export function openAiChat(opts = {}) {
  if (!deps?.isLoggedIn()) return;
  hydrateAiChat();
  syncAiEntryButtons();
  if (!hasLlmKey()) {
    pendingChatOpen = true;
    openLlmSettings();
    setLlmSettingsStatus('Спочатку додайте API-ключ — потім відкриється чат', true);
    return;
  }
  pendingChatOpen = false;
  const overlay = document.getElementById('ai-chat-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.classList.toggle('is-expanded', Boolean(opts.expand));
  document.getElementById('ai-chat-input')?.focus();
  if (opts.starter && thread.length === 0) {
    void startAiBriefing(opts.starter);
  } else if (opts.starter === 'growth') {
    void startAiBriefing('growth');
  }
}

export function closeAiChat(e) {
  if (e && e.target) {
    const backdrop = e.target.id === 'ai-chat-overlay';
    const closeBtn = e.target.closest('.btn-close-modal');
    if (!backdrop && !closeBtn) return;
  }
  if (busy) {
    abortCtrl?.abort();
  }
  document.getElementById('ai-chat-overlay')?.classList.remove('active', 'is-expanded');
  persistAiChatNow();
}

export function toggleAiChatExpand() {
  document.getElementById('ai-chat-overlay')?.classList.toggle('is-expanded');
}

export function resetAiChat() {
  if (!thread.length && !lastContextPrompt) return;
  const clear = () => {
    if (busy) abortCtrl?.abort();
    busy = false;
    abortCtrl = null;
    thread = [];
    lastContextPrompt = '';
    lastBriefingKind = '';
    clearAiHistory(deps?.getUserId());
    renderAiThread();
  };
  if (typeof window.showConfirm === 'function') {
    window.showConfirm(
      'Очистити історію чату?',
      'Діалог зі Скринею буде видалено з цього пристрою. Дані бюджету не зміняться.',
      clear,
      { cancel: 'Назад', confirm: 'Очистити' },
    );
    return;
  }
  clear();
}

/** @param {{ forget?: boolean }} [opts] forget: logout — drop the LLM key and every saved chat. */
export function unloadAiChat({ forget = false } = {}) {
  if (forget) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    clearAllAiHistory();
    clearLlmSettings();
  } else {
    persistAiChatNow();
  }
  if (busy) abortCtrl?.abort();
  busy = false;
  abortCtrl = null;
  loadedForUser = '';
  thread = [];
  lastContextPrompt = '';
  lastBriefingKind = '';
  renderAiThread();
}

function persistAiChatNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const userId = deps?.getUserId();
  if (!userId || loadedForUser !== userId) return;
  saveAiHistory(userId, { thread, lastContextPrompt, lastBriefingKind });
}

function schedulePersistAiChat() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistAiChatNow, 350);
}

export async function startAiBriefing(kind) {
  if (!deps) return;
  if (remainingLockSec() > 0) {
    appendSystemNote(`Ліміт провайдера. Надіслати можна через ${remainingLockSec()} с.`);
    return;
  }
  if (busy) return;
  if (!hasLlmKey()) {
    openLlmSettings();
    return;
  }
  const overlay = document.getElementById('ai-chat-overlay');
  overlay?.classList.add('active');

  const packed = await loadBriefingContext(kind);
  if (!packed) return;
  lastContextPrompt = packed.prompt;
  lastBriefingKind = kind === 'growth' ? 'growth' : 'analytics';
  thread = [{ role: 'user', content: packed.prompt, kind: 'context', label: packed.label, mode: 'briefing' }];
  renderAiThread({ stick: true });
  await streamAssistant({ briefing: true });
}

/**
 * Fresh dump for a typed question. Compact + focus slice by default;
 * full snapshot when the user asks for a helicopter / outside look.
 */
async function attachSkryniaContext(question = '', opts = {}) {
  try {
    const wide = Boolean(opts.wide);
    const catalog = typeof deps.getAiFocusCatalog === 'function' ? deps.getAiFocusCatalog() : null;
    const focus = wide ? { months: [], categories: [] } : parseFocusFromQuestion(question, catalog || {});
    const dump =
      typeof deps.buildAiSkryniaDataDump === 'function'
        ? await deps.buildAiSkryniaDataDump(
            wide
              ? { compact: false }
              : {
                  compact: true,
                  focusMonths: focus.months,
                  focusCategories: focus.categories,
                },
          )
        : await deps.buildAnalyticsPrompt?.('all');
    if (!dump) return false;
    lastContextPrompt = dump;
    const packed = {
      role: 'user',
      content: dump,
      kind: 'context',
      label:
        lastBriefingKind === 'growth'
          ? 'Стратегія росту'
          : wide
            ? 'Дані Скрині (повний знімок)'
            : 'Дані Скрині',
      mode: wide ? 'wide' : 'data',
      focus,
    };
    const existingIdx = thread.findIndex((m) => m.kind === 'context');
    if (existingIdx >= 0) thread[existingIdx] = packed;
    else thread.unshift(packed);
    return true;
  } catch (err) {
    console.error(err);
    appendSystemNote('Не вдалося зібрати контекст Скрині.');
    return false;
  }
}

async function loadBriefingContext(kind) {
  try {
    if (kind === 'growth') {
      if (!deps.hasGrowthProfile()) {
        closeAiChat();
        deps.openGrowthModal();
        return null;
      }
      const prompt = await deps.buildGrowthPrompt('all');
      if (!prompt) {
        closeAiChat();
        deps.openGrowthModal();
        return null;
      }
      return { prompt, label: 'Стратегія росту' };
    }
    const prompt = await deps.buildAnalyticsPrompt('all');
    return { prompt, label: 'Аналіз капіталу' };
  } catch (err) {
    console.error(err);
    appendSystemNote('Не вдалося зібрати контекст Скрині.');
    return null;
  }
}

export function stopAiChat() {
  if (!busy) return;
  abortCtrl?.abort();
}

export async function sendAiChatMessage() {
  if (busy) return;
  if (remainingLockSec() > 0) {
    paintComposer();
    return;
  }
  const input = document.getElementById('ai-chat-input');
  const text = (input?.value || '').trim();
  if (!text) return;
  if (!hasLlmKey()) {
    openLlmSettings();
    return;
  }
  if (input) input.value = '';
  autoResizeAiInput();
  if (/^(продовж|продолжи|continue|допиши)[.!?…]*$/i.test(text)) {
    const last = [...thread].reverse().find((m) => m.role === 'assistant' && String(m.content || '').trim());
    if (last) {
      appendSystemNote('Дописую обірвану відповідь…');
      await streamAssistant({ continue: true });
      return;
    }
  }
  const wide = isWideLookQuestion(text);
  if (!(await attachSkryniaContext(text, { wide }))) {
    if (input) {
      input.value = text;
      autoResizeAiInput();
    }
    return;
  }
  thread.push({ role: 'user', content: text, kind: 'user' });
  renderAiThread({ stick: true });
  const local = localSkryniaReply(text);
  if (local) {
    thread.push({ role: 'assistant', content: local, kind: 'assistant' });
    renderAiThread({ stick: true });
    return;
  }
  await streamAssistant({ wide });
}

export function sendAiSuggestion(text) {
  const value = String(text || '').trim();
  if (!value || busy) return;
  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.value = value;
    autoResizeAiInput();
  }
  void sendAiChatMessage();
}

export function handleAiChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendAiChatMessage();
  }
}

export function autoResizeAiInput() {
  const input = document.getElementById('ai-chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

export async function copyLastAiPrompt() {
  const text = lastContextPrompt || thread.find((m) => m.kind === 'context')?.content || '';
  if (!text) {
    appendSystemNote('Ще немає промпта — спочатку запустіть аналіз.');
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    appendSystemNote('Промпт скопійовано в буфер.');
  } catch {
    appendSystemNote('Не вдалося скопіювати промпт.');
  }
}

function syncLlmSettingsForm() {
  const s = getLlmSettings();
  const hasKey = Boolean(s.apiKey);
  const provider = normalizeProvider(s.provider);
  const keyEl = document.getElementById('llm-api-key');
  const status = document.getElementById('llm-key-status');
  const card = document.getElementById('llm-key-card');
  const intro = document.getElementById('llm-settings-intro');
  const entry = document.getElementById('llm-key-entry');
  const saveBtn = document.getElementById('btn-llm-save');
  const delBtn = document.getElementById('btn-llm-clear');
  if (keyEl) {
    keyEl.value = '';
    keyEl.placeholder = 'Вставте ключ сюди';
  }
  paintProviderDropdown(provider);
  const model = normalizeModel(provider, s.model);
  fillModelOptions(provider);
  paintModelDropdown(model);
  if (intro) {
    intro.textContent = hasKey
      ? 'На цьому пристрої вже є один ключ. Провайдера і модель можна змінити в списках. Щоб поставити інший ключ — видаліть цей.'
      : 'Вставте ключ, оберіть провайдера і модель. Зберігається лише один ключ — у цьому браузері.';
  }
  if (card) {
    if (hasKey) {
      card.classList.add('is-on');
      const name = providerLabel(provider);
      const chosen = modelLabel(provider, model);
      card.textContent = name
        ? `Активний ключ ${maskLlmKey(s.apiKey)} · ${name}${chosen ? ` · ${chosen}` : ''}`
        : `Активний ключ ${maskLlmKey(s.apiKey)} — оберіть провайдера`;
    } else {
      card.classList.remove('is-on');
      card.textContent = 'Ключа немає — оберіть провайдера, вставте ключ і збережіть';
    }
  }
  if (entry) entry.hidden = hasKey;
  if (saveBtn) saveBtn.hidden = hasKey;
  if (delBtn) delBtn.hidden = !hasKey;
  if (status) {
    status.textContent = '';
    status.style.color = 'var(--text-secondary)';
  }
  syncAiEntryButtons();
}

function setLlmSettingsStatus(text, isError = false) {
  const status = document.getElementById('llm-key-status');
  if (!status) return;
  status.textContent = text;
  status.style.color = isError ? 'var(--sys-red)' : 'var(--text-secondary)';
}

function appendSystemNote(text) {
  const log = document.getElementById('ai-chat-log');
  if (!log) return;
  const pinned = isNearBottom(log);
  const keepTop = log.scrollTop;
  const note = document.createElement('div');
  note.className = 'ai-chat-note';
  note.textContent = text;
  log.appendChild(note);
  if (pinned) log.scrollTop = log.scrollHeight;
  else log.scrollTop = keepTop;
}

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
}

function renderAiThread(opts = {}) {
  const log = document.getElementById('ai-chat-log');
  if (!log) return;
  const pinned = opts.stick === true || isNearBottom(log);
  const keepTop = log.scrollTop;
  log.innerHTML = thread
    .map((m, i) => {
      if (m.kind === 'context') return '';
      const live = busy && i === thread.length - 1 && m.role === 'assistant';
      if (live && !String(m.content || '').trim()) {
        return `<div class="ai-chat-bubble ai-chat-bubble--bot ai-chat-bubble--wait">
          <button type="button" class="ai-skrynia-loader" data-action="stopAiChat" title="Зупинити" aria-label="Зупинити Скриню">
            <span class="ai-skrynia-loader-ring"></span>
            <span class="ai-skrynia-loader-gem">💎</span>
          </button>
          <div class="ai-chat-wait-text">Скриня думає…</div>
          <div class="ai-chat-wait-hint">Натисніть діамант, щоб зупинити</div>
        </div>`;
      }
      const who = m.role === 'assistant' ? 'ШІ' : 'Ви';
      const cls = m.role === 'assistant' ? 'ai-chat-bubble--bot' : 'ai-chat-bubble--user';
      const caret = live ? '<span class="ai-caret" aria-hidden="true"></span>' : '';
      const chips = m.role === 'assistant' ? renderSuggestChips(m, i) : '';
      return `<div class="ai-chat-bubble ${cls}"><div class="ai-chat-who">${who}</div><div class="ai-chat-text">${formatAiHtml(m.content)}${caret}</div></div>${chips}`;
    })
    .join('');
  if (pinned) log.scrollTop = log.scrollHeight;
  else log.scrollTop = keepTop;
  schedulePersistAiChat();
}

function formatAiHtml(text) {
  return formatAiMarkdown(text || '');
}

function lastVisibleAssistantIndex() {
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    if (thread[i].kind === 'context') continue;
    if (thread[i].role === 'assistant' && String(thread[i].content || '').trim()) return i;
  }
  return -1;
}

function renderSuggestChips(m, index) {
  if (busy || remainingLockSec() > 0 || index !== lastVisibleAssistantIndex()) return '';
  if (isTransientAiError(m.content)) return '';
  const lastUser = [...thread].reverse().find((x) => x.kind === 'user');
  const chips = Array.isArray(m.suggestions) && m.suggestions.length
    ? m.suggestions.slice(0, 4)
    : defaultSuggestions({
        kind: lastBriefingKind || briefingKindFromThread(thread),
        lastQuestion: lastUser?.content,
        parsed: thread.find((x) => x.kind === 'context')?.focus,
      });
  if (!chips.length) return '';
  return `<div class="ai-chat-suggest">${chips
    .map(
      (chip) =>
        `<button type="button" class="ai-chat-chip ai-chat-chip--suggest" data-action="sendAiSuggestion" data-args='${escapeHtml(JSON.stringify([chip]))}'>${escapeHtml(chip)}</button>`,
    )
    .join('')}</div>`;
}

function localSkryniaReply(text) {
  const s = String(text || '').trim();
  if (/^(дякую|спасибо|thanks|thank you|ок|ok|окей|добре|зрозумів|понял|ясно|супер|👍+)[.!?…]*$/i.test(s)) {
    return 'Гаразд. Якщо буде конкретне питання по цифрах Скрині — напишіть.';
  }
  if (/в мережі|в сети|погугл|з інтернету|из интернета|search (the )?web|загугли/i.test(s)) {
    return 'Ні. Скриня не ходить в інтернет і не підтягує тривалість курсів із сайтів. Якщо строк є в треку — відповім по ньому; якщо немає — допишіть у трек.';
  }
  return null;
}

function apiPayload(opts = {}) {
  return buildChatApiMessages(thread, {
    ...opts,
    kind: opts.kind || lastBriefingKind || briefingKindFromThread(thread),
  });
}

async function streamAssistant(opts = {}) {
  if (busy) return;
  const userId = deps?.getUserId();
  if (!userId) return;
  const settings = getLlmSettings();
  if (!settings.apiKey) {
    openLlmSettings();
    return;
  }
  const provider = normalizeProvider(settings.provider);
  if (!provider) {
    openLlmSettings();
    setLlmSettingsStatus('Оберіть провайдера цього ключа', true);
    return;
  }

  busy = true;
  setComposerBusy(true);
  abortCtrl = new AbortController();
  if (!opts.continue) {
    thread.push({
      role: 'assistant',
      content: '',
      kind: 'assistant',
      source: opts.briefing ? 'briefing' : opts.wide ? 'wide' : 'chat',
    });
  }
  renderAiThread({ stick: true });

  try {
    const res = await apiFetch('/api/ai/chat', {
      method: 'POST',
      signal: abortCtrl.signal,
      body: JSON.stringify({
        userId,
        apiKey: settings.apiKey,
        provider,
        model: normalizeModel(provider, settings.model),
        maxOutputTokens: opts.briefing || opts.wide || opts.continue ? 16384 : 4096,
        system: buildSystemPrompt(),
        messages: apiPayload(opts),
      }),
    });

    const ctype = res.headers.get('content-type') || '';
    if (!res.ok || !ctype.includes('text/event-stream')) {
      let err = 'Не вдалося звернутися до ШІ';
      try {
        const data = await res.json();
        if (data?.error) err = data.error;
        const retry = Number(data?.retryAfter);
        if (res.status === 429) {
          if (retry > 0 && !String(err).includes('після')) {
            const when = new Intl.DateTimeFormat('uk-UA', {
              timeZone: 'Europe/Kyiv',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(Date.now() + retry * 1000));
            err = `${err.replace(/\.*$/, '')}. Спробуйте після ${when}.`;
          }
          applyProviderLock(retry || parseWaitSecFromText(err) || 45);
        }
      } catch {
        /* ignore */
      }
      if (opts.continue) {
        appendSystemNote(err);
        renderAiThread();
        return;
      }
      thread[thread.length - 1].content = err;
      renderAiThread();
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      thread[thread.length - 1].content = 'Порожня відповідь';
      renderAiThread();
      return;
    }

    const decoder = new TextDecoder();
    let buf = '';
    const bot = thread[thread.length - 1];
    let providerTruncated = false;
    let providerFailed = false;
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
          if (json.error) {
            providerFailed = true;
            const err = String(json.error);
            appendSystemNote(isProviderCapacityError(err) ? PROVIDER_BUSY_NOTE : err);
            if (isProviderCapacityError(err) || /Ліміт провайдера|Забагато запитів|Денна квота/.test(err)) {
              applyProviderLock(parseWaitSecFromText(err) || 45);
            }
          } else if (json.truncated) {
            providerTruncated = true;
          } else if (json.t) {
            if (isProviderCapacityError(json.t)) {
              providerFailed = true;
              appendSystemNote(PROVIDER_BUSY_NOTE);
              applyProviderLock(45);
            } else {
              bot.content += json.t;
            }
          }
        } catch {
          /* ignore keep-alives */
        }
      }
      renderAiThread();
    }
    const cleaned = stripProviderNoise(bot.content);
    if (cleaned !== bot.content) {
      providerFailed = true;
      bot.content = cleaned;
      appendSystemNote(PROVIDER_BUSY_NOTE);
      applyProviderLock(45);
    }
    if (!bot.content.trim()) {
      bot.content = providerFailed ? PROVIDER_BUSY_NOTE : 'Порожня відповідь від моделі.';
    } else {
      const split = splitSuggestions(bot.content);
      if (split.body) bot.content = split.body;
      if (split.suggestions.length) bot.suggestions = split.suggestions;
    }
    const expectReport = Boolean(
      opts.briefing || opts.wide || opts.continue || /HELICOPTER VIEW|КАПІТАЛ ЗАРАЗ/i.test(bot.content || ''),
    );
    if (
      !providerFailed &&
      remainingLockSec() <= 0 &&
      (providerTruncated || looksTruncatedAiReply(bot.content, { expectReport }))
    ) {
      appendSystemNote('Звіт обірвався. Напишіть «продовж», якщо треба дописати.');
    }
    renderAiThread();
  } catch (err) {
    if (err?.name === 'AbortError') {
      const bot = thread[thread.length - 1];
      if (bot && !String(bot.content || '').trim()) {
        bot.content = 'Скриня зупинилась.';
      }
    } else {
      const bot = thread[thread.length - 1];
      if (bot) bot.content = bot.content || 'Помилка з\'єднання з ШІ.';
    }
    renderAiThread();
  } finally {
    busy = false;
    abortCtrl = null;
    setComposerBusy(false);
    persistAiChatNow();
  }
}

function remainingLockSec() {
  return Math.max(0, Math.ceil((providerUnlockAt - Date.now()) / 1000));
}

function parseWaitSecFromText(text) {
  const s = String(text || '');
  const sec = s.match(/через\s+(\d+)\s*с\b/i);
  if (sec) return Number(sec[1]);
  const min = s.match(/через\s+(\d+)\s*хв\b/i);
  if (min) return Number(min[1]) * 60;
  const hr = s.match(/через\s+(\d+)\s*год\b/i);
  if (hr) return Number(hr[1]) * 3600;
  return null;
}

function formatLockButton(sec) {
  if (sec < 90) return `Зачекайте ${sec} с`;
  if (sec < 90 * 60) return `Зачекайте ${Math.ceil(sec / 60)} хв`;
  const when = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(Date.now() + sec * 1000));
  return `Після ${when}`;
}

function applyProviderLock(retryAfterSec) {
  const sec = Math.max(15, Math.ceil(Number(retryAfterSec) || 45));
  providerUnlockAt = Math.max(providerUnlockAt, Date.now() + sec * 1000);
  if (unlockTimer) clearInterval(unlockTimer);
  paintComposer();
  unlockTimer = setInterval(() => {
    if (remainingLockSec() <= 0) {
      clearInterval(unlockTimer);
      unlockTimer = null;
    }
    paintComposer();
  }, 1000);
}

function paintComposer() {
  const send = document.getElementById('ai-chat-send');
  const input = document.getElementById('ai-chat-input');
  const chips = document.getElementById('ai-chat-chips');
  const left = remainingLockSec();
  if (chips) {
    chips.style.opacity = busy || left > 0 ? '0.55' : '1';
    chips.style.pointerEvents = busy || left > 0 ? 'none' : '';
  }
  if (input) input.disabled = busy;
  if (!send) return;
  if (busy) {
    send.disabled = false;
    send.textContent = 'Зупинити';
    send.setAttribute('data-action', 'stopAiChat');
    send.classList.add('ai-chat-stop');
    return;
  }
  send.classList.remove('ai-chat-stop');
  send.setAttribute('data-action', 'sendAiChatMessage');
  if (left > 0) {
    send.disabled = true;
    send.textContent = formatLockButton(left);
    return;
  }
  send.disabled = false;
  send.textContent = 'Надіслати';
}

function setComposerBusy(isBusy) {
  void isBusy;
  paintComposer();
}
