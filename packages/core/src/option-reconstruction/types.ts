import type {
  BrokerActivity,
  Diagnostic,
  ExecutionSide,
  FeeBreakdown,
  OptionInstrument,
  SourceProvenance,
  TradeStatus,
} from '@trade-normalizer/schemas';
import type { Decimal } from 'decimal.js';

import type { OptionInstrumentKey } from '../option-instruments/index.js';

/** A canonical activity with every fact required by option position reconstruction. */
export interface EligibleOptionTradeActivity extends BrokerActivity {
  readonly activityType: 'trade';
  readonly instrument: OptionInstrument;
  readonly side: ExecutionSide;
  readonly quantity: NonNullable<BrokerActivity['quantity']>;
  readonly price: NonNullable<BrokerActivity['price']>;
}

export interface PreparedOptionActivities {
  readonly activities: readonly EligibleOptionTradeActivity[];
  readonly diagnostics: readonly Diagnostic[];
}

export type OptionPositionDirection = 'long' | 'short';
export type OptionPositionStatus = 'flat' | OptionPositionDirection;

export interface OptionPositionKey {
  readonly broker: BrokerActivity['broker'];
  readonly accountId?: string;
  readonly contractKey: OptionInstrumentKey;
}

/** One direction-opening option activity preserved as a distinct FIFO lot. */
export interface OptionLot {
  readonly id: string;
  readonly lifecycleId: string;
  readonly instrument: OptionInstrument;
  readonly direction: OptionPositionDirection;
  readonly openingActivityId: string;
  readonly openedOn: string;
  readonly openedAt?: string;
  readonly timestampPrecision: BrokerActivity['timestampPrecision'];
  readonly originalQuantity: Decimal;
  readonly remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly openingFees?: FeeBreakdown;
  readonly remainingOpeningFees?: Decimal;
  readonly provenance: SourceProvenance;
}

/** The portion of one closing activity assigned to one older option lot. */
export interface OptionLotMatch {
  readonly id: string;
  readonly lifecycleId: string;
  readonly instrument: OptionInstrument;
  readonly direction: OptionPositionDirection;
  readonly openingActivityId: string;
  readonly closingActivityId: string;
  readonly closedOn: string;
  readonly closedAt?: string;
  readonly closingTimestampPrecision: BrokerActivity['timestampPrecision'];
  readonly closingSourceIndex: number;
  readonly matchedQuantity: Decimal;
  readonly entryPrice: Decimal;
  readonly exitPrice: Decimal;
  /** Paid for long lots and received for short lots. */
  readonly openingPremium: Decimal;
  /** Received for long lots and paid for short lots. */
  readonly closingPremium: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly openingFees?: Decimal;
  readonly closingFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
}

export interface OptionPositionLifecycle {
  readonly id: string;
  readonly key: OptionPositionKey;
  readonly instrument: OptionInstrument;
  readonly direction: OptionPositionDirection;
  readonly status: Extract<TradeStatus, 'open' | 'closed'>;
  readonly openingActivityId: string;
  readonly closingActivityId?: string;
  readonly openedOn: string;
  readonly openedAt?: string;
  readonly openingTimestampPrecision: BrokerActivity['timestampPrecision'];
  readonly closedOn?: string;
  readonly closedAt?: string;
  readonly closingTimestampPrecision?: BrokerActivity['timestampPrecision'];
  readonly activityIds: readonly string[];
  readonly openQuantity: Decimal;
  readonly remainingOpeningPremium: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly remainingOpeningFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
  readonly lots: readonly OptionLot[];
  readonly matches: readonly OptionLotMatch[];
}

export interface OptionPositionState {
  readonly key: OptionPositionKey;
  readonly instrument: OptionInstrument;
  readonly status: OptionPositionStatus;
  readonly openQuantity: Decimal;
  /** Remaining premium basis; paid when long and received when short. */
  readonly remainingOpeningPremium: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly remainingOpeningFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
  readonly lots: readonly OptionLot[];
  readonly matches: readonly OptionLotMatch[];
  readonly lifecycles: readonly OptionPositionLifecycle[];
}

export interface OptionReplayResult {
  readonly positions: readonly OptionPositionState[];
  readonly matches: readonly OptionLotMatch[];
  readonly lifecycles: readonly OptionPositionLifecycle[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Public result returned after option eligibility, ordering, and directional FIFO replay. */
export interface OptionReconstructionResult extends OptionReplayResult {
  readonly openLots: readonly OptionLot[];
}
