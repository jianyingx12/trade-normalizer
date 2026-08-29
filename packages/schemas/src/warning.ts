import { z } from 'zod';

import { canonicalIdSchema } from './primitives.js';

export const diagnosticCodeSchema = z.enum([
  'UNKNOWN_TRANSACTION_TYPE',
  'INVALID_OPTION_SYMBOL',
  'MISSING_PRICE',
  'MISSING_TIMESTAMP',
  'UNMATCHED_CLOSE',
  'AMBIGUOUS_POSITION_MATCH',
  'AMBIGUOUS_STRATEGY_MATCH',
  'NEGATIVE_POSITION',
  'DUPLICATE_EXECUTION',
  'UNSUPPORTED_EVENT',
  'MALFORMED_CSV',
  'INVALID_CSV_HEADERS',
  'INVALID_ACTIVITY_DATE',
  'INVALID_INSTRUMENT',
  'INVALID_QUANTITY',
  'INVALID_PRICE',
  'INVALID_AMOUNT',
  'AMOUNT_RECONCILIATION_MISMATCH',
  'INCOMPLETE_TRADE_ACTIVITY',
  'UNSUPPORTED_ASSET_TYPE',
]);

const diagnosticContextShape = {
  code: diagnosticCodeSchema,
  message: z.string().trim().min(1).max(4096),
  executionIds: z.array(canonicalIdSchema).default([]),
  sourceIndexes: z.array(z.number().int().nonnegative()).default([]),
  candidateIds: z.array(canonicalIdSchema).default([]),
  details: z.record(z.string(), z.unknown()).optional(),
};

export const warningSchema = z
  .object({
    severity: z.literal('warning'),
    ...diagnosticContextShape,
  })
  .strict();

export const domainErrorSchema = z
  .object({
    severity: z.literal('error'),
    ...diagnosticContextShape,
  })
  .strict();

export const diagnosticSchema = z.discriminatedUnion('severity', [
  warningSchema,
  domainErrorSchema,
]);

export type DiagnosticCode = z.infer<typeof diagnosticCodeSchema>;
export type DomainWarning = z.output<typeof warningSchema>;
export type DomainWarningInput = z.input<typeof warningSchema>;
export type DomainError = z.output<typeof domainErrorSchema>;
export type DomainErrorInput = z.input<typeof domainErrorSchema>;
export type Diagnostic = z.output<typeof diagnosticSchema>;
export type DiagnosticInput = z.input<typeof diagnosticSchema>;
