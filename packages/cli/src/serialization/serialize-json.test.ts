import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { serializeJson } from './serialize-json.js';

describe('serializeJson', () => {
  it('converts nested Decimal values to canonical strings without leaking internals', () => {
    const serialized = serializeJson({
      grossRealizedPnl: new Decimal('163.700'),
      legs: [{ quantity: new Decimal('0.875'), absent: undefined }],
    });

    expect(JSON.parse(serialized)).toEqual({
      grossRealizedPnl: '163.7',
      legs: [{ quantity: '0.875' }],
    });
    expect(serialized).not.toContain('"d"');
    expect(serialized).not.toContain('"e"');
    expect(serialized).not.toContain('"s"');
    expect(serialized.endsWith('\n')).toBe(true);
  });

  it('rejects values that cannot form a reliable JSON document', () => {
    expect(() => serializeJson(Number.NaN)).toThrow('non-finite');
    expect(() => serializeJson(undefined)).toThrow('undefined');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => serializeJson(circular)).toThrow('circular');
  });

  it('never uses exponent notation for extreme Decimal values', () => {
    const serialized = serializeJson({
      large: new Decimal('1000000000000000000000000000000'),
      small: new Decimal('0.000000000000000000000001'),
    });

    expect(JSON.parse(serialized)).toEqual({
      large: '1000000000000000000000000000000',
      small: '0.000000000000000000000001',
    });
    expect(serialized.toLowerCase()).not.toMatch(/\d+e[+-]?\d+/);
  });
});
