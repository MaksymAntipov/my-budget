import { escapeHtml } from '../utils.js';

const SUGGEST_RE = /(?:^|\n)[ \t]*НАСТУПНІ ПИТАННЯ:[ \t]*\n([\s\S]*)$/i;

/** Split a trailing "НАСТУПНІ ПИТАННЯ" block from the visible answer. */
export function splitSuggestions(text) {
  const raw = String(text || '');
  const match = raw.match(SUGGEST_RE);
  if (!match) return { body: raw, suggestions: [] };
  const suggestions = match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim())
    .map((line) => line.replace(/^["«]|["»]$/g, '').trim())
    .filter((line) => line.length >= 8 && line.length <= 90)
    .slice(0, 4);
  const body = raw.slice(0, match.index).trimEnd();
  return { body, suggestions };
}

function inline(raw) {
  let t = escapeHtml(raw);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isSepRow(line) {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, '')));
}

function renderTable(lines) {
  const rows = lines.filter((l) => l.trim());
  if (rows.length < 2) return `<p>${rows.map(inline).join('<br>')}</p>`;
  const head = splitRow(rows[0]);
  const bodyRows = rows.slice(1).filter((l) => !isSepRow(l));
  const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((row) => `<tr>${splitRow(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

const BLOCK_START =
  /^(?:#{1,3}\s|\s*```|\s*\| |\s*\|[^\n]+\||\s*[-*•]\s+\S|\s*\d+[.)]\s+\S)/;

/** Safe markdown for assistant bubbles (headers, lists, tables, bold). */
export function formatAiMarkdown(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  if (!src.trim()) return '';
  const lines = src.split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const buf = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      html.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      const table = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        table.push(lines[i]);
        i += 1;
      }
      html.push(renderTable(table));
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const lvl = heading[1].length;
      html.push(`<h${lvl}>${inline(heading[2])}</h${lvl}>`);
      i += 1;
      continue;
    }

    if (/^\s*[-*•]\s+\S/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+\S/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*•]\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+\S/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+\S/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return html.join('');
}
