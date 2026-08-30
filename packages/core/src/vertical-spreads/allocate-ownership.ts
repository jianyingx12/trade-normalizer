import { Decimal } from 'decimal.js';

import type { OptionReconstructionResult } from '../option-reconstruction/types.js';
import { ambiguousStrategyDiagnostic } from './diagnostics.js';
import type {
  OptionLotOwnership,
  VerticalSpreadCandidate,
  VerticalSpreadCandidateLeg,
  VerticalSpreadLegAllocation,
  VerticalSpreadOwnershipAllocation,
  VerticalSpreadOwnershipResult,
} from './types.js';

function candidateLots(candidate: VerticalSpreadCandidate): readonly string[] {
  return [candidate.lowerStrikeLeg.lotId, candidate.higherStrikeLeg.lotId];
}

function connectedCandidateComponents(
  candidates: readonly VerticalSpreadCandidate[],
): readonly (readonly VerticalSpreadCandidate[])[] {
  const ordered = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  const candidatesByLot = new Map<string, VerticalSpreadCandidate[]>();
  for (const candidate of ordered) {
    for (const lotId of candidateLots(candidate)) {
      const matches = candidatesByLot.get(lotId) ?? [];
      matches.push(candidate);
      candidatesByLot.set(lotId, matches);
    }
  }

  const visited = new Set<string>();
  const components: VerticalSpreadCandidate[][] = [];
  for (const seed of ordered) {
    if (visited.has(seed.id)) continue;

    const component: VerticalSpreadCandidate[] = [];
    const pending = [seed];
    while (pending.length > 0) {
      const candidate = pending.pop()!;
      if (visited.has(candidate.id)) continue;
      visited.add(candidate.id);
      component.push(candidate);
      for (const lotId of candidateLots(candidate)) {
        for (const neighbor of candidatesByLot.get(lotId) ?? []) {
          if (!visited.has(neighbor.id)) pending.push(neighbor);
        }
      }
    }
    components.push(component.sort((left, right) => left.id.localeCompare(right.id)));
  }
  return components;
}

function allocateLeg(
  leg: VerticalSpreadCandidateLeg,
  quantity: Decimal,
): VerticalSpreadLegAllocation {
  return {
    positionKey: leg.positionKey,
    contractKey: leg.contractKey,
    lifecycleId: leg.lifecycleId,
    lotId: leg.lotId,
    openingActivityId: leg.openingActivityId,
    instrument: leg.instrument,
    direction: leg.direction,
    quantity,
  };
}

function allocateCandidate(candidate: VerticalSpreadCandidate): VerticalSpreadOwnershipAllocation {
  return {
    id: `vertical-ownership:${candidate.id}`,
    candidateId: candidate.id,
    strategy: candidate.strategy,
    quantity: candidate.maximumQuantity,
    lowerStrikeLeg: allocateLeg(candidate.lowerStrikeLeg, candidate.maximumQuantity),
    higherStrikeLeg: allocateLeg(candidate.higherStrikeLeg, candidate.maximumQuantity),
    evidence: candidate.evidence,
  };
}

/**
 * Assigns quantity only when a candidate has no competing structural match.
 * Stable IDs make output deterministic but never resolve semantic ambiguity.
 */
export function allocateVerticalSpreadOwnership(
  reconstruction: OptionReconstructionResult,
  candidates: readonly VerticalSpreadCandidate[],
): VerticalSpreadOwnershipResult {
  const allocations: VerticalSpreadOwnershipAllocation[] = [];
  const diagnostics = [];

  for (const component of connectedCandidateComponents(candidates)) {
    if (component.length > 1) {
      diagnostics.push(ambiguousStrategyDiagnostic(component));
    } else {
      allocations.push(allocateCandidate(component[0]!));
    }
  }

  const allocatedByLot = new Map<string, Decimal>();
  for (const allocation of allocations) {
    for (const leg of [allocation.lowerStrikeLeg, allocation.higherStrikeLeg]) {
      allocatedByLot.set(
        leg.lotId,
        (allocatedByLot.get(leg.lotId) ?? new Decimal(0)).plus(leg.quantity),
      );
    }
  }

  const lotOwnership: OptionLotOwnership[] = reconstruction.positions.flatMap((position) =>
    position.lots.map((lot) => {
      const allocatedQuantity = allocatedByLot.get(lot.id) ?? new Decimal(0);
      if (allocatedQuantity.gt(lot.originalQuantity)) {
        throw new Error(`Allocated quantity exceeds option lot ${lot.id}.`);
      }
      return {
        positionKey: position.key,
        contractKey: position.key.contractKey,
        lifecycleId: lot.lifecycleId,
        lotId: lot.id,
        instrument: lot.instrument,
        direction: lot.direction,
        totalQuantity: lot.originalQuantity,
        allocatedQuantity,
        ungroupedQuantity: lot.originalQuantity.minus(allocatedQuantity),
      };
    }),
  );
  lotOwnership.sort((left, right) => left.lotId.localeCompare(right.lotId));

  return { allocations, lotOwnership, diagnostics };
}
