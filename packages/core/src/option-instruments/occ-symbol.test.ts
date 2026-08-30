import { describe, expect, it } from 'vitest';

import {
  OCC_OPTION_DEFAULT_MULTIPLIER,
  OCC_OPTION_YEAR_CENTURY,
  parseOccOptionSymbol,
  type OccOptionSymbolParseResult,
} from './occ-symbol.js';

function unwrap(result: OccOptionSymbolParseResult) {
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.instrument;
}

describe('parseOccOptionSymbol', () => {
  it('parses a standard compact call symbol', () => {
    expect(unwrap(parseOccOptionSymbol('AAPL260918C00200000'))).toMatchObject({
      assetType: 'option',
      underlying: 'AAPL',
      expiration: '2026-09-18',
      optionType: 'call',
      multiplier: 100,
    });
  });

  it('parses a put symbol', () => {
    expect(unwrap(parseOccOptionSymbol('NVDA260918P00180000')).optionType).toBe('put');
  });

  it.each([
    ['whole-dollar', 'AAPL260918C00200000', '200'],
    ['2.5 fractional', 'F260918C00002500', '2.5'],
    ['17.5 fractional', 'GOOGL260918P00017500', '17.5'],
  ])('parses a %s strike without floating-point conversion', (_label, symbol, strike) => {
    expect(unwrap(parseOccOptionSymbol(symbol)).strike.toString()).toBe(strike);
  });

  it('supports short and six-character roots', () => {
    expect(unwrap(parseOccOptionSymbol('F260918C00002500')).underlying).toBe('F');
    expect(unwrap(parseOccOptionSymbol('ABC123260918P00180000')).underlying).toBe('ABC123');
  });

  it('supports a standard root padded to six characters', () => {
    expect(unwrap(parseOccOptionSymbol('AAPL  260918C00200000')).underlying).toBe('AAPL');
  });

  it('normalizes leading and trailing source whitespace', () => {
    expect(unwrap(parseOccOptionSymbol('  AAPL260918C00200000\r\n')).underlying).toBe('AAPL');
  });

  it('uses the explicit 2000-2099 two-digit year policy', () => {
    expect(OCC_OPTION_YEAR_CENTURY).toBe(2000);
    expect(unwrap(parseOccOptionSymbol('AAPL000121C00200000')).expiration).toBe('2000-01-21');
    expect(unwrap(parseOccOptionSymbol('AAPL991218C00200000')).expiration).toBe('2099-12-18');
  });

  it('defaults multiplier to 100 without claiming it came from the symbol', () => {
    expect(OCC_OPTION_DEFAULT_MULTIPLIER).toBe(100);
    expect(unwrap(parseOccOptionSymbol('AAPL260918C00200000')).multiplier).toBe(100);
  });

  it('accepts an explicit source-supplied multiplier', () => {
    expect(unwrap(parseOccOptionSymbol('AAPL260918C00200000', { multiplier: 10 })).multiplier).toBe(
      10,
    );
  });

  it.each([0, -100, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid multiplier %s',
    (multiplier) => {
      const result = parseOccOptionSymbol('AAPL260918C00200000', { multiplier });

      expect(result).toMatchObject({
        success: false,
        error: { code: 'INVALID_INSTRUMENT', reason: 'invalid_multiplier' },
      });
    },
  );

  it.each([
    ['impossible date', 'AAPL260230C00200000', 'invalid_expiration'],
    ['missing option type', 'AAPL  260918 00200000', 'invalid_option_type'],
    ['invalid option type', 'AAPL260918X00200000', 'invalid_option_type'],
    ['invalid strike encoding', 'AAPL260918C00200X00', 'invalid_strike'],
    ['zero strike', 'AAPL260918C00000000', 'invalid_strike'],
    ['missing contract fields', 'AAPL260918', 'invalid_structure'],
    ['invalid underlying', 'AAP_L260918C00200000', 'invalid_underlying'],
  ])('rejects %s', (_label, symbol, reason) => {
    expect(parseOccOptionSymbol(symbol)).toMatchObject({
      success: false,
      error: { code: 'INVALID_OPTION_SYMBOL', reason },
    });
  });
});
