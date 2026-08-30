import { z } from 'zod';

import { isoDateSchema, isoUtcTimestampSchema } from './primitives.js';

/**
 * ISO 8601 local date-time without an offset or `Z` suffix.
 *
 * This represents a broker-reported wall-clock value whose timezone is not
 * known. It must not be treated as an instant until a separate policy supplies
 * trustworthy timezone evidence.
 */
export const isoLocalDateTimeSchema = z.iso
  .datetime({ local: true })
  .refine((value) => !value.endsWith('Z'), 'Expected a local datetime without a UTC offset');

export const executionTimeSchema = z.discriminatedUnion('precision', [
  z
    .object({
      precision: z.literal('date'),
      date: isoDateSchema,
    })
    .strict(),
  z
    .object({
      precision: z.literal('local_datetime'),
      localDateTime: isoLocalDateTimeSchema,
    })
    .strict(),
  z
    .object({
      precision: z.literal('utc_datetime'),
      timestamp: isoUtcTimestampSchema,
    })
    .strict(),
]);

export type ExecutionTime = z.output<typeof executionTimeSchema>;
export type ExecutionTimeInput = z.input<typeof executionTimeSchema>;
