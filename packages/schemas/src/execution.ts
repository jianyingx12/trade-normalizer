import { z } from 'zod';

import { feeBreakdownSchema } from './fee.js';
import { instrumentSchema } from './instrument.js';
import {
  brokerIdSchema,
  canonicalIdSchema,
  executionSideSchema,
  isoUtcTimestampSchema,
  nonNegativeDecimalSchema,
  positionEffectSchema,
  positiveDecimalSchema,
} from './primitives.js';

export const executionProvenanceSchema = z
  .object({
    brokerTransactionId: z.string().trim().min(1).max(256).optional(),
    sourceFile: z.string().trim().min(1).max(1024).optional(),
    sourceIndex: z.number().int().nonnegative(),
    sourceRow: z.number().int().positive().optional(),
    rawReference: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export const executionSchema = z
  .object({
    id: canonicalIdSchema,
    broker: brokerIdSchema,
    accountId: z.string().trim().min(1).max(256).optional(),
    instrument: instrumentSchema,
    side: executionSideSchema,
    positionEffect: positionEffectSchema.default('unknown'),
    quantity: positiveDecimalSchema,
    price: nonNegativeDecimalSchema,
    fees: feeBreakdownSchema,
    executedAt: isoUtcTimestampSchema,
    provenance: executionProvenanceSchema,
  })
  .strict();

export type ExecutionProvenance = z.output<typeof executionProvenanceSchema>;
export type ExecutionProvenanceInput = z.input<typeof executionProvenanceSchema>;
export type Execution = z.output<typeof executionSchema>;
export type ExecutionInput = z.input<typeof executionSchema>;
