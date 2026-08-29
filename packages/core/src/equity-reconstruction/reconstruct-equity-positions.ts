import type { BrokerActivity } from '@trade-normalizer/schemas';

import { prepareEquityActivities } from './prepare-activities.js';
import { replayEquityActivities } from './replay-activities.js';
import type { EquityReconstructionResult } from './types.js';

/**
 * Reconstructs deterministic long-equity FIFO inventory from canonical broker activity.
 * Diagnostics are returned in pipeline order: eligibility first, then accounting replay.
 */
export function reconstructEquityPositions(
  activities: readonly BrokerActivity[],
): EquityReconstructionResult {
  const prepared = prepareEquityActivities(activities);
  const replayed = replayEquityActivities(prepared.activities);

  return {
    positions: replayed.positions,
    openLots: replayed.positions.flatMap((position) =>
      position.lots.filter((lot) => !lot.remainingQuantity.isZero()),
    ),
    matches: replayed.matches,
    lifecycles: replayed.lifecycles,
    diagnostics: [...prepared.diagnostics, ...replayed.diagnostics],
  };
}
