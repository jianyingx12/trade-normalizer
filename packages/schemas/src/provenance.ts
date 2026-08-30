import { z } from 'zod';

const BROKER_REFERENCE_KEY_PATTERN = /^[a-z][a-zA-Z0-9._-]*$/;

export const brokerReferencesSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(64)
      .regex(
        BROKER_REFERENCE_KEY_PATTERN,
        'Broker reference keys must begin with a lowercase letter and use identifier characters',
      ),
    z.string().trim().min(1).max(2048),
  )
  .refine((references) => Object.keys(references).length > 0, {
    message: 'Broker references must contain at least one reference',
  })
  .refine((references) => Object.keys(references).length <= 32, {
    message: 'Broker references cannot contain more than 32 entries',
  });

export const sourceProvenanceSchema = z
  .object({
    brokerTransactionId: z.string().trim().min(1).max(256).optional(),
    brokerReferences: brokerReferencesSchema.optional(),
    sourceFile: z.string().trim().min(1).max(1024).optional(),
    sourceIndex: z.number().int().nonnegative(),
    sourceRow: z.number().int().positive().optional(),
    rawReference: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export type SourceProvenance = z.output<typeof sourceProvenanceSchema>;
export type SourceProvenanceInput = z.input<typeof sourceProvenanceSchema>;
export type BrokerReferences = z.output<typeof brokerReferencesSchema>;
