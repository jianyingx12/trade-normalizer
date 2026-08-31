import { z } from 'zod';

const BROKER_METADATA_KEY_PATTERN = /^[a-z][a-zA-Z0-9._-]*$/;

function boundedBrokerStringMap(label: string) {
  return z
    .record(
      z
        .string()
        .min(1)
        .max(64)
        .regex(
          BROKER_METADATA_KEY_PATTERN,
          `${label} keys must begin with a lowercase letter and use identifier characters`,
        ),
      z.string().trim().min(1).max(2048),
    )
    .refine((references) => Object.keys(references).length > 0, {
      message: `${label} must contain at least one entry`,
    })
    .refine((references) => Object.keys(references).length <= 32, {
      message: `${label} cannot contain more than 32 entries`,
    });
}

export const brokerReferencesSchema = boundedBrokerStringMap('Broker references');
export const brokerMetadataSchema = boundedBrokerStringMap('Broker metadata');

export const sourceProvenanceSchema = z
  .object({
    brokerTransactionId: z.string().trim().min(1).max(256).optional(),
    brokerReferences: brokerReferencesSchema.optional(),
    brokerMetadata: brokerMetadataSchema.optional(),
    sourceFile: z.string().trim().min(1).max(1024).optional(),
    sourceIndex: z.number().int().nonnegative(),
    sourceRow: z.number().int().positive().optional(),
    rawReference: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export type SourceProvenance = z.output<typeof sourceProvenanceSchema>;
export type SourceProvenanceInput = z.input<typeof sourceProvenanceSchema>;
export type BrokerReferences = z.output<typeof brokerReferencesSchema>;
export type BrokerMetadata = z.output<typeof brokerMetadataSchema>;
