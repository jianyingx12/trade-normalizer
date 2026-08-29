import { z } from 'zod';

import {
  assetTypeSchema,
  isoDateSchema,
  optionTypeSchema,
  positiveDecimalSchema,
} from './primitives.js';

const CANONICAL_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]*$/;

export const canonicalSymbolSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(CANONICAL_SYMBOL_PATTERN, 'Expected an uppercase canonical symbol');

export const equityInstrumentSchema = z
  .object({
    assetType: z.literal(assetTypeSchema.enum.equity),
    symbol: canonicalSymbolSchema,
  })
  .strict();

export const optionInstrumentSchema = z
  .object({
    assetType: z.literal(assetTypeSchema.enum.option),
    underlying: canonicalSymbolSchema,
    expiration: isoDateSchema,
    strike: positiveDecimalSchema,
    optionType: optionTypeSchema,
    multiplier: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const instrumentSchema = z.discriminatedUnion('assetType', [
  equityInstrumentSchema,
  optionInstrumentSchema,
]);

export type EquityInstrument = z.output<typeof equityInstrumentSchema>;
export type EquityInstrumentInput = z.input<typeof equityInstrumentSchema>;
export type OptionInstrument = z.output<typeof optionInstrumentSchema>;
export type OptionInstrumentInput = z.input<typeof optionInstrumentSchema>;
export type Instrument = z.output<typeof instrumentSchema>;
export type InstrumentInput = z.input<typeof instrumentSchema>;
