import { Decimal } from 'decimal.js';

import type {
  EligibleEquityTradeActivity,
  EquityLot,
  EquityLotMatch,
  EquityPositionKey,
  EquityPositionLifecycle,
} from './types.js';

export interface MutableEquityLifecycle {
  readonly id: string;
  readonly key: EquityPositionKey;
  readonly instrument: EquityPositionLifecycle['instrument'];
  status: EquityPositionLifecycle['status'];
  readonly openingActivityId: string;
  closingActivityId: string | undefined;
  readonly openedOn: string;
  closedOn: string | undefined;
  readonly activityIds: string[];
}

export function createEquityLifecycle(
  activity: EligibleEquityTradeActivity,
  key: EquityPositionKey,
): MutableEquityLifecycle {
  return {
    id: `lifecycle:${activity.id}`,
    key,
    instrument: activity.instrument,
    status: 'open',
    openingActivityId: activity.id,
    closingActivityId: undefined,
    openedOn: activity.activityDate,
    closedOn: undefined,
    activityIds: [activity.id],
  };
}

export function recordLifecycleActivity(
  lifecycle: MutableEquityLifecycle,
  activity: EligibleEquityTradeActivity,
): void {
  lifecycle.activityIds.push(activity.id);
}

export function closeEquityLifecycle(
  lifecycle: MutableEquityLifecycle,
  activity: EligibleEquityTradeActivity,
): void {
  lifecycle.status = 'closed';
  lifecycle.closingActivityId = activity.id;
  lifecycle.closedOn = activity.activityDate;
}

export function snapshotEquityLifecycle(
  lifecycle: MutableEquityLifecycle,
  allLots: readonly EquityLot[],
  allMatches: readonly EquityLotMatch[],
): EquityPositionLifecycle {
  const lots = allLots.filter((lot) => lot.lifecycleId === lifecycle.id);
  const matches = allMatches.filter((match) => match.lifecycleId === lifecycle.id);
  const openQuantity = lots.reduce(
    (quantity, lot) => quantity.plus(lot.remainingQuantity),
    new Decimal(0),
  );
  const remainingCostBasis = lots.reduce(
    (costBasis, lot) => costBasis.plus(lot.entryPrice.times(lot.remainingQuantity)),
    new Decimal(0),
  );
  const grossRealizedPnl = matches.reduce(
    (pnl, match) => pnl.plus(match.grossRealizedPnl),
    new Decimal(0),
  );
  const hasUnknownRemainingFees = lots.some(
    (lot) => !lot.remainingQuantity.isZero() && lot.remainingEntryFees === undefined,
  );
  const remainingEntryFees = hasUnknownRemainingFees
    ? undefined
    : lots.reduce((fees, lot) => fees.plus(lot.remainingEntryFees ?? 0), new Decimal(0));
  const netRealizedPnl = matches.some((match) => match.netRealizedPnl === undefined)
    ? undefined
    : matches.reduce((pnl, match) => pnl.plus(match.netRealizedPnl ?? 0), new Decimal(0));

  return {
    id: lifecycle.id,
    key: lifecycle.key,
    instrument: lifecycle.instrument,
    status: lifecycle.status,
    openingActivityId: lifecycle.openingActivityId,
    ...(lifecycle.closingActivityId === undefined
      ? {}
      : { closingActivityId: lifecycle.closingActivityId }),
    openedOn: lifecycle.openedOn,
    ...(lifecycle.closedOn === undefined ? {} : { closedOn: lifecycle.closedOn }),
    activityIds: lifecycle.activityIds,
    openQuantity,
    remainingCostBasis,
    grossRealizedPnl,
    ...(remainingEntryFees === undefined ? {} : { remainingEntryFees }),
    ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    lots,
    matches,
  };
}
