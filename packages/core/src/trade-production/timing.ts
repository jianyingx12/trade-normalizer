import {
  tradeTimingSchema,
  type TimestampPrecision,
  type TradeTiming,
} from '@trade-normalizer/schemas';

export function buildTradeTiming(
  date: string,
  timestamp: string | undefined,
  precision: TimestampPrecision,
): TradeTiming {
  return tradeTimingSchema.parse({
    date,
    ...(timestamp === undefined ? {} : { timestamp }),
    precision,
  });
}
