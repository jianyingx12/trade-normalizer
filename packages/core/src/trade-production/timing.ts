import {
  tradeTimingSchema,
  type BrokerActivity,
  type TradeTiming,
} from '@trade-normalizer/schemas';

export function buildTradeTiming(
  date: string,
  timestamp: string | undefined,
  precision: BrokerActivity['timestampPrecision'],
): TradeTiming {
  if (precision === 'local_datetime') {
    return tradeTimingSchema.parse({ date, precision: 'date' });
  }

  return tradeTimingSchema.parse({
    date,
    ...(timestamp === undefined ? {} : { timestamp }),
    precision,
  });
}
