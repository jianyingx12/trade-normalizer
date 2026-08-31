import { z } from 'zod';

import { currencyCodeSchema, reportedCommissionSchema } from './commission.js';
import { feeBreakdownSchema } from './fee.js';
import { instrumentSchema } from './instrument.js';
import {
  brokerIdSchema,
  canonicalIdSchema,
  decimalSchema,
  executionSideSchema,
  isoDateSchema,
  isoUtcTimestampSchema,
  nonNegativeDecimalSchema,
  positiveDecimalSchema,
  timestampPrecisionSchema,
} from './primitives.js';
import { sourceProvenanceSchema } from './provenance.js';

export const brokerActivityTypeSchema = z.enum([
  'trade',
  'dividend',
  'deposit',
  'withdrawal',
  'fee',
  'split',
  'unknown',
]);

export const brokerActivitySchema = z
  .object({
    id: canonicalIdSchema,
    broker: brokerIdSchema,
    accountId: z.string().trim().min(1).max(256).optional(),
    activityType: brokerActivityTypeSchema,
    instrument: instrumentSchema.optional(),
    activityDate: isoDateSchema,
    timestamp: isoUtcTimestampSchema.optional(),
    timestampPrecision: timestampPrecisionSchema,
    side: executionSideSchema.optional(),
    quantity: positiveDecimalSchema.optional(),
    price: nonNegativeDecimalSchema.optional(),
    grossAmount: decimalSchema.optional(),
    currency: currencyCodeSchema.optional(),
    reportedCommission: reportedCommissionSchema.optional(),
    fees: feeBreakdownSchema.optional(),
    provenance: sourceProvenanceSchema,
  })
  .strict()
  .superRefine((activity, context) => {
    if (activity.timestampPrecision === 'date' && activity.timestamp !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Date-precision activity must not include a fabricated timestamp',
        path: ['timestamp'],
      });
    }

    if (activity.timestampPrecision === 'datetime' && activity.timestamp === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Datetime-precision activity must include a canonical UTC timestamp',
        path: ['timestamp'],
      });
    }
  });

export type BrokerActivityType = z.infer<typeof brokerActivityTypeSchema>;
export type BrokerActivity = z.output<typeof brokerActivitySchema>;
export type BrokerActivityInput = z.input<typeof brokerActivitySchema>;
