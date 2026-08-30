import type { OptionReconstructionResult } from '../option-reconstruction/types.js';
import { allocateVerticalSpreadOwnership } from './allocate-ownership.js';
import { buildVerticalSpreadLifecycles } from './build-lifecycles.js';
import { generateVerticalSpreadCandidates } from './generate-candidates.js';
import type {
  VerticalSpreadReconstructionOptions,
  VerticalSpreadReconstructionResult,
} from './types.js';

/** Reconstructs inferred vertical spreads from completed single-contract accounting. */
export function reconstructVerticalSpreads(
  optionReconstruction: OptionReconstructionResult,
  options: VerticalSpreadReconstructionOptions = {},
): VerticalSpreadReconstructionResult {
  const candidates = generateVerticalSpreadCandidates(optionReconstruction, options);
  const ownership = allocateVerticalSpreadOwnership(optionReconstruction, candidates);
  const spreads = buildVerticalSpreadLifecycles(optionReconstruction, ownership.allocations);
  const ungrouped = ownership.lotOwnership.filter((lot) => lot.ungroupedQuantity.gt(0));

  return {
    spreads,
    ungrouped,
    diagnostics: [...optionReconstruction.diagnostics, ...ownership.diagnostics],
  };
}
