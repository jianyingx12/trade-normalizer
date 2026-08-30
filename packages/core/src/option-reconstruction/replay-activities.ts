import { Decimal } from 'decimal.js';

import { createOptionInstrumentKey } from '../option-instruments/index.js';
import { optionReversalDiagnostic } from './diagnostics.js';
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
  readonly instrument: OptionLot['instrument'];
  readonly direction: OptionPositionDirection;
  readonly openingActivityId: string;
  readonly openedOn: string;
  readonly originalQuantity: Decimal;
  remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly openingFees: OptionLot['openingFees'];
  readonly provenance: OptionLot['provenance'];
}

interface MutableOptionPosition {
  readonly key: OptionPositionKey;
  readonly instrument: OptionPositionState['instrument'];
  status: OptionPositionState['status'];
  readonly lots: MutableOptionLot[];
  readonly matches: OptionLotMatch[];
  grossRealizedPnl: Decimal;
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
  activity: EligibleOptionTradeActivity,
): void {
  position.lots.push({
    id: `option-lot:${activity.id}`,
    instrument: activity.instrument,
    direction: position.status === 'flat' ? openingDirection(activity) : position.status,
    openingActivityId: activity.id,
    openedOn: activity.activityDate,
    originalQuantity: activity.quantity,
    remainingQuantity: activity.quantity,
    entryPrice: activity.price,
    openingFees: activity.fees,
    provenance: activity.provenance,
  });
}

function applyClose(position: MutableOptionPosition, activity: EligibleOptionTradeActivity): void {
  const direction = position.status as OptionPositionDirection;
  let quantityToMatch = activity.quantity;
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

    position.matches.push({
      id: `option-match:${lot.openingActivityId}:${activity.id}:${matchIndex}`,
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
    });

    lot.remainingQuantity = lot.remainingQuantity.minus(matchedQuantity);
    quantityToMatch = quantityToMatch.minus(matchedQuantity);
    position.grossRealizedPnl = position.grossRealizedPnl.plus(grossRealizedPnl);
    matchIndex += 1;
  }
}

function snapshot(position: MutableOptionPosition): OptionPositionState {
  const quantity = openQuantity(position);
  const lots: OptionLot[] = position.lots.map((lot) => ({
    id: lot.id,
    instrument: lot.instrument,
    direction: lot.direction,
    openingActivityId: lot.openingActivityId,
    openedOn: lot.openedOn,
    originalQuantity: lot.originalQuantity,
    remainingQuantity: lot.remainingQuantity,
    entryPrice: lot.entryPrice,
    ...(lot.openingFees === undefined ? {} : { openingFees: lot.openingFees }),
    provenance: lot.provenance,
  }));
  const remainingOpeningPremium = lots.reduce(
    (premium, lot) =>
      premium.plus(
        calculateOptionPremium(lot.entryPrice, lot.remainingQuantity, lot.instrument.multiplier),
      ),
    new Decimal(0),
  );

  return {
    key: position.key,
    instrument: position.instrument,
    status: quantity.isZero() ? 'flat' : position.status,
    openQuantity: quantity,
    remainingOpeningPremium,
    grossRealizedPnl: position.grossRealizedPnl,
    lots,
    matches: position.matches,
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
      position = {
        key: positionKey(activity),
        instrument: activity.instrument,
        status: openingDirection(activity),
        lots: [],
        matches: [],
        grossRealizedPnl: new Decimal(0),
      };
      positions.set(key, position);
      addOpeningLot(position, activity);
      continue;
    }

    const availableQuantity = openQuantity(position);
    if (availableQuantity.isZero()) {
      position.status = openingDirection(activity);
      addOpeningLot(position, activity);
      continue;
    }

    const direction = position.status as OptionPositionDirection;
    if (activityOpensDirection(activity, direction)) {
      addOpeningLot(position, activity);
      continue;
    }

    if (activity.quantity.greaterThan(availableQuantity)) {
      diagnostics.push(optionReversalDiagnostic(activity, direction, availableQuantity));
      continue;
    }

    applyClose(position, activity);
    if (openQuantity(position).isZero()) {
      position.status = 'flat';
    }
  }

  const positionSnapshots = [...positions.values()].map(snapshot);
  return {
    positions: positionSnapshots,
    matches: positionSnapshots.flatMap((position) => position.matches),
    diagnostics,
  };
}
