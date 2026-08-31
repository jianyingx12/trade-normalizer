import type {
  BrokerActivity,
  Diagnostic,
  OptionInstrument,
  StrategyType,
} from '@trade-normalizer/schemas';
import type { Decimal } from 'decimal.js';

import type { OptionInstrumentKey } from '../option-instruments/index.js';
import type {
  OptionLot,
  OptionPositionDirection,
  OptionPositionKey,
  OptionPositionLifecycle,
} from '../option-reconstruction/types.js';

export type VerticalSpreadStrategy = Extract<
  StrategyType,
  'bull_call_spread' | 'bear_call_spread' | 'bull_put_spread' | 'bear_put_spread'
>;

export interface VerticalSpreadCandidateLeg {
  readonly positionKey: OptionPositionKey;
  readonly contractKey: OptionInstrumentKey;
  readonly lifecycleId: OptionPositionLifecycle['id'];
  readonly lotId: OptionLot['id'];
  readonly openingActivityId: OptionLot['openingActivityId'];
  readonly openingSourceIndex: number;
  readonly instrument: OptionInstrument;
  readonly direction: OptionPositionDirection;
  readonly availableQuantity: Decimal;
}

export interface VerticalSpreadCandidateEvidence {
  readonly evidenceLevel: 'strong';
  readonly correlation: 'datetime';
  readonly openingTimeDistanceMs: number;
  readonly sameUnderlying: true;
  readonly sameExpiration: true;
  readonly sameOptionType: true;
  readonly oppositeDirections: true;
  readonly matchingMultiplier: true;
  readonly overlappingLifecycles: true;
}

export interface VerticalSpreadCandidate {
  readonly id: string;
  readonly strategy: VerticalSpreadStrategy;
  readonly lowerStrikeLeg: VerticalSpreadCandidateLeg;
  readonly higherStrikeLeg: VerticalSpreadCandidateLeg;
  readonly maximumQuantity: Decimal;
  readonly evidence: VerticalSpreadCandidateEvidence;
}

export interface VerticalSpreadCandidateOptions {
  /** Maximum confirmed opening timestamp distance. Defaults to exact timestamp equality. */
  readonly datetimeGroupingWindowMs?: number;
}

export interface VerticalSpreadLegAllocation {
  readonly positionKey: OptionPositionKey;
  readonly contractKey: OptionInstrumentKey;
  readonly lifecycleId: OptionPositionLifecycle['id'];
  readonly lotId: OptionLot['id'];
  readonly openingActivityId: OptionLot['openingActivityId'];
  readonly instrument: OptionInstrument;
  readonly direction: OptionPositionDirection;
  readonly quantity: Decimal;
}

/** Quantity owned by one unambiguous vertical candidate. */
export interface VerticalSpreadOwnershipAllocation {
  readonly id: string;
  readonly candidateId: VerticalSpreadCandidate['id'];
  readonly strategy: VerticalSpreadStrategy;
  readonly quantity: Decimal;
  readonly lowerStrikeLeg: VerticalSpreadLegAllocation;
  readonly higherStrikeLeg: VerticalSpreadLegAllocation;
  readonly evidence: VerticalSpreadCandidateEvidence;
}

/** Conservation record for one opening option lot. */
export interface OptionLotOwnership {
  readonly positionKey: OptionPositionKey;
  readonly contractKey: OptionInstrumentKey;
  readonly lifecycleId: OptionPositionLifecycle['id'];
  readonly lotId: OptionLot['id'];
  readonly instrument: OptionInstrument;
  readonly direction: OptionPositionDirection;
  readonly totalQuantity: Decimal;
  readonly allocatedQuantity: Decimal;
  readonly ungroupedQuantity: Decimal;
}

export interface VerticalSpreadOwnershipResult {
  readonly allocations: readonly VerticalSpreadOwnershipAllocation[];
  readonly lotOwnership: readonly OptionLotOwnership[];
  readonly diagnostics: readonly Diagnostic[];
}

export type VerticalSpreadReconstructionOptions = VerticalSpreadCandidateOptions;

export interface VerticalSpreadReconstructionResult {
  readonly spreads: readonly VerticalSpreadLifecycle[];
  /** Opening-lot ownership not assigned to a reconstructed spread; zero remainders are omitted. */
  readonly ungrouped: readonly OptionLotOwnership[];
  readonly diagnostics: readonly Diagnostic[];
}

export type VerticalSpreadLifecycleStatus = 'open' | 'partially_closed' | 'closed';

/** A quantity-proportional reference to accounting already performed by Phase 6. */
export interface VerticalSpreadMatchAllocation {
  readonly matchId: string;
  readonly allocatedQuantity: Decimal;
  readonly closingActivityId: string;
  readonly closedOn: string;
  readonly closedAt?: string;
  readonly closingTimestampPrecision: BrokerActivity['timestampPrecision'];
  readonly closingSourceIndex: number;
  readonly closingCashFlow: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly realizedFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
}

export interface VerticalSpreadLifecycleLeg extends VerticalSpreadLegAllocation {
  readonly openedOn: string;
  readonly openedAt?: string;
  readonly openingTimestampPrecision: BrokerActivity['timestampPrecision'];
  readonly openingCashFlow: Decimal;
  readonly closedQuantity: Decimal;
  readonly openQuantity: Decimal;
  readonly closingCashFlow: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly realizedFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
  readonly matchAllocations: readonly VerticalSpreadMatchAllocation[];
}

/** A structural two-leg lifecycle; it does not claim broker-confirmed order intent. */
export interface VerticalSpreadLifecycle {
  readonly id: string;
  readonly candidateId: VerticalSpreadCandidate['id'];
  readonly strategy: VerticalSpreadStrategy;
  readonly broker: OptionPositionKey['broker'];
  readonly accountId?: string;
  readonly underlying: string;
  readonly expiration: string;
  readonly optionType: 'call' | 'put';
  readonly multiplier: number;
  readonly quantity: Decimal;
  readonly closedQuantity: Decimal;
  readonly openQuantity: Decimal;
  readonly status: VerticalSpreadLifecycleStatus;
  readonly openedOn: string;
  readonly openedAt: string;
  readonly openingTimestampPrecision: 'datetime';
  readonly lastClosedOn?: string;
  readonly lastClosedAt?: string;
  readonly closingTimestampPrecision?: BrokerActivity['timestampPrecision'];
  /** Premium cash flow only: inflows positive, outflows negative. */
  readonly openingNetCashFlow: Decimal;
  /** Premium cash flow from attributed Phase 6 closing matches. */
  readonly closingNetCashFlow: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly realizedFees?: Decimal;
  readonly netRealizedPnl?: Decimal;
  readonly lowerStrikeLeg: VerticalSpreadLifecycleLeg;
  readonly higherStrikeLeg: VerticalSpreadLifecycleLeg;
  readonly evidence: VerticalSpreadCandidateEvidence;
}
