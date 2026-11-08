import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAiMarkdown, splitSuggestions } from './markdown.js';

describe('formatAiMarkdown', () => {
  it('renders headings, lists, bold and tables', () => {
    const html = formatAiMarkdown(
      '## ТАКТИКА\n\n- кава: **400** ₴\n- хліб: 80 ₴\n\n| Місяць | Сума |\n| --- | --- |\n| Березень | 1200 |',
    );
    assert.match(html, /<h3 class="ai-sec ai-sec--growth">ТАКТИКА<\/h3>/);
    assert.match(html, /<ul><li>кава: <strong>400<\/strong> ₴<\/li>/);
    assert.match(html, /<th>Місяць<\/th>/);
    assert.match(html, /<td>1200<\/td>/);
  });

  it('turns report section titles into section headings, however the model writes them', () => {
    const html = formatAiMarkdown(
      '**ГОЛОВНЕ**\nВільні гроші: **10 600 ₴**.\n\n## КАПІТАЛ ЗАРАЗ\nКонверти.\nРИЗИКИ:\nОдин дохід.\n**ДЕ КАПІТАЛ ВИТІКАЄ**:\nОренда.\nHELICOPTER VIEW — розрив 58 000 ₴\n**НА ПОДУМАТИ:** темп',
    );

    assert.equal(
      html,
      '<h3 class="ai-sec">ГОЛОВНЕ</h3><p>Вільні гроші: <strong>10 600 ₴</strong>.</p>'
        + '<h3 class="ai-sec">КАПІТАЛ ЗАРАЗ</h3><p>Конверти.</p>'
        + '<h3 class="ai-sec">РИЗИКИ</h3><p>Один дохід.</p>'
        + '<h3 class="ai-sec">ДЕ КАПІТАЛ ВИТІКАЄ</h3><p>Оренда.</p>'
        + '<h3 class="ai-sec ai-sec--growth">HELICOPTER VIEW</h3><p>розрив 58 000 ₴</p>'
        + '<h3 class="ai-sec ai-sec--growth">НА ПОДУМАТИ</h3><p>темп</p>',
    );
  });

  it('leaves ordinary headings and short caps in text alone', () => {
    const html = formatAiMarkdown('## Подушка безпеки\nUSD 1200\nОК, ПДФО 18%');

    assert.equal(html, '<h2>Подушка безпеки</h2><p>USD 1200<br>ОК, ПДФО 18%</p>');
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
