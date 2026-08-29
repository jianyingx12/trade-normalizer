import { domainErrorSchema, type Diagnostic } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';

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
  readonly instrument: EquityLot['instrument'];
  readonly openingActivityId: string;
  readonly openedOn: string;
  readonly originalQuantity: Decimal;
  remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly provenance: EquityLot['provenance'];
}

interface MutablePositionState {
  readonly key: EquityPositionKey;
  readonly instrument: EquityPositionState['instrument'];
  readonly lots: MutableEquityLot[];
  readonly matches: EquityLotMatch[];
  grossRealizedPnl: Decimal;
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

function addBuy(position: MutablePositionState, activity: EligibleEquityTradeActivity): void {
  position.lots.push({
    id: `lot:${activity.id}`,
    instrument: activity.instrument,
    openingActivityId: activity.id,
    openedOn: activity.activityDate,
    originalQuantity: activity.quantity,
    remainingQuantity: activity.quantity,
    entryPrice: activity.price,
    provenance: activity.provenance,
  });
}

function applySell(position: MutablePositionState, activity: EligibleEquityTradeActivity): void {
  let quantityToMatch = activity.quantity;
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
    const match: EquityLotMatch = {
      id: `match:${lot.openingActivityId}:${activity.id}:${matchIndex}`,
      instrument: activity.instrument,
      openingActivityId: lot.openingActivityId,
      closingActivityId: activity.id,
      matchedQuantity,
      entryPrice: lot.entryPrice,
      exitPrice: activity.price,
      entryCostBasis,
      exitProceeds,
      grossRealizedPnl,
    };

    lot.remainingQuantity = lot.remainingQuantity.minus(matchedQuantity);
    quantityToMatch = quantityToMatch.minus(matchedQuantity);
    position.grossRealizedPnl = position.grossRealizedPnl.plus(grossRealizedPnl);
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

  return {
    key: position.key,
    instrument: position.instrument,
    openQuantity: quantity,
    remainingCostBasis,
    grossRealizedPnl: position.grossRealizedPnl,
    lots: position.lots,
    matches: position.matches,
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
          grossRealizedPnl: new Decimal(0),
        };
        positions.set(key, position);
      }
      addBuy(position, activity);
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

    applySell(position, activity);
  }

  const positionSnapshots = [...positions.values()].map(snapshot);

  return {
    positions: positionSnapshots,
    matches: positionSnapshots.flatMap((position) => position.matches),
    diagnostics,
  };
}
