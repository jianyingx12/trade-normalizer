import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { canonicalSymbolSchema, instrumentSchema } from './instrument.js';
import {
  assetTypeSchema,
  brokerIdSchema,
  canonicalIdSchema,
  decimalSchema,
  isoDateSchema,
  isoUtcTimestampSchema,
  nonNegativeDecimalSchema,
  positiveDecimalSchema,
  strategyTypeSchema,
  timestampPrecisionSchema,
  tradeLegDirectionSchema,
  tradeStatusSchema,
} from './primitives.js';
import { warningSchema } from './warning.js';

function uniqueIdsSchema(label: string, requireOne = false) {
  const schema = z
    .array(canonicalIdSchema)
    .refine((ids) => new Set(ids).size === ids.length, `${label} must be unique`);
  return requireOne ? schema.min(1) : schema;
}

export const tradeTimingSchema = z
  .object({
    date: isoDateSchema,
    timestamp: isoUtcTimestampSchema.optional(),
    precision: timestampPrecisionSchema,
  })
  .strict()
  .superRefine((timing, context) => {
    if (timing.precision === 'date' && timing.timestamp !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Date-precision trade timing must not include a fabricated timestamp',
        path: ['timestamp'],
      });
    }
    if (timing.precision === 'datetime' && timing.timestamp === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Datetime-precision trade timing must include a canonical UTC timestamp',
        path: ['timestamp'],
      });
    }
  });

export const strategyInferenceSchema = z
  .object({
    level: z.enum(['confirmed', 'strong', 'inferred']),
    correlation: z.enum(['broker_order', 'datetime', 'source_order', 'structural']),
    openingTimeDistanceMs: z.number().int().nonnegative().optional(),
    candidateId: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export const tradeLegSchema = z
  .object({
    id: canonicalIdSchema,
    instrument: instrumentSchema,
    direction: tradeLegDirectionSchema,
    quantity: positiveDecimalSchema,
    openQuantity: nonNegativeDecimalSchema,
    lifecycleIds: uniqueIdsSchema('Lifecycle IDs', true),
    openingActivityIds: uniqueIdsSchema('Opening activity IDs', true),
    closingActivityIds: uniqueIdsSchema('Closing activity IDs').default([]),
    executionIds: uniqueIdsSchema('Execution IDs').default([]),
    grossRealizedPnl: decimalSchema,
    fees: nonNegativeDecimalSchema.optional(),
    netRealizedPnl: decimalSchema.optional(),
  })
  .strict()
  .superRefine((leg, context) => {
    if (leg.openQuantity.gt(leg.quantity)) {
      context.addIssue({
        code: 'custom',
        message: 'Leg openQuantity cannot exceed its owned quantity',
        path: ['openQuantity'],
      });
    }
    if ((leg.fees === undefined) !== (leg.netRealizedPnl === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Leg fees and netRealizedPnl must either both be known or both be absent',
        path: ['netRealizedPnl'],
      });
    }
    if (
      leg.fees !== undefined &&
      leg.netRealizedPnl !== undefined &&
      !leg.grossRealizedPnl.minus(leg.fees).equals(leg.netRealizedPnl)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Leg netRealizedPnl must equal grossRealizedPnl minus fees',
        path: ['netRealizedPnl'],
      });
    }
  });

export const tradeSchema = z
  .object({
    id: canonicalIdSchema,
    broker: brokerIdSchema,
    accountId: z.string().trim().min(1).max(256).optional(),
    underlying: canonicalSymbolSchema,
    assetType: assetTypeSchema,
    strategy: strategyTypeSchema,
    status: tradeStatusSchema,
    opened: tradeTimingSchema,
    closed: tradeTimingSchema.optional(),
    legs: z.array(tradeLegSchema).min(1),
    grossRealizedPnl: decimalSchema,
    fees: nonNegativeDecimalSchema.optional(),
    netRealizedPnl: decimalSchema.optional(),
    strategyInference: strategyInferenceSchema.optional(),
    warnings: z.array(warningSchema).default([]),
  })
  .strict()
  .superRefine((trade, context) => {
    if (trade.status === 'closed' && trade.closed === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A closed trade must include closed timing',
        path: ['closed'],
      });
    }
    if (trade.status !== 'closed' && trade.closed !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Only a closed trade can include closed timing',
        path: ['closed'],
      });
    }
    if (trade.closed !== undefined) {
      const bothDatetime =
        trade.opened.precision === 'datetime' && trade.closed.precision === 'datetime';
      const openedValue = bothDatetime ? trade.opened.timestamp! : trade.opened.date;
      const closedValue = bothDatetime ? trade.closed.timestamp! : trade.closed.date;
      if (closedValue < openedValue) {
        context.addIssue({
          code: 'custom',
          message: 'Closed timing cannot be earlier than opened timing',
          path: ['closed'],
        });
      }
    }

    for (const [index, leg] of trade.legs.entries()) {
      if (leg.instrument.assetType !== trade.assetType) {
        context.addIssue({
          code: 'custom',
          message: 'Trade leg asset type must match the trade asset type',
          path: ['legs', index, 'instrument', 'assetType'],
        });
      }
      const legUnderlying =
        leg.instrument.assetType === 'equity' ? leg.instrument.symbol : leg.instrument.underlying;
      if (legUnderlying !== trade.underlying) {
        context.addIssue({
          code: 'custom',
          message: 'Trade leg underlying must match the trade underlying',
          path: ['legs', index, 'instrument'],
        });
      }
    }

    if (trade.assetType === 'equity' && !['equity_long', 'unknown'].includes(trade.strategy)) {
      context.addIssue({
        code: 'custom',
        message: 'Equity trades cannot use an option strategy classification',
        path: ['strategy'],
      });
    }
    if (trade.assetType === 'option' && trade.strategy === 'equity_long') {
      context.addIssue({
        code: 'custom',
        message: 'Option trades cannot use the equity_long strategy classification',
        path: ['strategy'],
      });
    }

    const grossTotal = trade.legs.reduce(
      (total, leg) => total.plus(leg.grossRealizedPnl),
      new Decimal(0),
    );
    if (!grossTotal.equals(trade.grossRealizedPnl)) {
      context.addIssue({
        code: 'custom',
        message: 'Trade grossRealizedPnl must equal the sum of leg gross realized P&L',
        path: ['grossRealizedPnl'],
      });
    }

    const allLegFeesKnown = trade.legs.every((leg) => leg.fees !== undefined);
    if ((trade.fees !== undefined) !== allLegFeesKnown) {
      context.addIssue({
        code: 'custom',
        message: 'Trade fees are present exactly when every leg fee is known',
        path: ['fees'],
      });
    }
    if (trade.fees !== undefined && allLegFeesKnown) {
      const feeTotal = trade.legs.reduce((total, leg) => total.plus(leg.fees ?? 0), new Decimal(0));
      if (!feeTotal.equals(trade.fees)) {
        context.addIssue({
          code: 'custom',
          message: 'Trade fees must equal the sum of known leg fees',
          path: ['fees'],
        });
      }
    }

    if ((trade.fees === undefined) !== (trade.netRealizedPnl === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Trade fees and netRealizedPnl must either both be known or both be absent',
        path: ['netRealizedPnl'],
      });
    }
    if (
      trade.fees !== undefined &&
      trade.netRealizedPnl !== undefined &&
      !trade.grossRealizedPnl.minus(trade.fees).equals(trade.netRealizedPnl)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Trade netRealizedPnl must equal grossRealizedPnl minus fees',
        path: ['netRealizedPnl'],
      });
    }
  });

export type TradeTiming = z.output<typeof tradeTimingSchema>;
export type TradeTimingInput = z.input<typeof tradeTimingSchema>;
export type StrategyInference = z.output<typeof strategyInferenceSchema>;
export type StrategyInferenceInput = z.input<typeof strategyInferenceSchema>;
export type TradeLeg = z.output<typeof tradeLegSchema>;
export type TradeLegInput = z.input<typeof tradeLegSchema>;
export type Trade = z.output<typeof tradeSchema>;
export type TradeInput = z.input<typeof tradeSchema>;
