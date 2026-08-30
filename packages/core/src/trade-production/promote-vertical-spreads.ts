import { tradeSchema, type Trade } from '@trade-normalizer/schemas';

import type {
  VerticalSpreadLifecycle,
  VerticalSpreadLifecycleLeg,
  VerticalSpreadReconstructionResult,
} from '../vertical-spreads/types.js';
import {
  createCanonicalTradeId,
  createCanonicalTradeLegId,
  type TradeIdentityLegInput,
} from './identity.js';
import { buildTradeTiming } from './timing.js';

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function identityLeg(leg: VerticalSpreadLifecycleLeg): TradeIdentityLegInput {
  return {
    instrument: leg.instrument,
    direction: leg.direction,
    quantity: leg.quantity,
    lifecycleIds: [leg.lifecycleId],
    openingActivityIds: [leg.openingActivityId],
  };
}

function promoteLeg(
  tradeId: string,
  leg: VerticalSpreadLifecycleLeg,
  identity: TradeIdentityLegInput,
) {
  return {
    id: createCanonicalTradeLegId(tradeId, identity),
    instrument: leg.instrument,
    direction: leg.direction,
    quantity: leg.quantity,
    openQuantity: leg.openQuantity,
    lifecycleIds: [leg.lifecycleId],
    openingActivityIds: [leg.openingActivityId],
    closingActivityIds: unique(leg.matchAllocations.map((match) => match.closingActivityId)),
    executionIds: [],
    grossRealizedPnl: leg.grossRealizedPnl,
    ...(leg.realizedFees === undefined ? {} : { fees: leg.realizedFees }),
    ...(leg.netRealizedPnl === undefined ? {} : { netRealizedPnl: leg.netRealizedPnl }),
  };
}

function promoteSpread(spread: VerticalSpreadLifecycle): Trade {
  const lowerIdentity = identityLeg(spread.lowerStrikeLeg);
  const higherIdentity = identityLeg(spread.higherStrikeLeg);
  const identity = {
    broker: spread.broker,
    ...(spread.accountId === undefined ? {} : { accountId: spread.accountId }),
    strategy: spread.strategy,
    legs: [lowerIdentity, higherIdentity],
  };
  const tradeId = createCanonicalTradeId(identity);
  const closed =
    spread.status === 'closed' &&
    spread.lastClosedOn !== undefined &&
    spread.closingTimestampPrecision !== undefined
      ? buildTradeTiming(spread.lastClosedOn, spread.lastClosedAt, spread.closingTimestampPrecision)
      : undefined;

  return tradeSchema.parse({
    id: tradeId,
    broker: spread.broker,
    ...(spread.accountId === undefined ? {} : { accountId: spread.accountId }),
    underlying: spread.underlying,
    assetType: 'option',
    strategy: spread.strategy,
    status: spread.status,
    opened: buildTradeTiming(spread.openedOn, spread.openedAt, spread.openingTimestampPrecision),
    ...(closed === undefined ? {} : { closed }),
    legs: [
      promoteLeg(tradeId, spread.lowerStrikeLeg, lowerIdentity),
      promoteLeg(tradeId, spread.higherStrikeLeg, higherIdentity),
    ],
    grossRealizedPnl: spread.grossRealizedPnl,
    ...(spread.realizedFees === undefined ? {} : { fees: spread.realizedFees }),
    ...(spread.netRealizedPnl === undefined ? {} : { netRealizedPnl: spread.netRealizedPnl }),
    strategyInference: {
      level: spread.evidence.evidenceLevel,
      correlation: spread.evidence.correlation,
      openingTimeDistanceMs: spread.evidence.openingTimeDistanceMs,
      candidateId: spread.candidateId,
    },
    warnings: [],
  });
}

/** Promotes existing Phase 7 classifications without performing new strategy inference. */
export function promoteVerticalSpreadTrades(
  reconstruction: Pick<VerticalSpreadReconstructionResult, 'spreads'>,
): readonly Trade[] {
  return reconstruction.spreads
    .map(promoteSpread)
    .sort((left, right) => left.id.localeCompare(right.id));
}
