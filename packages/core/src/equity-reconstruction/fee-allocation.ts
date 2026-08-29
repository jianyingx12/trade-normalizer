import type { Decimal } from 'decimal.js';

export interface FeeAllocation {
  readonly allocated: Decimal | undefined;
  readonly remaining: Decimal | undefined;
}

/**
 * Allocates from the remaining fee balance so the final allocation receives
 * any Decimal division remainder and the original total is conserved exactly.
 */
export function allocateRemainingFee(
  remainingFee: Decimal | undefined,
  matchedQuantity: Decimal,
  remainingQuantity: Decimal,
): FeeAllocation {
  if (remainingFee === undefined) {
    return { allocated: undefined, remaining: undefined };
  }

  const allocated = matchedQuantity.equals(remainingQuantity)
    ? remainingFee
    : remainingFee.times(matchedQuantity).dividedBy(remainingQuantity);

  return {
    allocated,
    remaining: remainingFee.minus(allocated),
  };
}
