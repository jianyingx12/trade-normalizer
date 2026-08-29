import type {
  BrokerActivity,
  Diagnostic,
  EquityInstrument,
  ExecutionSide,
  SourceProvenance,
  TradeStatus,
} from '@trade-normalizer/schemas';
import type { Decimal } from 'decimal.js';

/** A canonical activity with every fact required by long-equity reconstruction. */
export interface EligibleEquityTradeActivity extends BrokerActivity {
  readonly activityType: 'trade';
  readonly instrument: EquityInstrument;
  readonly side: ExecutionSide;
  readonly quantity: NonNullable<BrokerActivity['quantity']>;
  readonly price: NonNullable<BrokerActivity['price']>;
}

export interface PreparedEquityActivities {
  readonly activities: readonly EligibleEquityTradeActivity[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Broker account and symbol boundary within which FIFO inventory is matched. */
export interface EquityPositionKey {
  readonly broker: BrokerActivity['broker'];
  readonly accountId?: string;
  readonly symbol: string;
}

/** One buy-created inventory lot. Closed lots remain available as replay evidence. */
export interface EquityLot {
  readonly id: string;
  readonly lifecycleId: string;
  readonly instrument: EquityInstrument;
  readonly openingActivityId: string;
  readonly openedOn: string;
  readonly originalQuantity: Decimal;
  readonly remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly entryFees?: Decimal;
  readonly remainingEntryFees?: Decimal;
  readonly provenance: SourceProvenance;
}

/** The portion of one sell matched to one earlier FIFO lot. */
export interface EquityLotMatch {
  readonly id: string;
  readonly lifecycleId: string;
  readonly instrument: EquityInstrument;
  readonly openingActivityId: string;
  readonly closingActivityId: string;
  readonly matchedQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly exitPrice: Decimal;
  readonly entryCostBasis: Decimal;
  readonly exitProceeds: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly entryFees?: Decimal;
  readonly exitFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
}

/** One continuous period of long exposure, from zero inventory until returning to zero. */
export interface EquityPositionLifecycle {
  readonly id: string;
  readonly key: EquityPositionKey;
  readonly instrument: EquityInstrument;
  readonly status: TradeStatus;
  readonly openingActivityId: string;
  readonly closingActivityId?: string;
  readonly openedOn: string;
  readonly closedOn?: string;
  readonly activityIds: readonly string[];
  readonly openQuantity: Decimal;
  readonly remainingCostBasis: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly remainingEntryFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
  readonly lots: readonly EquityLot[];
  readonly matches: readonly EquityLotMatch[];
}

/** Deterministic accounting state for one broker account and equity symbol. */
export interface EquityPositionState {
  readonly key: EquityPositionKey;
  readonly instrument: EquityInstrument;
  readonly openQuantity: Decimal;
  readonly remainingCostBasis: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly remainingEntryFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
  readonly lots: readonly EquityLot[];
  readonly matches: readonly EquityLotMatch[];
  readonly lifecycles: readonly EquityPositionLifecycle[];
}

export interface EquityReplayResult {
  readonly positions: readonly EquityPositionState[];
  readonly matches: readonly EquityLotMatch[];
  readonly lifecycles: readonly EquityPositionLifecycle[];
  readonly diagnostics: readonly Diagnostic[];
}
