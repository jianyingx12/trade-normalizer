import { warningSchema, type Diagnostic } from '@trade-normalizer/schemas';

import type { VerticalSpreadCandidate } from './types.js';

export function ambiguousStrategyDiagnostic(
  candidates: readonly VerticalSpreadCandidate[],
): Diagnostic {
  const candidateIds = candidates.map((candidate) => candidate.id).sort();
  const lotIds = [
    ...new Set(
      candidates.flatMap((candidate) => [
        candidate.lowerStrikeLeg.lotId,
        candidate.higherStrikeLeg.lotId,
      ]),
    ),
  ].sort();
  const sourceIndexes = [
    ...new Set(
      candidates.flatMap((candidate) => [
        candidate.lowerStrikeLeg.openingSourceIndex,
        candidate.higherStrikeLeg.openingSourceIndex,
      ]),
    ),
  ].sort((left, right) => left - right);

  return warningSchema.parse({
    severity: 'warning',
    code: 'AMBIGUOUS_STRATEGY_MATCH',
    message: 'Multiple equally supported vertical spread candidates compete for option lots.',
    sourceIndexes,
    details: { candidateIds, lotIds },
  });
}
