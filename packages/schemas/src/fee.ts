import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { nonNegativeDecimalSchema } from './primitives.js';

export const feeBreakdownSchema = z
  .object({
    commission: nonNegativeDecimalSchema,
    regulatory: nonNegativeDecimalSchema,
    contract: nonNegativeDecimalSchema,
    other: nonNegativeDecimalSchema,
    total: nonNegativeDecimalSchema,
  })
  .strict()
  .superRefine((fees, context) => {
    const componentTotal = new Decimal(0)
      .plus(fees.commission)
      .plus(fees.regulatory)
      .plus(fees.contract)
      .plus(fees.other);

    if (!componentTotal.equals(fees.total)) {
      context.addIssue({
        code: 'custom',
        message: 'Fee total must equal the sum of all fee components',
        path: ['total'],
      });
    }
  });

export type FeeBreakdown = z.output<typeof feeBreakdownSchema>;
export type FeeBreakdownInput = z.input<typeof feeBreakdownSchema>;
