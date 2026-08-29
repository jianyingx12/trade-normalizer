import { z } from 'zod';

import { feeBreakdownSchema } from './fee.js';
import { canonicalSymbolSchema, instrumentSchema } from './instrument.js';
import {
  assetTypeSchema,
  canonicalIdSchema,
  decimalSchema,
  isoUtcTimestampSchema,
  positiveDecimalSchema,
  strategyTypeSchema,
  tradeLegDirectionSchema,
  tradeStatusSchema,
} from './primitives.js';
import { warningSchema } from './warning.js';

const uniqueIdsSchema = z
  .array(canonicalIdSchema)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, 'Execution IDs must be unique within a leg');

export const tradeLegSchema = z
  .object({
    id: canonicalIdSchema,
    instrument: instrumentSchema,
    direction: tradeLegDirectionSchema,
    quantity: positiveDecimalSchema,
    executionIds: uniqueIdsSchema,
  })
  .strict();

export const tradeSchema = z
  .object({
    id: canonicalIdSchema,
    underlying: canonicalSymbolSchema,
    assetType: assetTypeSchema,
    strategy: strategyTypeSchema,
    status: tradeStatusSchema,
    openedAt: isoUtcTimestampSchema,
    closedAt: isoUtcTimestampSchema.optional(),
    legs: z.array(tradeLegSchema).min(1),
    fees: feeBreakdownSchema,
    grossPnl: decimalSchema.optional(),
    realizedPnl: decimalSchema.optional(),
    warnings: z.array(warningSchema).default([]),
  })
  .strict()
  .superRefine((trade, context) => {
    if (trade.status === 'closed' && trade.closedAt === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A closed trade must include closedAt',
        path: ['closedAt'],
      });
    }

    if (trade.status === 'open' && trade.closedAt !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'An open trade cannot include closedAt',
        path: ['closedAt'],
      });
    }

    if (trade.closedAt !== undefined && Date.parse(trade.closedAt) < Date.parse(trade.openedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'closedAt cannot be earlier than openedAt',
        path: ['closedAt'],
      });
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
  });

export type TradeLeg = z.output<typeof tradeLegSchema>;
export type TradeLegInput = z.input<typeof tradeLegSchema>;
export type Trade = z.output<typeof tradeSchema>;
export type TradeInput = z.input<typeof tradeSchema>;
