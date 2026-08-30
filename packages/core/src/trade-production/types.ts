import type { Diagnostic, Trade } from '@trade-normalizer/schemas';

import type { EquityReconstructionResult } from '../equity-reconstruction/types.js';
import type { OptionReconstructionResult } from '../option-reconstruction/types.js';
import type { VerticalSpreadReconstructionResult } from '../vertical-spreads/types.js';

export interface CanonicalTradeBuildInput {
  readonly equityReconstruction: EquityReconstructionResult;
  readonly optionReconstruction: OptionReconstructionResult;
  readonly verticalSpreadReconstruction: VerticalSpreadReconstructionResult;
}

export type UnpromotedTradeOwnershipKind =
  'equity_lifecycle' | 'option_lifecycle' | 'vertical_spread' | 'option_ownership';

export type UnpromotedTradeOwnershipReason = 'inconsistent_ownership' | 'promotion_failed';

export interface UnpromotedTradeOwnership {
  readonly kind: UnpromotedTradeOwnershipKind;
  readonly reason: UnpromotedTradeOwnershipReason;
  readonly referenceIds: readonly string[];
  readonly message: string;
}

export interface CanonicalTradeBuildResult {
  readonly trades: readonly Trade[];
  readonly diagnostics: readonly Diagnostic[];
  readonly unpromoted: readonly UnpromotedTradeOwnership[];
}
