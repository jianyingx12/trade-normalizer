import { tradeSchema, type Trade } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';

import type {
  EquityPositionLifecycle,
  EquityReconstructionResult,
} from '../equity-reconstruction/types.js';
import { deriveKnownRealizedFees } from './accounting.js';
import {
  createCanonicalTradeId,
  createCanonicalTradeLegId,
  type TradeIdentityLegInput,
} from './identity.js';
import { buildTradeTiming } from './timing.js';

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function totalOwnedQuantity(lifecycle: EquityPositionLifecycle): Decimal {
  return lifecycle.lots.reduce(
    (quantity, lot) => quantity.plus(lot.originalQuantity),
    new Decimal(0),
  );
}

function promoteLifecycle(lifecycle: EquityPositionLifecycle): Trade {
  const quantity = totalOwnedQuantity(lifecycle);
  const openingActivityIds = unique(lifecycle.lots.map((lot) => lot.openingActivityId));
  const closingActivityIds = unique(lifecycle.matches.map((match) => match.closingActivityId));
  const identityLeg: TradeIdentityLegInput = {
    instrument: lifecycle.instrument,
    direction: 'long',
    quantity,
    lifecycleIds: [lifecycle.id],
    openingActivityIds,
  };
  const identity = {
    broker: lifecycle.key.broker,
    ...(lifecycle.key.accountId === undefined ? {} : { accountId: lifecycle.key.accountId }),
    strategy: 'equity_long' as const,
    legs: [identityLeg],
  };
  const tradeId = createCanonicalTradeId(identity);
  const fees = deriveKnownRealizedFees(lifecycle.grossRealizedPnl, lifecycle.netRealizedPnl);
  const status =
    lifecycle.status === 'closed'
      ? 'closed'
      : lifecycle.matches.length > 0
        ? 'partially_closed'
        : 'open';
  const closed =
    lifecycle.status === 'closed' &&
    lifecycle.closedOn !== undefined &&
    lifecycle.closingTimestampPrecision !== undefined
      ? buildTradeTiming(
          lifecycle.closedOn,
          lifecycle.closedAt,
          lifecycle.closingTimestampPrecision,
        )
      : undefined;

  return tradeSchema.parse({
    id: tradeId,
    broker: lifecycle.key.broker,
    ...(lifecycle.key.accountId === undefined ? {} : { accountId: lifecycle.key.accountId }),
    underlying: lifecycle.instrument.symbol,
    assetType: 'equity',
    strategy: 'equity_long',
    status,
    opened: buildTradeTiming(
      lifecycle.openedOn,
      lifecycle.openedAt,
      lifecycle.openingTimestampPrecision,
    ),
    ...(closed === undefined ? {} : { closed }),
    legs: [
      {
        id: createCanonicalTradeLegId(tradeId, identityLeg),
        instrument: lifecycle.instrument,
        direction: 'long',
        quantity,
        openQuantity: lifecycle.openQuantity,
        lifecycleIds: [lifecycle.id],
        openingActivityIds,
        closingActivityIds,
        executionIds: [],
        grossRealizedPnl: lifecycle.grossRealizedPnl,
        ...(fees === undefined ? {} : { fees }),
        ...(lifecycle.netRealizedPnl === undefined
          ? {}
          : { netRealizedPnl: lifecycle.netRealizedPnl }),
      },
    ],
    grossRealizedPnl: lifecycle.grossRealizedPnl,
    ...(fees === undefined ? {} : { fees }),
    ...(lifecycle.netRealizedPnl === undefined ? {} : { netRealizedPnl: lifecycle.netRealizedPnl }),
    warnings: [],
  });
}

/** Promotes each long-equity zero-to-zero lifecycle into one canonical logical Trade. */
export function promoteEquityLifecycles(
  reconstruction: Pick<EquityReconstructionResult, 'lifecycles'>,
): readonly Trade[] {
  return reconstruction.lifecycles
    .map(promoteLifecycle)
    .sort((left, right) => left.id.localeCompare(right.id));
}
