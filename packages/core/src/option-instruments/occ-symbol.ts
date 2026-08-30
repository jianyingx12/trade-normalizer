import {
  canonicalSymbolSchema,
  isoDateSchema,
  optionInstrumentSchema,
  type OptionInstrument,
} from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';

export const OCC_OPTION_DEFAULT_MULTIPLIER = 100;
export const OCC_OPTION_YEAR_CENTURY = 2000;

export interface ParseOccOptionSymbolOptions {
  /** OCC symbols do not encode multiplier; standard equity options default to 100. */
  readonly multiplier?: number;
}

export type OccOptionSymbolParseErrorReason =
  | 'invalid_structure'
  | 'invalid_underlying'
  | 'invalid_expiration'
  | 'invalid_option_type'
  | 'invalid_strike'
  | 'invalid_multiplier'
  | 'invalid_instrument';

export interface OccOptionSymbolParseError {
  readonly code: 'INVALID_OPTION_SYMBOL' | 'INVALID_INSTRUMENT';
  readonly reason: OccOptionSymbolParseErrorReason;
  readonly message: string;
  readonly input: string;
}

export type OccOptionSymbolParseResult =
  | { readonly success: true; readonly instrument: OptionInstrument }
  | { readonly success: false; readonly error: OccOptionSymbolParseError };

function failure(
  input: string,
  reason: OccOptionSymbolParseErrorReason,
  message: string,
  code: OccOptionSymbolParseError['code'] = 'INVALID_OPTION_SYMBOL',
): OccOptionSymbolParseResult {
  return { success: false, error: { code, reason, message, input } };
}

/**
 * Parses compact or six-character-root-padded OCC/OSI equity option symbols.
 * YY is deterministically interpreted as 2000-2099; no pivot year is used.
 */
export function parseOccOptionSymbol(
  input: string,
  options: ParseOccOptionSymbolOptions = {},
): OccOptionSymbolParseResult {
  const normalized = input.trim();
  const multiplier = options.multiplier ?? OCC_OPTION_DEFAULT_MULTIPLIER;

  if (!Number.isSafeInteger(multiplier) || multiplier <= 0) {
    return failure(
      input,
      'invalid_multiplier',
      'Option multiplier must be a positive safe integer.',
      'INVALID_INSTRUMENT',
    );
  }

  // Root is 1-6 characters, followed by YYMMDD, C/P, and an eight-digit strike.
  if (normalized.length < 16 || normalized.length > 21) {
    return failure(
      input,
      'invalid_structure',
      'Expected an OCC option symbol with a 1-6 character root and 15-character contract suffix.',
    );
  }

  const suffixStart = normalized.length - 15;
  const encodedRoot = normalized.slice(0, suffixStart);
  const underlying = encodedRoot.trimEnd();
  const encodedExpiration = normalized.slice(suffixStart, suffixStart + 6);
  const encodedOptionType = normalized.slice(suffixStart + 6, suffixStart + 7);
  const encodedStrike = normalized.slice(suffixStart + 7);

  if (
    underlying.length === 0 ||
    underlying.length > 6 ||
    encodedRoot !== underlying.padEnd(encodedRoot.length, ' ') ||
    !canonicalSymbolSchema.safeParse(underlying).success
  ) {
    return failure(input, 'invalid_underlying', 'OCC option root is not a canonical underlying.');
  }

  if (!/^\d{6}$/.test(encodedExpiration)) {
    return failure(input, 'invalid_expiration', 'OCC expiration must use YYMMDD digits.');
  }

  const expiration = `${OCC_OPTION_YEAR_CENTURY + Number(encodedExpiration.slice(0, 2))}-${encodedExpiration.slice(2, 4)}-${encodedExpiration.slice(4, 6)}`;
  if (!isoDateSchema.safeParse(expiration).success) {
    return failure(input, 'invalid_expiration', 'OCC expiration is not a valid calendar date.');
  }

  if (encodedOptionType !== 'C' && encodedOptionType !== 'P') {
    return failure(input, 'invalid_option_type', 'OCC option type must be C or P.');
  }

  if (!/^\d{8}$/.test(encodedStrike)) {
    return failure(input, 'invalid_strike', 'OCC strike must contain exactly eight digits.');
  }

  const strike = new Decimal(encodedStrike).dividedBy(1000);
  if (!strike.gt(0)) {
    return failure(input, 'invalid_strike', 'OCC strike must be greater than zero.');
  }

  const instrument = optionInstrumentSchema.safeParse({
    assetType: 'option',
    underlying,
    expiration,
    strike,
    optionType: encodedOptionType === 'C' ? 'call' : 'put',
    multiplier,
  });

  if (!instrument.success) {
    return failure(
      input,
      'invalid_instrument',
      'Parsed OCC fields do not form a valid canonical option instrument.',
      'INVALID_INSTRUMENT',
    );
  }

  return { success: true, instrument: instrument.data };
}
