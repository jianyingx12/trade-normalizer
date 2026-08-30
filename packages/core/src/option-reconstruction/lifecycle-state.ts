import { Decimal } from 'decimal.js';

import { calculateOptionPremium } from './premium.js';
import type {
  EligibleOptionTradeActivity,
  OptionLot,
  OptionLotMatch,
  OptionPositionDirection,
  OptionPositionKey,
  OptionPositionLifecycle,
} from './types.js';

export interface MutableOptionLifecycle {
  readonly id: string;
  readonly key: OptionPositionKey;
  readonly instrument: OptionPositionLifecycle['instrument'];
  readonly direction: OptionPositionDirection;
  status: OptionPositionLifecycle['status'];
  readonly openingActivityId: string;
  closingActivityId: string | undefined;
  readonly openedOn: string;
  closedOn: string | undefined;
  readonly activityIds: string[];
}

export function createOptionLifecycle(
  activity: EligibleOptionTradeActivity,
  key: OptionPositionKey,
  direction: OptionPositionDirection,
): MutableOptionLifecycle {
  return {
    id: `option-lifecycle:${activity.id}`,
    key,
    instrument: activity.instrument,
    direction,
    status: 'open',
    openingActivityId: activity.id,
    closingActivityId: undefined,
    openedOn: activity.activityDate,
    closedOn: undefined,
    activityIds: [activity.id],
  };
}

export function recordOptionLifecycleActivity(
  lifecycle: MutableOptionLifecycle,
  activity: EligibleOptionTradeActivity,
): void {
  lifecycle.activityIds.push(activity.id);
}

export function closeOptionLifecycle(
  lifecycle: MutableOptionLifecycle,
  activity: EligibleOptionTradeActivity,
): void {
  lifecycle.status = 'closed';
  lifecycle.closingActivityId = activity.id;
  lifecycle.closedOn = activity.activityDate;
}

export function snapshotOptionLifecycle(
  lifecycle: MutableOptionLifecycle,
  allLots: readonly OptionLot[],
  allMatches: readonly OptionLotMatch[],
): OptionPositionLifecycle {
  const lots = allLots.filter((lot) => lot.lifecycleId === lifecycle.id);
  const matches = allMatches.filter((match) => match.lifecycleId === lifecycle.id);
  const openQuantity = lots.reduce(
    (quantity, lot) => quantity.plus(lot.remainingQuantity),
    new Decimal(0),
  );
  const remainingOpeningPremium = lots.reduce(
    (premium, lot) =>
      premium.plus(
        calculateOptionPremium(lot.entryPrice, lot.remainingQuantity, lot.instrument.multiplier),
      ),
    new Decimal(0),
  );
  const grossRealizedPnl = matches.reduce(
    (pnl, match) => pnl.plus(match.grossRealizedPnl),
    new Decimal(0),
  );
  const hasUnknownRemainingFees = lots.some(
    (lot) => !lot.remainingQuantity.isZero() && lot.remainingOpeningFees === undefined,
  );
  const remainingOpeningFees = hasUnknownRemainingFees
    ? undefined
    : lots.reduce((fees, lot) => fees.plus(lot.remainingOpeningFees ?? 0), new Decimal(0));
  const netRealizedPnl = matches.some((match) => match.netRealizedPnl === undefined)
    ? undefined
    : matches.reduce((pnl, match) => pnl.plus(match.netRealizedPnl ?? 0), new Decimal(0));

  return {
    id: lifecycle.id,
    key: lifecycle.key,
    instrument: lifecycle.instrument,
    direction: lifecycle.direction,
    status: lifecycle.status,
    openingActivityId: lifecycle.openingActivityId,
    ...(lifecycle.closingActivityId === undefined
      ? {}
      : { closingActivityId: lifecycle.closingActivityId }),
    openedOn: lifecycle.openedOn,
    ...(lifecycle.closedOn === undefined ? {} : { closedOn: lifecycle.closedOn }),
    activityIds: lifecycle.activityIds,
    openQuantity,
    remainingOpeningPremium,
    grossRealizedPnl,
    ...(remainingOpeningFees === undefined ? {} : { remainingOpeningFees }),
    ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    lots,
    matches,
  };
}
