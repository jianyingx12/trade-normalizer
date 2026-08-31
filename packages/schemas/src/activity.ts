import { z } from 'zod';

import { currencyCodeSchema, reportedCommissionSchema } from './commission.js';
import { isoLocalDateTimeSchema } from './execution-time.js';
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

export const activityTimestampPrecisionSchema = z.enum(['date', 'local_datetime', 'datetime']);

export const brokerActivitySchema = z
  .object({
    id: canonicalIdSchema,
    broker: brokerIdSchema,
    accountId: z.string().trim().min(1).max(256).optional(),
    activityType: brokerActivityTypeSchema,
    executionId: canonicalIdSchema.optional(),
    instrument: instrumentSchema.optional(),
    activityDate: isoDateSchema,
    timestamp: isoUtcTimestampSchema.optional(),
    localDateTime: isoLocalDateTimeSchema.optional(),
    timestampPrecision: activityTimestampPrecisionSchema,
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
    if (
      activity.timestampPrecision === 'date' &&
      (activity.timestamp !== undefined || activity.localDateTime !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Date-precision activity must not include a fabricated datetime',
        path: [activity.timestamp === undefined ? 'localDateTime' : 'timestamp'],
      });
    }

    if (
      activity.timestampPrecision === 'local_datetime' &&
      (activity.localDateTime === undefined || activity.timestamp !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Local-datetime activity must include only a timezone-less local datetime',
        path: [activity.localDateTime === undefined ? 'localDateTime' : 'timestamp'],
      });
    }

    if (
      activity.timestampPrecision === 'datetime' &&
      (activity.timestamp === undefined || activity.localDateTime !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Datetime-precision activity must include only a canonical UTC timestamp',
        path: [activity.timestamp === undefined ? 'timestamp' : 'localDateTime'],
      });
    }
  });

export type BrokerActivityType = z.infer<typeof brokerActivityTypeSchema>;
export type ActivityTimestampPrecision = z.infer<typeof activityTimestampPrecisionSchema>;
export type BrokerActivity = z.output<typeof brokerActivitySchema>;
export type BrokerActivityInput = z.input<typeof brokerActivitySchema>;
