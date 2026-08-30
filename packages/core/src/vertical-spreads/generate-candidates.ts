import { Decimal } from 'decimal.js';

import type { OptionReconstructionResult } from '../option-reconstruction/types.js';
import { classifyVerticalStructure } from './classify-vertical.js';
import type {
  VerticalSpreadCandidate,
  VerticalSpreadCandidateLeg,
  VerticalSpreadCandidateOptions,
} from './types.js';

export const DEFAULT_DATETIME_GROUPING_WINDOW_MS = 0;

interface CandidateLot extends VerticalSpreadCandidateLeg {
  readonly openedOn: string;
  readonly openedAt: string | undefined;
  readonly timestampPrecision: 'date' | 'datetime';
  readonly lifecycle: OptionReconstructionResult['lifecycles'][number];
}

function structuralGroupKey(lot: CandidateLot): string {
  return JSON.stringify([
    lot.positionKey.broker,
    lot.positionKey.accountId ?? null,
    lot.instrument.underlying,
    lot.instrument.expiration,
    lot.instrument.optionType,
    lot.instrument.multiplier,
  ]);
}

function lifecycleEndsBefore(
  left: CandidateLot['lifecycle'],
  right: CandidateLot['lifecycle'],
): boolean {
  if (left.closedOn === undefined) {
    return false;
  }
  if (left.closedOn !== right.openedOn) {
    return left.closedOn < right.openedOn;
  }
  if (left.closedAt !== undefined && right.openedAt !== undefined) {
    return left.closedAt <= right.openedAt;
  }
  return false;
}

function lifecyclesOverlap(left: CandidateLot, right: CandidateLot): boolean {
  return (
    !lifecycleEndsBefore(left.lifecycle, right.lifecycle) &&
    !lifecycleEndsBefore(right.lifecycle, left.lifecycle)
  );
}

function openingTimeDistance(left: CandidateLot, right: CandidateLot): number | undefined {
  if (
    left.timestampPrecision !== 'datetime' ||
    right.timestampPrecision !== 'datetime' ||
    left.openedAt === undefined ||
    right.openedAt === undefined
  ) {
    return undefined;
  }

  return Math.abs(Date.parse(left.openedAt) - Date.parse(right.openedAt));
}

function candidateLeg(lot: CandidateLot): VerticalSpreadCandidateLeg {
  return {
    positionKey: lot.positionKey,
    contractKey: lot.contractKey,
    lifecycleId: lot.lifecycleId,
    lotId: lot.lotId,
    instrument: lot.instrument,
    direction: lot.direction,
    availableQuantity: lot.availableQuantity,
  };
}

function compareCandidates(left: VerticalSpreadCandidate, right: VerticalSpreadCandidate): number {
  const leftKey = `${left.lowerStrikeLeg.contractKey}|${left.higherStrikeLeg.contractKey}|${left.lowerStrikeLeg.lotId}|${left.higherStrikeLeg.lotId}`;
  const rightKey = `${right.lowerStrikeLeg.contractKey}|${right.higherStrikeLeg.contractKey}|${right.lowerStrikeLeg.lotId}|${right.higherStrikeLeg.lotId}`;
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

/** Generates structural vertical candidates without assigning quantity ownership. */
export function generateVerticalSpreadCandidates(
  reconstruction: OptionReconstructionResult,
  options: VerticalSpreadCandidateOptions = {},
): readonly VerticalSpreadCandidate[] {
  const datetimeGroupingWindowMs =
    options.datetimeGroupingWindowMs ?? DEFAULT_DATETIME_GROUPING_WINDOW_MS;
  if (!Number.isSafeInteger(datetimeGroupingWindowMs) || datetimeGroupingWindowMs < 0) {
    throw new RangeError('datetimeGroupingWindowMs must be a non-negative safe integer.');
  }

  const lifecycleById = new Map(
    reconstruction.lifecycles.map((lifecycle) => [lifecycle.id, lifecycle] as const),
  );
  const groups = new Map<string, CandidateLot[]>();

  for (const position of reconstruction.positions) {
    for (const lot of position.lots) {
      const lifecycle = lifecycleById.get(lot.lifecycleId);
      if (lifecycle === undefined) {
        continue;
      }
      const candidate: CandidateLot = {
        positionKey: position.key,
        contractKey: position.key.contractKey,
        lifecycleId: lot.lifecycleId,
        lotId: lot.id,
        instrument: lot.instrument,
        direction: lot.direction,
        availableQuantity: lot.originalQuantity,
        openedOn: lot.openedOn,
        openedAt: lot.openedAt,
        timestampPrecision: lot.timestampPrecision,
        lifecycle,
      };
      const key = structuralGroupKey(candidate);
      const group = groups.get(key) ?? [];
      group.push(candidate);
      groups.set(key, group);
    }
  }

  const candidates: VerticalSpreadCandidate[] = [];
  for (const group of groups.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]!;
        const right = group[rightIndex]!;
        if (
          left.direction === right.direction ||
          left.instrument.strike.equals(right.instrument.strike) ||
          !lifecyclesOverlap(left, right)
        ) {
          continue;
        }

        const distanceMs = openingTimeDistance(left, right);
        if (distanceMs === undefined || distanceMs > datetimeGroupingWindowMs) {
          continue;
        }

        const [lower, higher] = left.instrument.strike.lt(right.instrument.strike)
          ? [left, right]
          : [right, left];
        const strategy = classifyVerticalStructure(
          lower.instrument.optionType,
          lower.direction,
          higher.direction,
        );
        if (strategy === undefined) {
          continue;
        }

        candidates.push({
          id: `vertical-candidate:${lower.lotId}:${higher.lotId}`,
          strategy,
          lowerStrikeLeg: candidateLeg(lower),
          higherStrikeLeg: candidateLeg(higher),
          maximumQuantity: Decimal.min(lower.availableQuantity, higher.availableQuantity),
          evidence: {
            evidenceLevel: 'strong',
            correlation: 'datetime',
            openingTimeDistanceMs: distanceMs,
            sameUnderlying: true,
            sameExpiration: true,
            sameOptionType: true,
            oppositeDirections: true,
            matchingMultiplier: true,
            overlappingLifecycles: true,
          },
        });
      }
    }
  }

  return candidates.sort(compareCandidates);
}
