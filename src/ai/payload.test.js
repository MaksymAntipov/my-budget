import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatApiMessages,
  clipContextForContinue,
  defaultSuggestions,
  looksTruncatedAiReply,
  stripProviderNoise,
  summarizeBriefing,
} from './payload.js';

describe('summarizeBriefing', () => {
  it('keeps section headers when clipping', () => {
    const long = `HELICOPTER VIEW\n${'а'.repeat(2000)}\n\nТАКТИКА\n${'б'.repeat(2000)}\n\nНА ПОДУМАТИ\n${'в'.repeat(2000)}`;
    const out = summarizeBriefing(long, 1200);
    assert.match(out, /HELICOPTER VIEW/);
    assert.match(out, /ТАКТИКА/);
    assert.match(out, /НА ПОДУМАТИ/);
    assert.ok(out.length <= 1200 + 20);
  });
});

describe('buildChatApiMessages', () => {
  it('keeps briefing summary plus the latest question', () => {
    const thread = [
      { role: 'user', kind: 'context', mode: 'data', content: 'DUMP' },
      {
        role: 'assistant',
        kind: 'assistant',
        source: 'briefing',
        content: 'HELICOPTER VIEW\nкурс ок\n\nТАКТИКА\nвідкладіть 4000',
      },
      { role: 'user', kind: 'user', content: 'розкрий тактику' },
    ];
    const msgs = buildChatApiMessages(thread);
    assert.equal(msgs[0].content, 'DUMP');
    assert.match(msgs[1].content, /Саммарі звіту/);
    assert.match(msgs[1].content, /ТАКТИКА/);
    assert.match(msgs[2].content, /розкрий тактику/);
    assert.equal(msgs.length, 3);
  });

  it('keeps a short tail of prior turns', () => {
    const thread = [
      { role: 'user', kind: 'context', content: 'DUMP' },
      { role: 'user', kind: 'user', content: 'перше' },
      { role: 'assistant', kind: 'assistant', content: 'відповідь один' },
      { role: 'user', kind: 'user', content: 'друге' },
    ];
    const msgs = buildChatApiMessages(thread);
    assert.equal(msgs[0].role, 'user');
    assert.match(msgs[0].content, /DUMP/);
    assert.equal(msgs[1].role, 'assistant');
    const joined = msgs.map((m) => m.content).join('\n');
    assert.match(joined, /перше/);
    assert.match(joined, /відповідь один/);
    assert.match(joined, /друге/);
  });

  it('opens a full helicopter path for a wide look', () => {
    const thread = [
      { role: 'user', kind: 'context', mode: 'wide', content: 'FULL DUMP' },
      {
        role: 'assistant',
        kind: 'assistant',
        source: 'briefing',
        content: 'HELICOPTER VIEW\nкурс ок',
      },
      { role: 'user', kind: 'user', content: 'Подивись на Скриню збоку' },
    ];
    const msgs = buildChatApiMessages(thread, { wide: true });
    const last = msgs[msgs.length - 1];
    assert.match(last.content, /погляд збоку/);
    assert.match(last.content, /HELICOPTER VIEW/);
    assert.equal(/відповідай лише на нього/.test(last.content), false);
    assert.match(msgs[1].content, /можна переглянути курс/);
  });

  it('asks a growth verdict on wide look after a growth briefing', () => {
    const thread = [
      { role: 'user', kind: 'context', label: 'Стратегія росту', mode: 'wide', content: 'FULL DUMP' },
      {
        role: 'assistant',
        kind: 'assistant',
        source: 'briefing',
        content: 'HELICOPTER VIEW\nкурс ок',
      },
      { role: 'user', kind: 'user', content: 'Подивись на Скриню збоку' },
    ];
    const msgs = buildChatApiMessages(thread, { wide: true, kind: 'growth' });
    const last = msgs[msgs.length - 1];
    assert.match(last.content, /стратег росту/);
    assert.match(last.content, /точка Б/);
    assert.match(last.content, /не роби головним/);
    assert.equal(/рамки на 90 днів/.test(last.content), false);
  });
});

describe('looksTruncatedAiReply', () => {
  it('flags a helicopter that never reached tactics', () => {
    assert.equal(
      looksTruncatedAiReply('1) HELICOPTER VIEW\nТвій курс рухається у проти', { expectReport: true }),
      true,
    );
  });

  it('does not flag a short chat answer', () => {
    assert.equal(looksTruncatedAiReply('Відкладіть 4000 ₴ цього місяця'), false);
  });

  it('accepts a finished three-block report', () => {
    const text = 'HELICOPTER VIEW\nкурс хибний.\n\nТАКТИКА\nвідкладіть 4000.\n\nНА ПОДУМАТИ\nінший шлях.';
    assert.equal(looksTruncatedAiReply(text, { expectReport: true }), false);
  });
});

describe('stripProviderNoise', () => {
  it('removes Gemini high-demand English from a half-written reply', () => {
    const raw =
      'Твоя головThis model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.на ціль';
    assert.equal(stripProviderNoise(raw), 'Твоя головна ціль');
  });
});

describe('clipContextForContinue', () => {
  it('keeps head and tail of a long dump', () => {
    const dump = `START-${'a'.repeat(20000)}-END`;
    const out = clipContextForContinue(dump, 100);
    assert.match(out, /START/);
    assert.match(out, /END/);
    assert.ok(out.length <= 110);
  });
});

describe('buildChatApiMessages continue', () => {
  it('keeps a clipped dump so continue still has numbers', () => {
    const thread = [
      { role: 'user', kind: 'context', content: 'DUMP каса 132000' },
      { role: 'assistant', kind: 'assistant', source: 'briefing', content: 'HELICOPTER VIEW\nу проти' },
    ];
    const msgs = buildChatApiMessages(thread, { continue: true });
    assert.match(msgs[0].content, /DUMP каса/);
    assert.equal(msgs[1].role, 'assistant');
    assert.match(msgs[1].content, /у проти/);
    assert.match(msgs[2].content, /обірвалась/);
    assert.equal(msgs.length, 3);
  });
});

describe('defaultSuggestions', () => {
  it('returns four unique chips and skips the last question', () => {
    const chips = defaultSuggestions({
      kind: 'analytics',
      lastQuestion: 'Скільки відкласти цього місяця?',
    });
    assert.equal(chips.length, 4);
    assert.equal(chips.includes('Скільки відкласти цього місяця?'), false);
  });

  it('uses growth chips after a growth briefing', () => {
    const chips = defaultSuggestions({ kind: 'growth' });
    assert.equal(chips.length, 4);
    assert.equal(chips.includes('Чи каса фінансує точку Б?'), true);
    assert.equal(chips.includes('Скільки відкласти цього місяця?'), false);
  });
});
