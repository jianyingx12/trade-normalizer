import { Decimal } from 'decimal.js';

import { sameOptionInstrument } from '../option-instruments/identity.js';
import type { OptionLot, OptionReconstructionResult } from '../option-reconstruction/types.js';
import type {
  OptionLotOwnership,
  VerticalSpreadLifecycleLeg,
  VerticalSpreadReconstructionResult,
} from '../vertical-spreads/types.js';

export interface OptionOwnershipValidationResult {
  readonly valid: boolean;
  readonly affectedLotIds: readonly string[];
  readonly message: string;
}

interface LotReferences {
  readonly spreadLegs: VerticalSpreadLifecycleLeg[];
  readonly ungrouped: OptionLotOwnership[];
}

function validateSpreadLeg(lot: OptionLot, leg: VerticalSpreadLifecycleLeg): boolean {
  return (
    leg.lifecycleId === lot.lifecycleId &&
    leg.openingActivityId === lot.openingActivityId &&
    leg.direction === lot.direction &&
    sameOptionInstrument(leg.instrument, lot.instrument) &&
    leg.quantity.gt(0)
  );
}

function validateUngrouped(lot: OptionLot, ownership: OptionLotOwnership): boolean {
  return (
    ownership.lifecycleId === lot.lifecycleId &&
    ownership.direction === lot.direction &&
    sameOptionInstrument(ownership.instrument, lot.instrument) &&
    ownership.totalQuantity.equals(lot.originalQuantity) &&
    ownership.ungroupedQuantity.gt(0) &&
    ownership.allocatedQuantity.gte(0) &&
    ownership.allocatedQuantity.plus(ownership.ungroupedQuantity).equals(lot.originalQuantity)
  );
}

/** Verifies spread-owned plus ungrouped quantity exactly partitions every Phase 6 opening lot. */
export function validateOptionTradeOwnership(
  options: Pick<OptionReconstructionResult, 'lifecycles'>,
  verticals: Pick<VerticalSpreadReconstructionResult, 'spreads' | 'ungrouped'>,
): OptionOwnershipValidationResult {
  const lotById = new Map<string, OptionLot>();
  const references = new Map<string, LotReferences>();
  const issues: string[] = [];
  const affected = new Set<string>();

  for (const lifecycle of options.lifecycles) {
    for (const lot of lifecycle.lots) {
      if (lotById.has(lot.id)) {
        issues.push(`Duplicate reconstructed lot ${lot.id}.`);
        affected.add(lot.id);
      }
      lotById.set(lot.id, lot);
      references.set(lot.id, { spreadLegs: [], ungrouped: [] });
    }
  }

  for (const spread of verticals.spreads) {
    for (const leg of [spread.lowerStrikeLeg, spread.higherStrikeLeg]) {
      const lot = lotById.get(leg.lotId);
      if (lot === undefined) {
        issues.push(`Spread references missing lot ${leg.lotId}.`);
        affected.add(leg.lotId);
        continue;
      }
      references.get(leg.lotId)!.spreadLegs.push(leg);
      if (!validateSpreadLeg(lot, leg)) {
        issues.push(`Spread ownership does not match lot ${leg.lotId}.`);
        affected.add(leg.lotId);
      }
    }
  }

  for (const ownership of verticals.ungrouped) {
    const lot = lotById.get(ownership.lotId);
    if (lot === undefined) {
      issues.push(`Ungrouped ownership references missing lot ${ownership.lotId}.`);
      affected.add(ownership.lotId);
      continue;
    }
    references.get(ownership.lotId)!.ungrouped.push(ownership);
    if (!validateUngrouped(lot, ownership)) {
      issues.push(`Ungrouped ownership does not match lot ${ownership.lotId}.`);
      affected.add(ownership.lotId);
    }
  }

  for (const [lotId, lot] of lotById) {
    const refs = references.get(lotId)!;
    if (refs.spreadLegs.length > 1 || refs.ungrouped.length > 1) {
      issues.push(`Lot ${lotId} has duplicate mutually exclusive ownership.`);
      affected.add(lotId);
    }
    const spreadQuantity = refs.spreadLegs.reduce(
      (total, leg) => total.plus(leg.quantity),
      new Decimal(0),
    );
    const ungroupedQuantity = refs.ungrouped.reduce(
      (total, ownership) => total.plus(ownership.ungroupedQuantity),
      new Decimal(0),
    );
    if (!spreadQuantity.plus(ungroupedQuantity).equals(lot.originalQuantity)) {
      issues.push(`Ownership quantity does not conserve lot ${lotId}.`);
      affected.add(lotId);
    }
    const ungrouped = refs.ungrouped[0];
    if (ungrouped !== undefined && !ungrouped.allocatedQuantity.equals(spreadQuantity)) {
      issues.push(`Allocated quantity disagrees with spread ownership for lot ${lotId}.`);
      affected.add(lotId);
    }
  }

  return {
    valid: issues.length === 0,
    affectedLotIds: [...affected].sort(),
    message: issues.join(' '),
  };
}
