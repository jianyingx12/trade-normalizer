import type { OptionInstrument, StrategyType } from '@trade-normalizer/schemas';
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
