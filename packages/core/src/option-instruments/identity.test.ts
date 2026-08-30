import { optionInstrumentSchema, type OptionInstrumentInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { createOptionInstrumentKey, sameOptionInstrument } from './identity.js';

const baseOption: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function option(override: Partial<OptionInstrumentInput> = {}) {
  return optionInstrumentSchema.parse({ ...baseOption, ...override });
}

describe('canonical option instrument identity', () => {
  it('creates a deterministic key from every identity field', () => {
    expect(createOptionInstrumentKey(option())).toBe('NVDA|2026-09-18|180|call|100');
    expect(createOptionInstrumentKey(option())).toBe(createOptionInstrumentKey(option()));
  });

  it('treats Decimal-equivalent strikes as the same contract', () => {
    const whole = option({ strike: '180' });
    const scaled = option({ strike: '180.000' });

    expect(createOptionInstrumentKey(whole)).toBe(createOptionInstrumentKey(scaled));
    expect(sameOptionInstrument(whole, scaled)).toBe(true);
  });

  it.each([
    ['underlying', { underlying: 'AAPL' }],
    ['expiration', { expiration: '2026-10-16' }],
    ['strike', { strike: '180.5' }],
    ['option type', { optionType: 'put' as const }],
    ['multiplier', { multiplier: 10 }],
  ])('distinguishes a different %s', (_field, override) => {
    const original = option();
    const changed = option(override);

    expect(createOptionInstrumentKey(changed)).not.toBe(createOptionInstrumentKey(original));
    expect(sameOptionInstrument(changed, original)).toBe(false);
  });

  it('does not collide for delimiter-like canonical symbol characters', () => {
    const dotSymbol = option({ underlying: 'BRK.B' });
    const dashSymbol = option({ underlying: 'BRK-B' });

    expect(createOptionInstrumentKey(dotSymbol)).not.toBe(createOptionInstrumentKey(dashSymbol));
  });
});
