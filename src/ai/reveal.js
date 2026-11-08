// Smooth output of a streamed AI reply: text arrives in uneven bursts (Gemini sends whole paragraphs, Groq
// floods), the bubble shows it at an even pace instead. The pace follows the backlog, so the reveal never
// lags the stream by more than ~REVEAL_MAX_LAG_SEC however long the reply.

export const REVEAL_MIN_CPS = 90; // characters per second while little is waiting
export const REVEAL_MAX_LAG_SEC = 0.8;
const WORD_TAIL = 24; // finish the word being revealed, up to this many characters

/**
 * How much of `text` to show after `dtMs` of animation, given `shown` characters are on screen.
 * @param {number} shown @param {string} text @param {number} dtMs
 */
export function nextRevealLength(shown, text, dtMs) {
  const total = String(text || '').length;
  const from = Math.max(0, Math.min(Number(shown) || 0, total));
  if (from >= total) return total;
  const backlog = total - from;
  const cps = Math.max(REVEAL_MIN_CPS, backlog / REVEAL_MAX_LAG_SEC);
  // A long pause (background tab) does not dump the whole backlog at once; the backlog speed-up covers it.
  const dt = Math.max(0, Math.min(Number(dtMs) || 0, 100));
  let next = from + Math.max(1, Math.round((cps * dt) / 1000));
  if (next >= total) return total;
  const space = /\s/.exec(text.slice(next, next + WORD_TAIL));
  if (space) next += space.index;
  return Math.min(total, next);
}

/**
 * A cut-off prefix renders like the finished text: an open `**bold` or `` `code `` on the last line is closed
 * for display, so the markers never flash as literal characters.
 * @param {string} partial
 */
export function balanceMarkdown(partial) {
  const text = String(partial || '');
  const last = text.slice(text.lastIndexOf('\n') + 1);
  if (/^\s*```/.test(last)) return text; // an open fence already renders as code to the end
  let tail = '';
  if (((last.match(/\*\*/g) || []).length) % 2 === 1) tail += '**';
  const ticks = (last.replace(/```/g, '').match(/`/g) || []).length;
  if (ticks % 2 === 1) tail = '`' + tail;
  return text + tail;
}
