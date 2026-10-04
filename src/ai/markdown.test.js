import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAiMarkdown, splitSuggestions } from './markdown.js';

describe('formatAiMarkdown', () => {
  it('renders headings, lists, bold and tables', () => {
    const html = formatAiMarkdown(
      '## ТАКТИКА\n\n- кава: **400** ₴\n- хліб: 80 ₴\n\n| Місяць | Сума |\n| --- | --- |\n| Березень | 1200 |',
    );
    assert.match(html, /<h2>ТАКТИКА<\/h2>/);
    assert.match(html, /<ul><li>кава: <strong>400<\/strong> ₴<\/li>/);
    assert.match(html, /<th>Місяць<\/th>/);
    assert.match(html, /<td>1200<\/td>/);
  });

  it('escapes html', () => {
    const html = formatAiMarkdown('<script>x</script>');
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe('splitSuggestions', () => {
  it('strips the trailing questions block', () => {
    const { body, suggestions } = splitSuggestions(
      'Відкладіть 5000 ₴.\n\nНАСТУПНІ ПИТАННЯ:\n- Скільки на подушку?\n- Який борг першим?\n- Де різати витрати?',
    );
    assert.equal(body, 'Відкладіть 5000 ₴.');
    assert.deepEqual(suggestions, [
      'Скільки на подушку?',
      'Який борг першим?',
      'Де різати витрати?',
    ]);
  });
});
