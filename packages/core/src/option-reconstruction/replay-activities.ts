import { Decimal } from 'decimal.js';

import { createOptionInstrumentKey } from '../option-instruments/index.js';
import { optionReversalDiagnostic } from './diagnostics.js';
import { allocateRemainingOptionFee } from './fee-allocation.js';
import {
  closeOptionLifecycle,
  createOptionLifecycle,
  recordOptionLifecycleActivity,
  snapshotOptionLifecycle,
  type MutableOptionLifecycle,
} from './lifecycle-state.js';
import { calculateOptionPremium } from './premium.js';
import type {
  EligibleOptionTradeActivity,
  OptionLot,
  OptionLotMatch,
  OptionPositionDirection,
  OptionPositionKey,
  OptionPositionState,
  OptionReplayResult,
} from './types.js';

interface MutableOptionLot {
  readonly id: string;
  readonly lifecycleId: string;
  readonly instrument: OptionLot['instrument'];
  readonly direction: OptionPositionDirection;
  readonly openingActivityId: string;
  readonly openedOn: string;
  readonly openedAt: string | undefined;
  readonly timestampPrecision: OptionLot['timestampPrecision'];
  readonly originalQuantity: Decimal;
  remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly openingFees: OptionLot['openingFees'];
  remainingOpeningFees: Decimal | undefined;
  readonly provenance: OptionLot['provenance'];
}

interface MutableOptionPosition {
  readonly key: OptionPositionKey;
  readonly instrument: OptionPositionState['instrument'];
  status: OptionPositionState['status'];
  readonly lots: MutableOptionLot[];
  readonly matches: OptionLotMatch[];
  readonly lifecycles: MutableOptionLifecycle[];
  grossRealizedPnl: Decimal;
  netRealizedPnl: Decimal | undefined;
}

function positionMapKey(activity: EligibleOptionTradeActivity): string {
  return JSON.stringify([
    activity.broker,
    activity.accountId ?? null,
    createOptionInstrumentKey(activity.instrument),
  ]);
}

function positionKey(activity: EligibleOptionTradeActivity): OptionPositionKey {
  return {
    broker: activity.broker,
    ...(activity.accountId === undefined ? {} : { accountId: activity.accountId }),
    contractKey: createOptionInstrumentKey(activity.instrument),
  };
}

function openQuantity(position: MutableOptionPosition): Decimal {
  return position.lots.reduce(
    (quantity, lot) => quantity.plus(lot.remainingQuantity),
    new Decimal(0),
  );
}

function openingDirection(activity: EligibleOptionTradeActivity): OptionPositionDirection {
  return activity.side === 'buy' ? 'long' : 'short';
}

function activityOpensDirection(
  activity: EligibleOptionTradeActivity,
  direction: OptionPositionDirection,
): boolean {
  return (
    (direction === 'long' && activity.side === 'buy') ||
    (direction === 'short' && activity.side === 'sell')
  );
}

function addOpeningLot(
  position: MutableOptionPosition,
  lifecycle: MutableOptionLifecycle,
  activity: EligibleOptionTradeActivity,
): void {
  position.lots.push({
    id: `option-lot:${activity.id}`,
    lifecycleId: lifecycle.id,
    instrument: activity.instrument,
    direction: position.status === 'flat' ? openingDirection(activity) : position.status,
    openingActivityId: activity.id,
    openedOn: activity.activityDate,
    openedAt: activity.timestamp,
    timestampPrecision: activity.timestampPrecision,
    originalQuantity: activity.quantity,
    remainingQuantity: activity.quantity,
    entryPrice: activity.price,
    openingFees: activity.fees,
    remainingOpeningFees: activity.fees?.total,
    provenance: activity.provenance,
  });
}

function applyClose(
  position: MutableOptionPosition,
  lifecycle: MutableOptionLifecycle,
  activity: EligibleOptionTradeActivity,
): void {
  const direction = position.status as OptionPositionDirection;
  let quantityToMatch = activity.quantity;
  let remainingClosingFees = activity.fees?.total;
  let matchIndex = position.matches.length;

  for (const lot of position.lots) {
    if (quantityToMatch.isZero()) {
      break;
    }
    if (lot.direction !== direction || lot.remainingQuantity.isZero()) {
      continue;
    }

    const matchedQuantity = Decimal.min(quantityToMatch, lot.remainingQuantity);
    const openingPremium = calculateOptionPremium(
      lot.entryPrice,
      matchedQuantity,
      lot.instrument.multiplier,
    );
    const closingPremium = calculateOptionPremium(
      activity.price,
      matchedQuantity,
      lot.instrument.multiplier,
    );
    const grossRealizedPnl =
      direction === 'long'
        ? closingPremium.minus(openingPremium)
        : openingPremium.minus(closingPremium);
    const openingFeeAllocation = allocateRemainingOptionFee(
      lot.remainingOpeningFees,
      matchedQuantity,
      lot.remainingQuantity,
    );
    const closingFeeAllocation = allocateRemainingOptionFee(
      remainingClosingFees,
      matchedQuantity,
      quantityToMatch,
    );
    const netRealizedPnl =
      openingFeeAllocation.allocated === undefined || closingFeeAllocation.allocated === undefined
        ? undefined
        : grossRealizedPnl
            .minus(openingFeeAllocation.allocated)
            .minus(closingFeeAllocation.allocated);

    position.matches.push({
      id: `option-match:${lot.openingActivityId}:${activity.id}:${matchIndex}`,
      lifecycleId: lifecycle.id,
      instrument: lot.instrument,
      direction,
      openingActivityId: lot.openingActivityId,
      closingActivityId: activity.id,
      matchedQuantity,
      entryPrice: lot.entryPrice,
      exitPrice: activity.price,
      openingPremium,
      closingPremium,
      grossRealizedPnl,
      ...(openingFeeAllocation.allocated === undefined
        ? {}
        : { openingFees: openingFeeAllocation.allocated }),
      ...(closingFeeAllocation.allocated === undefined
        ? {}
        : { closingFees: closingFeeAllocation.allocated }),
      ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    });

    lot.remainingQuantity = lot.remainingQuantity.minus(matchedQuantity);
    lot.remainingOpeningFees = openingFeeAllocation.remaining;
    quantityToMatch = quantityToMatch.minus(matchedQuantity);
    remainingClosingFees = closingFeeAllocation.remaining;
    position.grossRealizedPnl = position.grossRealizedPnl.plus(grossRealizedPnl);
    position.netRealizedPnl =
      position.netRealizedPnl === undefined || netRealizedPnl === undefined
        ? undefined
        : position.netRealizedPnl.plus(netRealizedPnl);
    matchIndex += 1;
  }
}

function snapshot(position: MutableOptionPosition): OptionPositionState {
  const quantity = openQuantity(position);
  const lots: OptionLot[] = position.lots.map((lot) => ({
    id: lot.id,
    lifecycleId: lot.lifecycleId,
    instrument: lot.instrument,
    direction: lot.direction,
    openingActivityId: lot.openingActivityId,
    openedOn: lot.openedOn,
    ...(lot.openedAt === undefined ? {} : { openedAt: lot.openedAt }),
    timestampPrecision: lot.timestampPrecision,
    originalQuantity: lot.originalQuantity,
    remainingQuantity: lot.remainingQuantity,
    entryPrice: lot.entryPrice,
    ...(lot.openingFees === undefined ? {} : { openingFees: lot.openingFees }),
    ...(lot.remainingOpeningFees === undefined
      ? {}
      : { remainingOpeningFees: lot.remainingOpeningFees }),
    provenance: lot.provenance,
  }));
  const remainingOpeningPremium = lots.reduce(
    (premium, lot) =>
      premium.plus(
        calculateOptionPremium(lot.entryPrice, lot.remainingQuantity, lot.instrument.multiplier),
      ),
    new Decimal(0),
  );
  const hasUnknownRemainingFees = lots.some(
    (lot) => !lot.remainingQuantity.isZero() && lot.remainingOpeningFees === undefined,
  );
  const remainingOpeningFees = hasUnknownRemainingFees
    ? undefined
    : lots.reduce((fees, lot) => fees.plus(lot.remainingOpeningFees ?? 0), new Decimal(0));

  return {
    key: position.key,
    instrument: position.instrument,
    status: quantity.isZero() ? 'flat' : position.status,
    openQuantity: quantity,
    remainingOpeningPremium,
    grossRealizedPnl: position.grossRealizedPnl,
    ...(remainingOpeningFees === undefined ? {} : { remainingOpeningFees }),
    ...(position.netRealizedPnl === undefined ? {} : { netRealizedPnl: position.netRealizedPnl }),
    lots,
    matches: position.matches,
    lifecycles: position.lifecycles.map((lifecycle) =>
      snapshotOptionLifecycle(lifecycle, lots, position.matches),
    ),
  };
}

/** Replays prepared option trades into one flat/long/short FIFO state per exact contract. */
export function replayOptionActivities(
  activities: readonly EligibleOptionTradeActivity[],
): OptionReplayResult {
  const positions = new Map<string, MutableOptionPosition>();
  const diagnostics: OptionReplayResult['diagnostics'][number][] = [];

  for (const activity of activities) {
    const key = positionMapKey(activity);
    let position = positions.get(key);

    if (position === undefined) {
      const direction = openingDirection(activity);
      position = {
        key: positionKey(activity),
        instrument: activity.instrument,
        status: direction,
        lots: [],
        matches: [],
        lifecycles: [],
        grossRealizedPnl: new Decimal(0),
        netRealizedPnl: new Decimal(0),
      };
      positions.set(key, position);
      const lifecycle = createOptionLifecycle(activity, position.key, direction);
      position.lifecycles.push(lifecycle);
      addOpeningLot(position, lifecycle, activity);
      continue;
    }

    const availableQuantity = openQuantity(position);
    if (availableQuantity.isZero()) {
      const direction = openingDirection(activity);
      position.status = direction;
      const lifecycle = createOptionLifecycle(activity, position.key, direction);
      position.lifecycles.push(lifecycle);
      addOpeningLot(position, lifecycle, activity);
      continue;
    }

    const direction = position.status as OptionPositionDirection;
    if (activityOpensDirection(activity, direction)) {
      const lifecycle = position.lifecycles.at(-1)!;
      recordOptionLifecycleActivity(lifecycle, activity);
      addOpeningLot(position, lifecycle, activity);
      continue;
    }

    if (activity.quantity.greaterThan(availableQuantity)) {
      diagnostics.push(optionReversalDiagnostic(activity, direction, availableQuantity));
      continue;
    }

    const lifecycle = position.lifecycles.at(-1)!;
    recordOptionLifecycleActivity(lifecycle, activity);
    applyClose(position, lifecycle, activity);
    if (openQuantity(position).isZero()) {
      position.status = 'flat';
      closeOptionLifecycle(lifecycle, activity);
    }
  }

  const positionSnapshots = [...positions.values()].map(snapshot);
  return {
    positions: positionSnapshots,
    matches: positionSnapshots.flatMap((position) => position.matches),
    lifecycles: positionSnapshots.flatMap((position) => position.lifecycles),
    diagnostics,
  };
}
