import { tradeSchema, type StrategyType, type Trade } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';

import type {
  OptionLot,
  OptionPositionDirection,
  OptionPositionLifecycle,
  OptionReconstructionResult,
} from '../option-reconstruction/types.js';
import { sameOptionInstrument } from '../option-instruments/identity.js';
import type {
  OptionLotOwnership,
  VerticalSpreadReconstructionResult,
} from '../vertical-spreads/types.js';
import {
  createCanonicalTradeId,
  createCanonicalTradeLegId,
  type TradeIdentityLegInput,
} from './identity.js';
import {
  attributeUngroupedOptionMatches,
  type AttributedOptionMatch,
} from './option-match-attribution.js';
import { buildTradeTiming } from './timing.js';

interface OwnedOptionLot {
  readonly lot: OptionLot;
  readonly ownership: OptionLotOwnership;
  readonly matches: readonly AttributedOptionMatch[];
}

function strategy(direction: OptionPositionDirection, optionType: 'call' | 'put'): StrategyType {
  if (direction === 'long') return optionType === 'call' ? 'long_call' : 'long_put';
  return optionType === 'call' ? 'short_call' : 'short_put';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function compareOpening(left: OwnedOptionLot, right: OwnedOptionLot): number {
  if (left.lot.openedOn !== right.lot.openedOn) {
    return left.lot.openedOn.localeCompare(right.lot.openedOn);
  }
  return left.lot.provenance.sourceIndex - right.lot.provenance.sourceIndex;
}

function latestMatch(matches: readonly AttributedOptionMatch[]): AttributedOptionMatch | undefined {
  return [...matches]
    .sort((left, right) => {
      if (left.closedOn !== right.closedOn) return left.closedOn.localeCompare(right.closedOn);
      if (left.closedAt !== undefined && right.closedAt !== undefined) {
        const timestampOrder = left.closedAt.localeCompare(right.closedAt);
        if (timestampOrder !== 0) return timestampOrder;
      }
      return left.closingSourceIndex - right.closingSourceIndex;
    })
    .at(-1);
}

function validateOwnership(lot: OptionLot, ownership: OptionLotOwnership): void {
  if (
    ownership.lifecycleId !== lot.lifecycleId ||
    ownership.lotId !== lot.id ||
    !ownership.totalQuantity.equals(lot.originalQuantity) ||
    !ownership.allocatedQuantity.plus(ownership.ungroupedQuantity).equals(lot.originalQuantity) ||
    !ownership.ungroupedQuantity.gt(0) ||
    ownership.direction !== lot.direction ||
    !sameOptionInstrument(ownership.instrument, lot.instrument)
  ) {
    throw new Error(`Inconsistent ungrouped option ownership for lot ${ownership.lotId}.`);
  }
}

function ownedLots(
  lifecycle: OptionPositionLifecycle,
  ownership: readonly OptionLotOwnership[],
): readonly OwnedOptionLot[] {
  const lotById = new Map(lifecycle.lots.map((lot) => [lot.id, lot] as const));
  const seen = new Set<string>();
  return ownership
    .map((item) => {
      if (seen.has(item.lotId))
        throw new Error(`Duplicate option ownership for lot ${item.lotId}.`);
      seen.add(item.lotId);
      const lot = lotById.get(item.lotId);
      if (lot === undefined) throw new Error(`Missing option lot ${item.lotId}.`);
      validateOwnership(lot, item);
      const matches = lifecycle.matches.filter(
        (match) => match.openingActivityId === lot.openingActivityId,
      );
      return {
        lot,
        ownership: item,
        matches: attributeUngroupedOptionMatches(
          matches,
          item.ungroupedQuantity,
          item.allocatedQuantity,
        ),
      };
    })
    .sort(compareOpening);
}

function promoteLifecycle(
  lifecycle: OptionPositionLifecycle,
  ownership: readonly OptionLotOwnership[],
): Trade {
  const lots = ownedLots(lifecycle, ownership);
  const quantity = lots.reduce(
    (total, item) => total.plus(item.ownership.ungroupedQuantity),
    new Decimal(0),
  );
  const matches = lots.flatMap((item) => item.matches);
  const closedQuantity = matches.reduce(
    (total, match) => total.plus(match.quantity),
    new Decimal(0),
  );
  const openQuantity = quantity.minus(closedQuantity);
  const grossRealizedPnl = matches.reduce(
    (total, match) => total.plus(match.grossRealizedPnl),
    new Decimal(0),
  );
  const fees = matches.some((match) => match.fees === undefined)
    ? undefined
    : matches.reduce((total, match) => total.plus(match.fees ?? 0), new Decimal(0));
  const netRealizedPnl = matches.some((match) => match.netRealizedPnl === undefined)
    ? undefined
    : matches.reduce((total, match) => total.plus(match.netRealizedPnl ?? 0), new Decimal(0));
  const openingActivityIds = unique(lots.map((item) => item.lot.openingActivityId));
  const closingActivityIds = unique(matches.map((match) => match.closingActivityId));
  const tradeStrategy = strategy(lifecycle.direction, lifecycle.instrument.optionType);
  const identityLeg: TradeIdentityLegInput = {
    instrument: lifecycle.instrument,
    direction: lifecycle.direction,
    quantity,
    lifecycleIds: [lifecycle.id],
    openingActivityIds,
  };
  const identity = {
    broker: lifecycle.key.broker,
    ...(lifecycle.key.accountId === undefined ? {} : { accountId: lifecycle.key.accountId }),
    strategy: tradeStrategy,
    legs: [identityLeg],
  };
  const tradeId = createCanonicalTradeId(identity);
  const firstLot = lots[0]!;
  const finalMatch = latestMatch(matches);
  const status = openQuantity.isZero()
    ? 'closed'
    : matches.length > 0
      ? 'partially_closed'
      : 'open';
  const closed =
    status === 'closed' && finalMatch !== undefined
      ? buildTradeTiming(
          finalMatch.closedOn,
          finalMatch.closedAt,
          finalMatch.closingTimestampPrecision,
        )
      : undefined;

  return tradeSchema.parse({
    id: tradeId,
    broker: lifecycle.key.broker,
    ...(lifecycle.key.accountId === undefined ? {} : { accountId: lifecycle.key.accountId }),
    underlying: lifecycle.instrument.underlying,
    assetType: 'option',
    strategy: tradeStrategy,
    status,
    opened: buildTradeTiming(
      firstLot.lot.openedOn,
      firstLot.lot.openedAt,
      firstLot.lot.timestampPrecision,
    ),
    ...(closed === undefined ? {} : { closed }),
    legs: [
      {
        id: createCanonicalTradeLegId(tradeId, identityLeg),
        instrument: lifecycle.instrument,
        direction: lifecycle.direction,
        quantity,
        openQuantity,
        lifecycleIds: [lifecycle.id],
        openingActivityIds,
        closingActivityIds,
        executionIds: [],
        grossRealizedPnl,
        ...(fees === undefined ? {} : { fees }),
        ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
      },
    ],
    grossRealizedPnl,
    ...(fees === undefined ? {} : { fees }),
    ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    warnings: [],
  });
}

/** Promotes only option opening-lot quantity left ungrouped by Phase 7. */
export function promoteSingleLegOptionTrades(
  optionReconstruction: Pick<OptionReconstructionResult, 'lifecycles'>,
  verticalReconstruction: Pick<VerticalSpreadReconstructionResult, 'ungrouped'>,
): readonly Trade[] {
  const lifecycleIds = new Set(optionReconstruction.lifecycles.map((lifecycle) => lifecycle.id));
  const ownershipByLifecycle = new Map<string, OptionLotOwnership[]>();
  for (const ownership of verticalReconstruction.ungrouped) {
    if (!lifecycleIds.has(ownership.lifecycleId)) {
      throw new Error(`Missing option lifecycle ${ownership.lifecycleId}.`);
    }
    const values = ownershipByLifecycle.get(ownership.lifecycleId) ?? [];
    values.push(ownership);
    ownershipByLifecycle.set(ownership.lifecycleId, values);
  }

  return optionReconstruction.lifecycles
    .flatMap((lifecycle) => {
      const ownership = ownershipByLifecycle.get(lifecycle.id);
      return ownership === undefined ? [] : [promoteLifecycle(lifecycle, ownership)];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
