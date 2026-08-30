import { Decimal } from 'decimal.js';

import { calculateOptionPremium } from '../option-reconstruction/premium.js';
import type { OptionLot, OptionLotMatch } from '../option-reconstruction/types.js';
import type {
  VerticalSpreadLegAllocation,
  VerticalSpreadLifecycleLeg,
  VerticalSpreadMatchAllocation,
} from './types.js';

function proportional(value: Decimal, allocated: Decimal, total: Decimal): Decimal {
  return value.times(allocated).dividedBy(total);
}

function allocateMatch(match: OptionLotMatch, quantity: Decimal): VerticalSpreadMatchAllocation {
  const closingCashFlow = proportional(match.closingPremium, quantity, match.matchedQuantity).times(
    match.direction === 'long' ? 1 : -1,
  );
  const grossRealizedPnl = proportional(match.grossRealizedPnl, quantity, match.matchedQuantity);
  const realizedFees =
    match.openingFees === undefined || match.closingFees === undefined
      ? undefined
      : proportional(match.openingFees.plus(match.closingFees), quantity, match.matchedQuantity);
  const netRealizedPnl =
    match.netRealizedPnl === undefined
      ? undefined
      : proportional(match.netRealizedPnl, quantity, match.matchedQuantity);

  return {
    matchId: match.id,
    allocatedQuantity: quantity,
    closingActivityId: match.closingActivityId,
    closedOn: match.closedOn,
    ...(match.closedAt === undefined ? {} : { closedAt: match.closedAt }),
    closingTimestampPrecision: match.closingTimestampPrecision,
    closingSourceIndex: match.closingSourceIndex,
    closingCashFlow,
    grossRealizedPnl,
    ...(realizedFees === undefined ? {} : { realizedFees }),
    ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
  };
}

export function buildVerticalSpreadLifecycleLeg(
  leg: VerticalSpreadLegAllocation,
  lot: OptionLot,
  matches: readonly OptionLotMatch[],
): VerticalSpreadLifecycleLeg {
  let remainingOwnedQuantity = leg.quantity;
  const matchAllocations: VerticalSpreadMatchAllocation[] = [];
  for (const match of matches) {
    if (remainingOwnedQuantity.isZero()) break;
    const quantity = Decimal.min(remainingOwnedQuantity, match.matchedQuantity);
    matchAllocations.push(allocateMatch(match, quantity));
    remainingOwnedQuantity = remainingOwnedQuantity.minus(quantity);
  }

  const closedQuantity = leg.quantity.minus(remainingOwnedQuantity);
  const openingPremium = calculateOptionPremium(
    lot.entryPrice,
    leg.quantity,
    lot.instrument.multiplier,
  );
  const openingCashFlow = openingPremium.times(leg.direction === 'long' ? -1 : 1);
  const closingCashFlow = matchAllocations.reduce(
    (total, match) => total.plus(match.closingCashFlow),
    new Decimal(0),
  );
  const grossRealizedPnl = matchAllocations.reduce(
    (total, match) => total.plus(match.grossRealizedPnl),
    new Decimal(0),
  );
  const realizedFees = matchAllocations.some((match) => match.realizedFees === undefined)
    ? undefined
    : matchAllocations.reduce(
        (total, match) => total.plus(match.realizedFees ?? 0),
        new Decimal(0),
      );
  const netRealizedPnl = matchAllocations.some((match) => match.netRealizedPnl === undefined)
    ? undefined
    : matchAllocations.reduce(
        (total, match) => total.plus(match.netRealizedPnl ?? 0),
        new Decimal(0),
      );

  return {
    ...leg,
    openedOn: lot.openedOn,
    ...(lot.openedAt === undefined ? {} : { openedAt: lot.openedAt }),
    openingTimestampPrecision: lot.timestampPrecision,
    openingCashFlow,
    closedQuantity,
    openQuantity: remainingOwnedQuantity,
    closingCashFlow,
    grossRealizedPnl,
    ...(realizedFees === undefined ? {} : { realizedFees }),
    ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    matchAllocations,
  };
}
