import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { allocateRemainingFee } from './fee-allocation.js';

describe('allocateRemainingFee', () => {
  it('preserves unknown fees', () => {
    expect(allocateRemainingFee(undefined, new Decimal(1), new Decimal(2))).toEqual({
      allocated: undefined,
      remaining: undefined,
    });
  });

  it('allocates a proportional share from a known fee balance', () => {
    const result = allocateRemainingFee(new Decimal('0.30'), new Decimal(1), new Decimal(3));

    expect(result.allocated?.toString()).toBe('0.1');
    expect(result.remaining?.toString()).toBe('0.2');
  });

  it('assigns the exact remaining balance to the final allocation', () => {
    const total = new Decimal(1);
    const first = allocateRemainingFee(total, new Decimal(1), new Decimal(3));
    const second = allocateRemainingFee(first.remaining, new Decimal(1), new Decimal(2));
    const final = allocateRemainingFee(second.remaining, new Decimal(1), new Decimal(1));

    const allocatedTotal = new Decimal(0)
      .plus(first.allocated ?? 0)
      .plus(second.allocated ?? 0)
      .plus(final.allocated ?? 0);
    expect(allocatedTotal.equals(total)).toBe(true);
    expect(final.remaining?.isZero()).toBe(true);
  });
});
