import { Decimal } from 'decimal.js';

import type { BrokerActivity } from '@trade-normalizer/schemas';

import type { OptionLotMatch, OptionReconstructionResult } from '../option-reconstruction/types.js';
import { buildVerticalSpreadLifecycleLeg } from './build-lifecycle-leg.js';
import type {
  VerticalSpreadLegAllocation,
  VerticalSpreadLifecycle,
  VerticalSpreadLifecycleLeg,
  VerticalSpreadOwnershipAllocation,
} from './types.js';

interface ClosingEvidence {
  readonly closedOn: string;
  readonly closedAt?: string;
  readonly precision: BrokerActivity['timestampPrecision'];
  readonly sourceIndex: number;
}

function latestClosingEvidence(
  legs: readonly VerticalSpreadLifecycleLeg[],
): ClosingEvidence | undefined {
  const evidence = legs.flatMap((leg) =>
    leg.matchAllocations.map((match) => ({
      closedOn: match.closedOn,
      ...(match.closedAt === undefined ? {} : { closedAt: match.closedAt }),
      precision: match.closingTimestampPrecision,
      sourceIndex: match.closingSourceIndex,
    })),
  );
  return evidence
    .sort((left, right) => {
      const leftKey = left.closedAt ?? left.closedOn;
      const rightKey = right.closedAt ?? right.closedOn;
      return leftKey === rightKey
        ? left.sourceIndex - right.sourceIndex
        : leftKey.localeCompare(rightKey);
    })
    .at(-1);
}

function buildLifecycle(
  reconstruction: OptionReconstructionResult,
  allocation: VerticalSpreadOwnershipAllocation,
): VerticalSpreadLifecycle {
  const lots = reconstruction.positions.flatMap((position) => position.lots);
  const lotById = new Map(lots.map((lot) => [lot.id, lot] as const));
  const matchesByOpeningActivity = new Map<string, OptionLotMatch[]>();
  for (const match of reconstruction.matches) {
    const matches = matchesByOpeningActivity.get(match.openingActivityId) ?? [];
    matches.push(match);
    matchesByOpeningActivity.set(match.openingActivityId, matches);
  }

  const buildAllocatedLeg = (leg: VerticalSpreadLegAllocation) => {
    const lot = lotById.get(leg.lotId);
    if (lot === undefined) throw new Error(`Missing option lot ${leg.lotId}.`);
    return buildVerticalSpreadLifecycleLeg(
      leg,
      lot,
      matchesByOpeningActivity.get(lot.openingActivityId) ?? [],
    );
  };
  const lowerStrikeLeg = buildAllocatedLeg(allocation.lowerStrikeLeg);
  const higherStrikeLeg = buildAllocatedLeg(allocation.higherStrikeLeg);
  const legs = [lowerStrikeLeg, higherStrikeLeg] as const;
  const closedQuantity = Decimal.min(lowerStrikeLeg.closedQuantity, higherStrikeLeg.closedQuantity);
  const openQuantity = allocation.quantity.minus(closedQuantity);
  const anyLegClosed = legs.some((leg) => !leg.closedQuantity.isZero());
  const status = openQuantity.isZero() ? 'closed' : anyLegClosed ? 'partially_closed' : 'open';
  const openingNetCashFlow = lowerStrikeLeg.openingCashFlow.plus(higherStrikeLeg.openingCashFlow);
  const closingNetCashFlow = lowerStrikeLeg.closingCashFlow.plus(higherStrikeLeg.closingCashFlow);
  const grossRealizedPnl = lowerStrikeLeg.grossRealizedPnl.plus(higherStrikeLeg.grossRealizedPnl);
  const realizedFees =
    lowerStrikeLeg.realizedFees === undefined || higherStrikeLeg.realizedFees === undefined
      ? undefined
      : lowerStrikeLeg.realizedFees.plus(higherStrikeLeg.realizedFees);
  const netRealizedPnl =
    lowerStrikeLeg.netRealizedPnl === undefined || higherStrikeLeg.netRealizedPnl === undefined
      ? undefined
      : lowerStrikeLeg.netRealizedPnl.plus(higherStrikeLeg.netRealizedPnl);
  const lastClose = latestClosingEvidence(legs);
  if (lowerStrikeLeg.openedAt === undefined || higherStrikeLeg.openedAt === undefined) {
    throw new Error(`Vertical allocation ${allocation.id} lacks confirmed opening timestamps.`);
  }
  const openedAt = [lowerStrikeLeg.openedAt, higherStrikeLeg.openedAt].sort().at(-1)!;

  return {
    id: `vertical-lifecycle:${allocation.id}`,
    candidateId: allocation.candidateId,
    strategy: allocation.strategy,
    broker: lowerStrikeLeg.positionKey.broker,
    ...(lowerStrikeLeg.positionKey.accountId === undefined
      ? {}
      : { accountId: lowerStrikeLeg.positionKey.accountId }),
    underlying: lowerStrikeLeg.instrument.underlying,
    expiration: lowerStrikeLeg.instrument.expiration,
    optionType: lowerStrikeLeg.instrument.optionType,
    multiplier: lowerStrikeLeg.instrument.multiplier,
    quantity: allocation.quantity,
    closedQuantity,
    openQuantity,
    status,
    openedOn: [lowerStrikeLeg.openedOn, higherStrikeLeg.openedOn].sort().at(-1)!,
    openedAt,
    openingTimestampPrecision: 'datetime',
    ...(lastClose === undefined
      ? {}
      : {
          lastClosedOn: lastClose.closedOn,
          ...(lastClose.closedAt === undefined ? {} : { lastClosedAt: lastClose.closedAt }),
          closingTimestampPrecision: lastClose.precision,
        }),
    openingNetCashFlow,
    closingNetCashFlow,
    grossRealizedPnl,
    ...(realizedFees === undefined ? {} : { realizedFees }),
    ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    lowerStrikeLeg,
    higherStrikeLeg,
    evidence: allocation.evidence,
  };
}

/** Builds spread accounting views from Phase 6 matches; it does not replay raw activities. */
export function buildVerticalSpreadLifecycles(
  reconstruction: OptionReconstructionResult,
  allocations: readonly VerticalSpreadOwnershipAllocation[],
): readonly VerticalSpreadLifecycle[] {
  return [...allocations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((allocation) => buildLifecycle(reconstruction, allocation));
}
