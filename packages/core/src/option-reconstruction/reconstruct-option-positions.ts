import type { BrokerActivity } from '@trade-normalizer/schemas';

import { prepareOptionActivities } from './prepare-activities.js';
import { replayOptionActivities } from './replay-activities.js';
import type { OptionReconstructionResult } from './types.js';

/** Reconstructs flat/long/short FIFO state for each exact canonical option contract. */
export function reconstructOptionPositions(
  activities: readonly BrokerActivity[],
): OptionReconstructionResult {
  const prepared = prepareOptionActivities(activities);
  const replayed = replayOptionActivities(prepared.activities);

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
