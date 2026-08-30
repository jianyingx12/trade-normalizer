import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { allocateRemainingOptionFee } from './fee-allocation.js';

describe('allocateRemainingOptionFee', () => {
  it('preserves unknown fees', () => {
    expect(allocateRemainingOptionFee(undefined, new Decimal(1), new Decimal(2))).toEqual({
      allocated: undefined,
      remaining: undefined,
    });
  });

  it('allocates fees by quantity without applying an option multiplier', () => {
    const result = allocateRemainingOptionFee(new Decimal('0.30'), new Decimal(1), new Decimal(3));

    expect(result.allocated?.toString()).toBe('0.1');
    expect(result.remaining?.toString()).toBe('0.2');
  });

  it('assigns the exact remainder to the final allocation', () => {
    const total = new Decimal(1);
    const first = allocateRemainingOptionFee(total, new Decimal(1), new Decimal(3));
    const second = allocateRemainingOptionFee(first.remaining, new Decimal(1), new Decimal(2));
    const final = allocateRemainingOptionFee(second.remaining, new Decimal(1), new Decimal(1));

    expect(
      new Decimal(0)
        .plus(first.allocated ?? 0)
        .plus(second.allocated ?? 0)
        .plus(final.allocated ?? 0)
        .equals(total),
    ).toBe(true);
    expect(final.remaining?.isZero()).toBe(true);
  });
});
