import { z } from 'zod';

import { decimalSchema } from './primitives.js';

export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Expected a three-letter uppercase currency code');

export const commissionEffectSchema = z.enum(['charge', 'rebate', 'zero']);

/**
 * Signed commission evidence expressed as account cash impact.
 * Charges are negative, rebates are positive, and a zero effect is exactly zero.
 */
export const reportedCommissionSchema = z
  .object({
    amount: decimalSchema,
    currency: currencyCodeSchema,
    effect: commissionEffectSchema,
  })
  .strict()
  .superRefine((commission, context) => {
    const effectMatchesAmount =
      (commission.effect === 'charge' && commission.amount.isNegative()) ||
      (commission.effect === 'rebate' && commission.amount.isPositive()) ||
      (commission.effect === 'zero' && commission.amount.isZero());

    if (!effectMatchesAmount) {
      context.addIssue({
        code: 'custom',
        message: 'Commission effect must match the sign of its account-impact amount',
        path: ['effect'],
      });
    }
  });

export type CurrencyCode = z.output<typeof currencyCodeSchema>;
export type CommissionEffect = z.output<typeof commissionEffectSchema>;
export type ReportedCommission = z.output<typeof reportedCommissionSchema>;
export type ReportedCommissionInput = z.input<typeof reportedCommissionSchema>;
