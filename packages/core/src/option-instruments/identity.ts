import { decimalToString, type OptionInstrument } from '@trade-normalizer/schemas';

export type OptionInstrumentKey = string & { readonly __optionInstrumentKey: unique symbol };

/**
 * Creates a deterministic key from every canonical option-contract identity field.
 * The canonical symbol grammar excludes the pipe delimiter.
 */
export function createOptionInstrumentKey(instrument: OptionInstrument): OptionInstrumentKey {
  return [
    instrument.underlying,
    instrument.expiration,
    decimalToString(instrument.strike),
    instrument.optionType,
    instrument.multiplier.toString(),
  ].join('|') as OptionInstrumentKey;
}

export function sameOptionInstrument(left: OptionInstrument, right: OptionInstrument): boolean {
  return createOptionInstrumentKey(left) === createOptionInstrumentKey(right);
}
