import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferRoleFamilyFromJob,
  inferLevelFromJob,
  parseUsdAmount,
  mapMarketToGeos,
  compareTargetToBand,
  getBand,
  buildMarketAiSection,
} from './market-bands.js';

describe('market bands', () => {
  it('infers QA + Senior from a Megogo-style title', () => {
    assert.equal(inferRoleFamilyFromJob('Senior QA в компании Megogo'), 'qa-manual');
    assert.equal(inferLevelFromJob('Senior QA в компании Megogo'), 'senior');
  });

  it('parses $10k and UAH amounts', () => {
    assert.equal(parseUsdAmount('10000$'), 10000);
    assert.equal(parseUsdAmount('$5,000'), 5000);
    assert.equal(parseUsdAmount('133000 ₴', 41.5), 133000 / 41.5);
  });

  it('maps pay-more market to all geos', () => {
    const { currentGeo, targetGeos } = mapMarketToGeos('Де більше платять');
    assert.equal(currentGeo, 'ua');
    assert.deepEqual(targetGeos, ['ua', 'eu-remote', 'us-remote']);
  });

  it('marks $10k above UA senior QA p75', () => {
    const band = getBand('qa-manual', 'senior', 'ua');
    assert.equal(compareTargetToBand(band, 10000), 'above-market');
    assert.equal(compareTargetToBand(getBand('sdet', 'senior', 'us-remote'), 10000), 'within-p50');
  });

  it('builds a prompt block that forbids invented salaries', () => {
    const text = buildMarketAiSection({
      roleFamily: 'qa-manual',
      level: 'senior',
      market: 'Де більше платять',
      currentIncomeUsd: 3250,
      targetIncomeUsd: 10000,
      jobTitle: 'Senior QA в компании Megogo',
    });
    assert.match(text, /РИНОК \/ СТЕЛЯ ГРИ/);
    assert.match(text, /Не підміняй цифри/);
    assert.match(text, /ВИЩЕ p75/);
    assert.match(text, /SDET \/ US remote/);
    assert.match(text, /English B2\+/);
    assert.match(text, /не новий курс/);
  });

  it('keeps local-only off US/EU even if market is pay-more', () => {
    const { targetGeos } = mapMarketToGeos('Де більше платять', 'local-only');
    assert.deepEqual(targetGeos, ['ua']);
    const text = buildMarketAiSection({
      roleFamily: 'qa-manual',
      level: 'senior',
      market: 'Де більше платять',
      mobility: 'local-only',
      currentIncomeUsd: 3250,
      targetIncomeUsd: 10000,
    });
    assert.equal(text.includes('English B2+'), false);
    assert.match(text, /лише локально/);
  });

  it('returns UNKNOWN when the role family has no bands', () => {
    const text = buildMarketAiSection({
      roleFamily: 'owner',
      level: 'senior',
      domain: 'trade',
      market: 'Локальний (Свій регіон)',
      mobility: 'local-only',
    });
    assert.match(text, /UNKNOWN/);
    assert.match(text, /не вигадуй зарплатні цифри/i);
    assert.match(text, /суміжні ігри в ЦЬОМУ домені/);
  });
});
