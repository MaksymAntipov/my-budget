import {
  TRACK_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  trackName,
  emptyDoc,
  listSequenceChains,
} from './model.js';
import { fetchDocFromServer, loadDocLocal } from './api.js';

/**
 * Load year-tracks doc for AI export (server → local fallback).
 * @param {{ apiUrl?: string, userId?: string, authenticated?: boolean }} session
 */
export async function loadYearTracksForAiExport(session = {}) {
  const userId = session.userId;
  if (!userId) return emptyDoc();
  return fetchDocFromServer({
    apiUrl: session.apiUrl || '',
    userId,
    authenticated: session.authenticated !== false && Boolean(userId),
  });
}

/**
 * Sync fallback if caller already has local cache only.
 * @param {string} userId
 */
export function loadYearTracksLocalForAiExport(userId) {
  return loadDocLocal(userId) || emptyDoc();
}

/**
 * Build a compact markdown section for budget / growth AI prompts.
 * @param {import('./model.js').YearTracksDoc | null | undefined} doc
 * @param {{ years?: number[], preferYear?: number, compact?: boolean }} [opts]
 * @returns {string} empty string if nothing useful
 */
export function buildYearTracksAiSection(doc, opts = {}) {
  const boards = doc?.boards && typeof doc.boards === 'object' ? doc.boards : null;
  if (!boards) return '';

  let years = Array.isArray(opts.years) && opts.years.length
    ? [...new Set(opts.years.map(Number).filter((y) => Number.isFinite(y)))]
    : Object.keys(boards)
        .map(Number)
        .filter((y) => Number.isFinite(y));

  years.sort((a, b) => a - b);

  /** Prefer current year first when exporting a single month context. */
  if (opts.preferYear != null && years.includes(Number(opts.preferYear))) {
    const pref = Number(opts.preferYear);
    years = [pref, ...years.filter((y) => y !== pref)];
  }

  const yearBlocks = [];
  for (const year of years) {
    const board = boards[String(year)];
    const tracks = Array.isArray(board?.tracks) ? board.tracks : [];
    if (!tracks.length) continue;

    const counts = { active: 0, paused: 0, plain: 0, done: 0, blocked: 0, dropped: 0 };
    tracks.forEach((t) => {
      const s = t?.status && counts[t.status] != null ? t.status : 'plain';
      counts[s] += 1;
    });

    const live = tracks.filter((t) => t?.status !== 'dropped');
    const dropped = tracks.filter((t) => t?.status === 'dropped');

    let block = `Рік: ${year}\n`;
    block += `Коротко: ${counts.active} активних / ${counts.paused} на паузі / ${counts.blocked} заблоковано / ${counts.done} завершено`;
    if (counts.plain) block += ` / ${counts.plain} без мітки`;
    if (counts.dropped) block += ` / ${counts.dropped} не робити`;
    block += `\n`;
    block += formatStatusIndex(live);
    block += formatSequenceBlock(live);
    const byId = new Map(live.map((t) => [t.id, t]));
    const ordered = orderLiveTracks(live);
    for (const track of ordered) {
      const pred = track.afterId ? byId.get(track.afterId) : null;
      block += formatTrack(track, pred ? trackName(pred) : '');
    }
    if (dropped.length) {
      block += `\nНЕ РОБИТИ (свідоме ні — не став головним курсом; не роби вигляд, що треку немає):\n`;
      dropped.forEach((t) => {
        const name = trackName(t);
        const reason =
          typeof t.statusReason === 'string' && t.statusReason.trim()
            ? t.statusReason.trim()
            : '(не вказано)';
        block += `- «${name}» — ${reason}\n`;
      });
    }
    yearBlocks.push(block.trimEnd());
  }

  if (!yearBlocks.length) return '';

  let out = `\n### РІЧНІ ТРЕКИ (пріоритети, не фінанси)\n`;
  out += `Стадії (Очікує / В процесі / Готово) — єдине джерело, чи крок закритий. Не пиши що етап «пройшов», якщо стадія не «Готово». Каса (частина ЗП, платіж) стадію не закриває.\n`;
  out += `Завершений трек — свіжіший факт, ніж анкета росту: якщо анкета («точка А») каже інше (наприклад, бізнес ще працює, а трек «Продано» завершено) — довіряй треку, розбіжність назви одним рядком і порадь оновити анкету.\n`;
  if (opts.compact) {
    out += `Короткий список статусів, зв'язків і стадій.\n\n`;
  } else {
    out += `Це мої життєві/робочі пріоритети на рік. У кожному році є блоки СТАТУСИ і ЗВ'ЯЗКИ — читай їх обов'язково, не кажи що цього немає в Скрині.\n`;
    out += `Аналізуй активні, на паузі і заблоковані — пауза/блокер ≠ «пропусти» і ≠ «НЕ РОБИТИ». Кожен заблокований трек обов'язковий у відповіді: чи блокер валідний і як зняти. Для паузи: чи ще виправдана відносно цілей. «НЕ РОБИТИ» — свідоме ні: не став головним курсом, але не виключай з аналізу; якщо відмова ріже точку Б — назви ціну.\n`;
    out += `Блок «ЗВ'ЯЗКИ / ПОСЛІДОВНІСТЬ» — обов'язковий порядок «що за чим» (стрілка «→» = потім). Не пропонуй наступний трек раніше попередника; треки без стрілки можна вести паралельно. У діях поважай «потім», але перевір, чи сама послідовність не блокує важливіший важіль.\n`;
    out += `Найменший опір — лінза, не заборона: якщо є легший маршрут тими самими треками й він дістає до цілі — згадай його. Важчий шлях дозволений і бажаний, якщо він сильніше б'є в точку Б. Не ховай заблоковані треки за «найменшим опором».\n\n`;
  }
  out += yearBlocks.join('\n\n');
  out += `\n`;
  return out;
}

/** @param {import('./model.js').TrackStatus | undefined} status */
function statusRank(status) {
  if (status === 'blocked') return 0;
  if (status === 'active') return 1;
  if (status === 'paused') return 2;
  if (status === 'plain') return 3;
  if (status === 'done') return 4;
  return 5;
}

/**
 * @param {import('./model.js').YearTrack[]} tracks
 * @returns {string}
 */
function formatStatusIndex(tracks) {
  const groups = {
    active: [],
    paused: [],
    blocked: [],
    done: [],
    plain: [],
  };
  for (const t of tracks) {
    const key = groups[t?.status] ? t.status : 'plain';
    const name = `«${trackName(t)}»`;
    const reason =
      typeof t.statusReason === 'string' && t.statusReason.trim()
        ? ` (${t.status === 'paused' ? 'пауза' : t.status === 'blocked' ? 'блокер' : 'причина'}: ${t.statusReason.trim()})`
        : '';
    groups[key].push(`${name}${reason}`);
  }
  let s = `СТАТУСИ:\n`;
  s += `- Активні: ${groups.active.join(', ') || 'немає'}\n`;
  s += `- На паузі: ${groups.paused.join(', ') || 'немає'}\n`;
  s += `- Заблоковано: ${groups.blocked.join(', ') || 'немає'}\n`;
  s += `- Завершено: ${groups.done.join(', ') || 'немає'}\n`;
  if (groups.plain.length) s += `- Без мітки: ${groups.plain.join(', ')}\n`;
  return s;
}

function formatSequenceBlock(tracks) {
  const chains = listSequenceChains(tracks);
  const linked = chains.filter((c) => c.length >= 2);
  const inLinked = new Set(linked.flat().map((t) => t.id));
  const parallel = chains
    .filter((c) => c.length === 1 && !inLinked.has(c[0].id))
    .map((c) => c[0]);

  if (!linked.length) {
    return `ЗВ'ЯЗКИ: немає стрілок «потім» — усі живі треки паралельні.\n`;
  }

  let s = `ЗВ'ЯЗКИ / ПОСЛІДОВНІСТЬ (що за чим; «→» = потім, не раніше):\n`;
  linked.forEach((chain) => {
    s += `- ${chain.map((t) => `«${trackName(t)}»`).join(' → ')}\n`;
  });
  if (parallel.length) {
    s += `Паралельно (без «потім»): ${parallel.map((t) => `«${trackName(t)}»`).join(', ')}\n`;
  }
  return s;
}

/**
 * Linked chains first (predecessor → successor), then the rest by status.
 * @param {import('./model.js').YearTrack[]} tracks
 */
function orderLiveTracks(tracks) {
  const chains = listSequenceChains(tracks);
  const seen = new Set();
  /** @type {import('./model.js').YearTrack[]} */
  const out = [];
  for (const chain of chains.filter((c) => c.length >= 2)) {
    for (const t of chain) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  const rest = tracks
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => statusRank(a?.status) - statusRank(b?.status));
  return [...out, ...rest];
}

/**
 * @param {import('./model.js').YearTrack} track
 * @param {string} [predName]
 */
function formatTrack(track, predName = '') {
  const name = trackName(track);
  const status = track?.status || 'plain';
  const statusLabel = TRACK_STATUS_LABELS[status] || status;
  const stages = Array.isArray(track?.stages) ? track.stages : [];
  const workStages = stages.slice(1); // [0] = track title
  const afterLine = predName
    ? `  Після: «${predName}» (не починати раніше)\n`
    : `  Після: немає (паралельний)\n`;

  if (status === 'done') {
    // The stages say what was finished («Продано»): without them the name alone reads as «still running».
    let done = `\nТрек: «${name}»\n  Статус: Завершено — це вже факт, не пропонуй робити знову\n${afterLine}`;
    if (workStages.length) {
      done += `  Що зроблено:\n`;
      workStages.forEach((s) => {
        const st = s.status === 'doing' || s.status === 'done' ? s.status : 'todo';
        done += `    - ${stageTitle(s)} — ${STAGE_STATUS_LABELS[st]}\n`;
      });
    }
    return done;
  }

  let lines = `\nТрек: «${name}»\n  Статус: ${statusLabel}\n`;
  lines += afterLine;
  if (status === 'blocked' || status === 'paused') {
    const reason =
      typeof track.statusReason === 'string' && track.statusReason.trim()
        ? track.statusReason.trim()
        : typeof track.blockedReason === 'string'
          ? track.blockedReason.trim()
          : '';
    const label = status === 'paused' ? 'Пауза' : 'Блокер';
    lines += `  ${label}: ${reason || '(не вказано)'}\n`;
  }
  if (!workStages.length) {
    lines += `  Стадії: немає\n`;
    return lines;
  }
  lines += `  Стадії:\n`;
  workStages.forEach((s) => {
    const st = s.status === 'doing' || s.status === 'done' ? s.status : 'todo';
    lines += `    - ${stageTitle(s)} — ${STAGE_STATUS_LABELS[st]}\n`;
  });
  return lines;
}

/** @param {import('./model.js').TrackStage} stage */
function stageTitle(stage) {
  const t = typeof stage?.title === 'string' ? stage.title.trim() : '';
  return t || 'Без назви';
}
