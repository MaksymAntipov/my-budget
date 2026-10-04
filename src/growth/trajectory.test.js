import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferDomainFromJob,
  inferOperationFromJob,
  inferRoleForDomain,
  migrateLegacyVectorIds,
  vectorLabel,
} from './trajectory.js';

describe('trajectory primitives', () => {
  it('infers IT vs HoReCa domain', () => {
    assert.equal(inferDomainFromJob('Senior QA в компании Megogo'), 'it');
    assert.equal(inferDomainFromJob("Кав'ярня Brooklyn hub"), 'trade');
  });

  it('maps legacy vectors to one primary path', () => {
    const ids = migrateLegacyVectorIds(
      'Вертикальний (ріст ЗП на поточній роботі)|Горизонтальний (нова компанія / сфера)'
    );
    assert.deepEqual(ids, ['same-seat', 'new-seat']);
    assert.equal(vectorLabel('own-operation'), 'Масштабую або чиню свою справу');
  });

  it('infers owner role outside IT', () => {
    assert.equal(
      inferRoleForDomain("Власник кав'ярні", 'trade', () => 'non-it'),
      'owner'
    );
  });

  it('infers own-operation P&L only from explicit words', () => {
    assert.equal(inferOperationFromJob('спеціаліст у наймі'), '');
    assert.equal(inferOperationFromJob('ФОП, послуги, в плюс'), 'profit');
    assert.equal(inferOperationFromJob('своя точка, поки в мінус'), 'loss');
  });
});
