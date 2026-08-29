import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { equityInstrumentSchema, optionInstrumentSchema } from './index.js';

describe('instrument schemas', () => {
  it('validates a canonical equity instrument', () => {
    expect(
      equityInstrumentSchema.parse({
        assetType: 'equity',
        symbol: 'BRK.B',
      }),
    ).toEqual({
      assetType: 'equity',
      symbol: 'BRK.B',
    });
  });

  it('validates an option using explicit contract identity and multiplier', () => {
    const option = optionInstrumentSchema.parse({
      assetType: 'option',
      underlying: 'NVDA',
      expiration: '2026-09-18',
      strike: '180.00',
      optionType: 'call',
      multiplier: 100,
    });

    expect(option.strike).toBeInstanceOf(Decimal);
    expect(option.strike.equals('180')).toBe(true);
    expect(option.multiplier).toBe(100);
  });

  it.each([
    ['invalid calendar date', { expiration: '2026-02-30' }],
    ['non-positive strike', { strike: '0' }],
    ['non-integer multiplier', { multiplier: 12.5 }],
    ['opaque option symbol', { symbol: 'NVDA260918C00180000' }],
  ])('rejects option data with %s', (_label, override) => {
    const result = optionInstrumentSchema.safeParse({
      assetType: 'option',
      underlying: 'NVDA',
      expiration: '2026-09-18',
      strike: '180',
      optionType: 'call',
      multiplier: 100,
      ...override,
    });

    expect(result.success).toBe(false);
  });
});
