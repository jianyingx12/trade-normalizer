import type { Decimal } from 'decimal.js';

/** Returns complete known realized fees without treating an absent net result as zero fees. */
export function deriveKnownRealizedFees(
  grossRealizedPnl: Decimal,
  netRealizedPnl: Decimal | undefined,
): Decimal | undefined {
  return netRealizedPnl === undefined ? undefined : grossRealizedPnl.minus(netRealizedPnl);
}
