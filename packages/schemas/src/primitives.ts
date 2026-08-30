import { Decimal } from 'decimal.js';
import { z } from 'zod';

const DECIMAL_STRING_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const BROKER_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export const SUPPORTED_BROKERS = ['robinhood', 'ibkr', 'webull'] as const;

export const brokerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(BROKER_ID_PATTERN, 'Broker identifiers must use lowercase canonical names');

export const assetTypeSchema = z.enum(['equity', 'option']);
export const executionSideSchema = z.enum(['buy', 'sell']);
export const positionEffectSchema = z.enum(['open', 'close', 'unknown']);
export const optionTypeSchema = z.enum(['call', 'put']);
export const timestampPrecisionSchema = z.enum(['date', 'datetime']);
export const tradeStatusSchema = z.enum(['open', 'partially_closed', 'closed']);
export const tradeLegDirectionSchema = z.enum(['long', 'short']);

export const strategyTypeSchema = z.enum([
  'equity_long',
  'long_call',
  'long_put',
  'short_call',
  'short_put',
  'bull_call_spread',
  'bear_call_spread',
  'bull_put_spread',
  'bear_put_spread',
  'unknown',
]);

export const canonicalIdSchema = z.string().trim().min(1).max(256);
export const isoDateSchema = z.iso.date();
export const isoUtcTimestampSchema = z.iso.datetime({ offset: false, precision: 3 });

export const decimalStringSchema = z
  .string()
  .regex(
    DECIMAL_STRING_PATTERN,
    'Expected a base-10 decimal string without an exponent or leading plus sign',
  );

/**
 * Accepts canonical decimal strings or existing Decimal instances and always outputs Decimal.
 * JavaScript numbers are deliberately rejected at this boundary.
 */
export const decimalSchema = z.union([
  z.instanceof(Decimal),
  decimalStringSchema.transform((value) => new Decimal(value)),
]);

export const nonNegativeDecimalSchema = decimalSchema.refine((value) => value.gte(0), {
  message: 'Expected a non-negative decimal value',
});

export const positiveDecimalSchema = decimalSchema.refine((value) => value.gt(0), {
  message: 'Expected a positive decimal value',
});

/** Serializes a Decimal as a non-exponential base-10 string. */
export function decimalToString(value: Decimal): string {
  return value.toFixed(value.decimalPlaces());
}

export const decimalJsonSchema = decimalSchema.transform(decimalToString);

export type BrokerId = z.infer<typeof brokerIdSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type ExecutionSide = z.infer<typeof executionSideSchema>;
export type PositionEffect = z.infer<typeof positionEffectSchema>;
export type OptionType = z.infer<typeof optionTypeSchema>;
export type TimestampPrecision = z.infer<typeof timestampPrecisionSchema>;
export type TradeStatus = z.infer<typeof tradeStatusSchema>;
export type TradeLegDirection = z.infer<typeof tradeLegDirectionSchema>;
export type StrategyType = z.infer<typeof strategyTypeSchema>;
export type DecimalInput = z.input<typeof decimalSchema>;
