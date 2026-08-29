import { domainErrorSchema, type Diagnostic } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';

import { allocateRemainingFee } from './fee-allocation.js';
import {
  closeEquityLifecycle,
  createEquityLifecycle,
  recordLifecycleActivity,
  snapshotEquityLifecycle,
  type MutableEquityLifecycle,
} from './lifecycle-state.js';
import type {
  EligibleEquityTradeActivity,
  EquityLot,
  EquityLotMatch,
  EquityPositionKey,
  EquityPositionState,
  EquityReplayResult,
} from './types.js';

interface MutableEquityLot {
  readonly id: string;
  readonly lifecycleId: string;
  readonly instrument: EquityLot['instrument'];
  readonly openingActivityId: string;
  readonly openedOn: string;
  readonly originalQuantity: Decimal;
  remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly entryFees: Decimal | undefined;
  remainingEntryFees: Decimal | undefined;
  readonly provenance: EquityLot['provenance'];
}

interface MutablePositionState {
  readonly key: EquityPositionKey;
  readonly instrument: EquityPositionState['instrument'];
  readonly lots: MutableEquityLot[];
  readonly matches: EquityLotMatch[];
  readonly lifecycles: MutableEquityLifecycle[];
  grossRealizedPnl: Decimal;
  netRealizedPnl: Decimal | undefined;
}

function mapKey(activity: EligibleEquityTradeActivity): string {
  return JSON.stringify([activity.broker, activity.accountId ?? null, activity.instrument.symbol]);
}

function positionKey(activity: EligibleEquityTradeActivity): EquityPositionKey {
  return {
    broker: activity.broker,
    ...(activity.accountId === undefined ? {} : { accountId: activity.accountId }),
    symbol: activity.instrument.symbol,
  };
}

function openQuantity(position: MutablePositionState): Decimal {
  return position.lots.reduce(
    (quantity, lot) => quantity.plus(lot.remainingQuantity),
    new Decimal(0),
  );
}

function sellWithoutPositionDiagnostic(activity: EligibleEquityTradeActivity): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'SELL_WITHOUT_OPEN_POSITION',
    message: 'Sell activity has no open long-equity position to close.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: {
      activityId: activity.id,
      symbol: activity.instrument.symbol,
      sellQuantity: activity.quantity.toString(),
    },
  });
}

function negativePositionDiagnostic(
  activity: EligibleEquityTradeActivity,
  availableQuantity: Decimal,
): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'NEGATIVE_POSITION',
    message: 'Sell quantity exceeds the available long-equity position.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: {
      activityId: activity.id,
      symbol: activity.instrument.symbol,
      sellQuantity: activity.quantity.toString(),
      availableQuantity: availableQuantity.toString(),
    },
  });
}

function addBuy(
  position: MutablePositionState,
  lifecycle: MutableEquityLifecycle,
  activity: EligibleEquityTradeActivity,
): void {
  position.lots.push({
    id: `lot:${activity.id}`,
    lifecycleId: lifecycle.id,
    instrument: activity.instrument,
    openingActivityId: activity.id,
    openedOn: activity.activityDate,
    originalQuantity: activity.quantity,
    remainingQuantity: activity.quantity,
    entryPrice: activity.price,
    entryFees: activity.fees?.total,
    remainingEntryFees: activity.fees?.total,
    provenance: activity.provenance,
  });
}

function applySell(
  position: MutablePositionState,
  lifecycle: MutableEquityLifecycle,
  activity: EligibleEquityTradeActivity,
): void {
  let quantityToMatch = activity.quantity;
  let remainingExitFees = activity.fees?.total;
  let matchIndex = position.matches.length;

  for (const lot of position.lots) {
    if (quantityToMatch.isZero()) {
      break;
    }
    if (lot.remainingQuantity.isZero()) {
      continue;
    }

    const matchedQuantity = Decimal.min(quantityToMatch, lot.remainingQuantity);
    const entryCostBasis = lot.entryPrice.times(matchedQuantity);
    const exitProceeds = activity.price.times(matchedQuantity);
    const grossRealizedPnl = exitProceeds.minus(entryCostBasis);
    const entryFeeAllocation = allocateRemainingFee(
      lot.remainingEntryFees,
      matchedQuantity,
      lot.remainingQuantity,
    );
    const exitFeeAllocation = allocateRemainingFee(
      remainingExitFees,
      matchedQuantity,
      quantityToMatch,
    );
    const netRealizedPnl =
      entryFeeAllocation.allocated === undefined || exitFeeAllocation.allocated === undefined
        ? undefined
        : grossRealizedPnl.minus(entryFeeAllocation.allocated).minus(exitFeeAllocation.allocated);
    const match: EquityLotMatch = {
      id: `match:${lot.openingActivityId}:${activity.id}:${matchIndex}`,
      lifecycleId: lifecycle.id,
      instrument: activity.instrument,
      openingActivityId: lot.openingActivityId,
      closingActivityId: activity.id,
      matchedQuantity,
      entryPrice: lot.entryPrice,
      exitPrice: activity.price,
      entryCostBasis,
      exitProceeds,
      grossRealizedPnl,
      ...(entryFeeAllocation.allocated === undefined
        ? {}
        : { entryFees: entryFeeAllocation.allocated }),
      ...(exitFeeAllocation.allocated === undefined
        ? {}
        : { exitFees: exitFeeAllocation.allocated }),
      ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    };

    lot.remainingQuantity = lot.remainingQuantity.minus(matchedQuantity);
    lot.remainingEntryFees = entryFeeAllocation.remaining;
    quantityToMatch = quantityToMatch.minus(matchedQuantity);
    remainingExitFees = exitFeeAllocation.remaining;
    position.grossRealizedPnl = position.grossRealizedPnl.plus(grossRealizedPnl);
    position.netRealizedPnl =
      position.netRealizedPnl === undefined || netRealizedPnl === undefined
        ? undefined
        : position.netRealizedPnl.plus(netRealizedPnl);
    position.matches.push(match);
    matchIndex += 1;
  }
}

function snapshot(position: MutablePositionState): EquityPositionState {
  const quantity = openQuantity(position);
  const remainingCostBasis = position.lots.reduce(
    (costBasis, lot) => costBasis.plus(lot.entryPrice.times(lot.remainingQuantity)),
    new Decimal(0),
  );
  const hasUnknownRemainingFees = position.lots.some(
    (lot) => !lot.remainingQuantity.isZero() && lot.remainingEntryFees === undefined,
  );
  const remainingEntryFees = hasUnknownRemainingFees
    ? undefined
    : position.lots.reduce((fees, lot) => fees.plus(lot.remainingEntryFees ?? 0), new Decimal(0));

  const lots: EquityLot[] = position.lots.map((lot) => ({
    id: lot.id,
    lifecycleId: lot.lifecycleId,
    instrument: lot.instrument,
    openingActivityId: lot.openingActivityId,
    openedOn: lot.openedOn,
    originalQuantity: lot.originalQuantity,
    remainingQuantity: lot.remainingQuantity,
    entryPrice: lot.entryPrice,
    ...(lot.entryFees === undefined ? {} : { entryFees: lot.entryFees }),
    ...(lot.remainingEntryFees === undefined ? {} : { remainingEntryFees: lot.remainingEntryFees }),
    provenance: lot.provenance,
  }));

  return {
    key: position.key,
    instrument: position.instrument,
    openQuantity: quantity,
    remainingCostBasis,
    grossRealizedPnl: position.grossRealizedPnl,
    ...(remainingEntryFees === undefined ? {} : { remainingEntryFees }),
    ...(position.netRealizedPnl === undefined ? {} : { netRealizedPnl: position.netRealizedPnl }),
    lots,
    matches: position.matches,
    lifecycles: position.lifecycles.map((lifecycle) =>
      snapshotEquityLifecycle(lifecycle, lots, position.matches),
    ),
  };
}

/**
 * Replays already prepared activities into a long-only FIFO lot ledger.
 * Invalid sells are rejected atomically and leave inventory unchanged.
 */
export function replayEquityActivities(
  activities: readonly EligibleEquityTradeActivity[],
): EquityReplayResult {
  const positions = new Map<string, MutablePositionState>();
  const diagnostics: Diagnostic[] = [];

  for (const activity of activities) {
    const key = mapKey(activity);
    let position = positions.get(key);

    if (activity.side === 'buy') {
      if (position === undefined) {
        position = {
          key: positionKey(activity),
          instrument: activity.instrument,
          lots: [],
          matches: [],
          lifecycles: [],
          grossRealizedPnl: new Decimal(0),
          netRealizedPnl: new Decimal(0),
        };
        positions.set(key, position);
      }
      if (openQuantity(position).isZero()) {
        position.lifecycles.push(createEquityLifecycle(activity, position.key));
      } else {
        recordLifecycleActivity(position.lifecycles.at(-1)!, activity);
      }
      addBuy(position, position.lifecycles.at(-1)!, activity);
      continue;
    }

    if (position === undefined) {
      diagnostics.push(sellWithoutPositionDiagnostic(activity));
      continue;
    }

    const availableQuantity = openQuantity(position);
    if (availableQuantity.isZero()) {
      diagnostics.push(sellWithoutPositionDiagnostic(activity));
      continue;
    }
    if (activity.quantity.greaterThan(availableQuantity)) {
      diagnostics.push(negativePositionDiagnostic(activity, availableQuantity));
      continue;
    }

    const lifecycle = position.lifecycles.at(-1)!;
    recordLifecycleActivity(lifecycle, activity);
    applySell(position, lifecycle, activity);
    if (openQuantity(position).isZero()) {
      closeEquityLifecycle(lifecycle, activity);
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
