import { z } from 'zod';

export const sourceProvenanceSchema = z
  .object({
    brokerTransactionId: z.string().trim().min(1).max(256).optional(),
    sourceFile: z.string().trim().min(1).max(1024).optional(),
    sourceIndex: z.number().int().nonnegative(),
    sourceRow: z.number().int().positive().optional(),
    rawReference: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export type SourceProvenance = z.output<typeof sourceProvenanceSchema>;
export type SourceProvenanceInput = z.input<typeof sourceProvenanceSchema>;
