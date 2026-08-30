import { createHash } from 'node:crypto';

import {
  decimalToString,
  type BrokerId,
  type Instrument,
  type StrategyType,
  type TradeLegDirection,
} from '@trade-normalizer/schemas';
import type { Decimal } from 'decimal.js';

export const CANONICAL_TRADE_ID_VERSION = 'v1';

export interface TradeIdentityLegInput {
  readonly instrument: Instrument;
  readonly direction: TradeLegDirection;
  readonly quantity: Decimal;
  readonly lifecycleIds: readonly string[];
  readonly openingActivityIds: readonly string[];
}

export interface TradeIdentityInput {
  readonly broker: BrokerId;
  readonly accountId?: string;
  readonly strategy: StrategyType;
  readonly legs: readonly TradeIdentityLegInput[];
}

function instrumentIdentity(instrument: Instrument): readonly unknown[] {
  return instrument.assetType === 'equity'
    ? ['equity', instrument.symbol]
    : [
        'option',
        instrument.underlying,
        instrument.expiration,
        decimalToString(instrument.strike),
        instrument.optionType,
        instrument.multiplier,
      ];
}

function legIdentity(leg: TradeIdentityLegInput): string {
  return JSON.stringify([
    instrumentIdentity(leg.instrument),
    leg.direction,
    decimalToString(leg.quantity),
    [...leg.lifecycleIds].sort(),
    [...leg.openingActivityIds].sort(),
  ]);
}

function digest(namespace: string, value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([namespace, value]))
    .digest('hex');
}

/**
 * Stable for identical canonical ownership identities. Cross-export stability depends on adapters
 * preserving the same canonical activity IDs; source ordering is deliberately excluded.
 */
export function createCanonicalTradeId(input: TradeIdentityInput): string {
  const legs = input.legs.map(legIdentity).sort();
  return `trade:${CANONICAL_TRADE_ID_VERSION}:${digest('canonical-trade', [
    input.broker,
    input.accountId ?? null,
    input.strategy,
    legs,
  ])}`;
}

/** Creates a deterministic leg ID within one already identified logical trade. */
export function createCanonicalTradeLegId(tradeId: string, leg: TradeIdentityLegInput): string {
  return `trade-leg:${CANONICAL_TRADE_ID_VERSION}:${digest('canonical-trade-leg', [
    tradeId,
    legIdentity(leg),
  ])}`;
}
