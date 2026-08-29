import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { decimalJsonSchema, decimalSchema, decimalToString, SUPPORTED_BROKERS } from './index.js';

describe('canonical primitives', () => {
  it('exposes initial broker identifiers without restricting future broker IDs', () => {
    expect(SUPPORTED_BROKERS).toEqual(['robinhood', 'ibkr', 'webull']);
  });

  it('parses decimal strings into Decimal instances without floating-point arithmetic', () => {
    const oneTenth = decimalSchema.parse('0.10');
    const twoTenths = decimalSchema.parse('0.20');

    expect(oneTenth).toBeInstanceOf(Decimal);
    expect(oneTenth.plus(twoTenths).equals('0.30')).toBe(true);
    expect(decimalSchema.safeParse(0.1).success).toBe(false);
  });

  it('serializes decimals as non-exponential JSON strings', () => {
    const serialized = decimalJsonSchema.parse(new Decimal('1000000000000000000000000000000'));

    expect(serialized).toBe('1000000000000000000000000000000');
    expect(decimalToString(new Decimal('186.70'))).toBe('186.7');
    expect(JSON.stringify({ realizedPnl: serialized })).toBe(
      '{"realizedPnl":"1000000000000000000000000000000"}',
    );
  });
});
