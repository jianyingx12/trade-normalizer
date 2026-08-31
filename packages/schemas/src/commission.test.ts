import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { reportedCommissionSchema } from './index.js';

describe('reported commission schema', () => {
  it.each([
    ['charge', '-1.25'],
    ['rebate', '0.15'],
    ['zero', '0'],
  ] as const)('preserves a signed %s in its source currency', (effect, amount) => {
    const commission = reportedCommissionSchema.parse({ amount, currency: 'USD', effect });

    expect(commission.amount).toBeInstanceOf(Decimal);
    expect(commission.amount.equals(amount)).toBe(true);
    expect(commission.currency).toBe('USD');
    expect(commission.effect).toBe(effect);
  });

  it.each([
    ['a positive charge', { amount: '1.25', currency: 'USD', effect: 'charge' }],
    ['a negative rebate', { amount: '-0.15', currency: 'USD', effect: 'rebate' }],
    ['a nonzero zero effect', { amount: '0.01', currency: 'USD', effect: 'zero' }],
    ['a JavaScript number', { amount: -0.15, currency: 'USD', effect: 'charge' }],
    ['a lowercase currency', { amount: '-0.15', currency: 'usd', effect: 'charge' }],
  ])('rejects %s', (_label, commission) => {
    expect(reportedCommissionSchema.safeParse(commission).success).toBe(false);
  });
});
