import {
  displayName,
  relationLabelToSelf,
  GENDER_LABELS,
  DOC_STATUS_LABELS,
  showsMaidenName,
  birthPlaceFull,
} from './model.js';

/**
 * Build a ready-to-paste research prompt for any LLM / genealogy AI.
 * @param {import('./model.js').FamilyTree} tree
 * @returns {string}
 */
export function buildArchiveResearchPrompt(tree) {
  const people = tree.people || [];
  const links = tree.links || [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const self =
    people.find((p) => p.role === 'self') ||
    people.find((p) => p.id === tree.rootPersonId) ||
    people[0] ||
    null;

  // Local date: toISOString() is UTC and shows yesterday between 00:00 and 03:00 in Kyiv.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const personBlocks = people.map((p, i) => {
    const rel = relationLabelToSelf(p.id, tree) || '—';
    const lines = [
      `### ${i + 1}. ${displayName(p)}`,
      `- ID у дереві: ${p.id}`,
      `- Роль відносно «Я»: ${rel}`,
      `- Стать: ${GENDER_LABELS[p.gender] || 'Не вказано'}`,
      `- Прізвище: ${p.lastName || '—'}`,
      `- Імʼя: ${p.firstName || '—'}`,
      `- По батькові: ${p.patronymic || '—'}`,
    ];
    if (showsMaidenName(p) || p.maidenName) {
      lines.push(`- Дівоче прізвище: ${p.maidenName || '—'}`);
    }
    if (p.nameVariants) lines.push(`- Альтернативні написання: ${p.nameVariants}`);
    lines.push(
      `- Дата народження: ${formatDate(p.birthDate)}`,
      `- Дата смерті: ${formatDate(p.deathDate)}`,
      `- Дата шлюбу: ${formatDate(p.marriageDate)}`,
      `- Місце народження (село/місто): ${p.birthSettlement || '—'}`,
      `- Район: ${p.birthDistrict || '—'}`,
      `- Область: ${p.birthRegion || '—'}`,
      `- Повне місце народження: ${birthPlaceFull(p) || '—'}`,
      `- Історична назва місця: ${p.birthPlaceHistorical || '—'}`,
      `- Місце шлюбу: ${p.marriagePlace || '—'}`,
      `- Місце смерті: ${p.deathPlace || '—'}`,
      `- Поховання / цвинтар: ${p.burialPlace || '—'}`,
      `- Гіпотези сіл: ${p.placeHypotheses?.trim() || '—'}`,
      `- Свідоцтво про народження: ${DOC_STATUS_LABELS[p.docBirthStatus] || '—'}; акт: ${p.docBirthAct || '—'}`,
      `- Свідоцтво про шлюб: ${DOC_STATUS_LABELS[p.docMarriageStatus] || '—'}; акт: ${p.docMarriageAct || '—'}`,
      `- Свідоцтво про смерть: ${DOC_STATUS_LABELS[p.docDeathStatus] || '—'}; акт: ${p.docDeathAct || '—'}`,
      `- Призов: ${p.militaryDraftPlace || '—'}; звання: ${p.militaryRank || '—'}; частина: ${p.militaryUnit || '—'}`,
      `- Військові нотатки (ОБД / Памʼять народа): ${p.militaryNotes?.trim() || '—'}`,
      `- Нотатки: ${p.notes?.trim() || '—'}`,
    );
    return lines.join('\n');
  });

  const relationLines = links
    .map((l) => {
      const from = byId.get(l.fromId);
      const to = byId.get(l.toId);
      if (!from || !to) return null;
      if (l.type === 'spouse') {
        return `- Подружжя / партнери: «${displayName(from)}» ↔ «${displayName(to)}»`;
      }
      return `- Батько/мати → дитина: «${displayName(from)}» → «${displayName(to)}»`;
    })
    .filter(Boolean);

  const gaps = people
    .map((p) => {
      const missing = [];
      if (!p.firstName) missing.push('імʼя');
      if (!p.lastName) missing.push('прізвище');
      if (!p.patronymic) missing.push('по батькові');
      if (!p.birthDate) missing.push('дата народження');
      if (!p.birthSettlement && !p.birthPlace) missing.push('село/місто народження (КРИТИЧНО)');
      if (!p.birthDistrict) missing.push('район');
      if (!p.birthRegion) missing.push('область');
      if (!p.deathDate && looksHistorical(p)) missing.push('дата смерті (ймовірно)');
      if (!p.deathPlace && p.deathDate) missing.push('місце смерті');
      if (!p.burialPlace && p.deathDate) missing.push('цвинтар');
      if (!p.marriageDate && showsMaidenName(p)) missing.push('дата шлюбу');
      if (showsMaidenName(p) && !p.maidenName) missing.push('дівоче прізвище');
      if (p.docBirthStatus === 'unknown' || p.docBirthStatus === 'none') {
        missing.push('свідоцтво про народження');
      }
      if (!missing.length) return null;
      const priority = !p.birthSettlement && !p.birthPlace ? ' [пріоритет: географічний якір]' : '';
      return `- ${displayName(p)} (${relationLabelToSelf(p.id, tree) || 'родич'})${priority}: ${missing.join(', ')}`;
    })
    .filter(Boolean);

  const rootName = self ? displayName(self) : 'невідомо';

  return `# Дослідження сімейного дерева — запит до ШІ

Дата експорту: ${today}
Корінь дерева («Я»): ${rootName}
Кількість осіб: ${people.length}

## Завдання

Ти — генеалогічний дослідник. За наведеним сімейним деревом:

1. Знайди й зістав людей з відкритих архівів, метричних книг, ревізьких казок, переписів, військових списків, некрологів, Find a Grave, FamilySearch, Ancestry, MyHeritage, Geni, WikiTree, українських/польських/російських державних архівів (ЦДІАК, ДАДО, ДАКО, AGAD тощо), газет і краєзнавчих джерел.
2. Для кожної особи запропонуй **ймовірні збіги** (з оцінкою впевненості: висока / середня / низька) і **посиланнями на джерела**.
3. Заповни прогалини: дати, місця (село критично!), дівочі прізвища, акти РАЦС, батьків/дітей, яких ще немає в дереві, альтернативні написання імен.
4. Вкажи суперечності в даних (якщо є) і що перевірити далі.
5. Не вигадуй факти. Якщо даних немає — чесно напиши «не знайдено» і запропонуй, де шукати далі (фонд, роки, географія, РАЦС).
6. Гіпотези сіл у дереві позначені окремо — не плутай їх із підтвердженими фактами.

## Бажаний формат відповіді

Для кожної особи з дерева:

\`\`\`
### [ПІБ] — [роль]
- Збіги: ...
- Пропоновані уточнення полів: ...
- Можливі нові родичі (з обґрунтуванням звʼязку): ...
- Джерела: URL / назва архіву, фонд, опис, справа, аркуш
- Впевненість: висока | середня | низька
\`\`\`

Наприкінці додай короткий план наступних кроків дослідження (РАЦС → архів за селом → цвинтарі → військові бази).

## Особи в дереві

${personBlocks.length ? personBlocks.join('\n\n') : '_Дерево порожнє._'}

## Звʼязки

${relationLines.length ? relationLines.join('\n') : '_Звʼязків немає._'}

## Відомі прогалини (пріоритет для пошуку)

${gaps.length ? gaps.join('\n') : '_Явних прогалин немає — шукай підтвердження й розширення гілок._'}

## Контекст регіону

Переважно Україна / Східна Європа. Враховуй зміни кордонів, транскрипції прізвищ, жіночі форми прізвищ і дівочі прізвища. Без села архівний пошук майже сліпий — спочатку шукай географічний якір.
`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return '—';
  const s = String(value);
  const full = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) return `${full[3]}.${full[2]}.${full[1]}`;
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return `${ym[2]}.${ym[1]}`;
  const y = s.match(/^(\d{4})/);
  if (y) return y[1];
  return s;
}

/**
 * @param {import('./model.js').FamilyPerson} person
 * @returns {boolean}
 */
function looksHistorical(person) {
  const m = String(person.birthDate || '').match(/^(\d{4})/);
  if (!m) return false;
  const year = Number(m[1]);
  return year > 0 && year < 1950;
}

/**
 * Copy text to clipboard; fall back to a temporary textarea.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Download prompt as a .md file.
 * @param {string} text
 * @param {string} [filename]
 */
export function downloadPromptFile(text, filename = 'simeyne-derevo-prompt.md') {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
