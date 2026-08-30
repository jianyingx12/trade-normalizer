import { z } from 'zod';

import { executionTimeSchema } from './execution-time.js';
import { feeBreakdownSchema } from './fee.js';
import { instrumentSchema } from './instrument.js';
import {
  brokerIdSchema,
  canonicalIdSchema,
  executionSideSchema,
  nonNegativeDecimalSchema,
  positionEffectSchema,
  positiveDecimalSchema,
} from './primitives.js';
import { sourceProvenanceSchema } from './provenance.js';

/** @deprecated Use sourceProvenanceSchema for new canonical source records. */
export const executionProvenanceSchema = sourceProvenanceSchema;

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
    executionTime: executionTimeSchema,
    provenance: executionProvenanceSchema,
  })
  .strict();

export type ExecutionProvenance = z.output<typeof executionProvenanceSchema>;
export type ExecutionProvenanceInput = z.input<typeof executionProvenanceSchema>;
export type Execution = z.output<typeof executionSchema>;
export type ExecutionInput = z.input<typeof executionSchema>;
