import type { Decimal } from 'decimal.js';

export interface OptionFeeAllocation {
  readonly allocated: Decimal | undefined;
  readonly remaining: Decimal | undefined;
}

/** Allocates monetary fees by quantity and conserves the exact final remainder. */
export function allocateRemainingOptionFee(
  remainingFee: Decimal | undefined,
  matchedQuantity: Decimal,
  remainingQuantity: Decimal,
): OptionFeeAllocation {
  if (remainingFee === undefined) {
    return { allocated: undefined, remaining: undefined };
  }

  const allocated = matchedQuantity.equals(remainingQuantity)
    ? remainingFee
    : remainingFee.times(matchedQuantity).dividedBy(remainingQuantity);

  return { allocated, remaining: remainingFee.minus(allocated) };
}
