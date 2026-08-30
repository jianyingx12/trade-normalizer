import type { Diagnostic, Trade } from '@trade-normalizer/schemas';

import { promoteEquityLifecycles } from './promote-equity-lifecycles.js';
import {
  promotionFailureDiagnostic,
  inconsistentOwnershipDiagnostic,
} from './promotion-diagnostics.js';
import { promoteSingleLegOptionTrades } from './promote-single-leg-options.js';
import { promoteVerticalSpreadTrades } from './promote-vertical-spreads.js';
import type {
  CanonicalTradeBuildInput,
  CanonicalTradeBuildResult,
  UnpromotedTradeOwnership,
  UnpromotedTradeOwnershipKind,
} from './types.js';
import { validateOptionTradeOwnership } from './validate-option-ownership.js';

function uniqueDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unpromoted(
  kind: UnpromotedTradeOwnershipKind,
  reason: UnpromotedTradeOwnership['reason'],
  referenceIds: readonly string[],
  message: string,
): UnpromotedTradeOwnership {
  return { kind, reason, referenceIds: [...referenceIds].sort(), message };
}

function promoteSafely(
  kind: UnpromotedTradeOwnershipKind,
  referenceIds: readonly string[],
  promote: () => readonly Trade[],
  trades: Trade[],
  diagnostics: Diagnostic[],
  failures: UnpromotedTradeOwnership[],
): void {
  try {
    trades.push(...promote());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(promotionFailureDiagnostic(kind, referenceIds, error));
    failures.push(unpromoted(kind, 'promotion_failed', referenceIds, message));
  }
}

/** Builds non-overlapping canonical logical Trades from all completed reconstruction stages. */
export function buildCanonicalTrades(input: CanonicalTradeBuildInput): CanonicalTradeBuildResult {
  const trades: Trade[] = [];
  const diagnostics = uniqueDiagnostics([
    ...input.equityReconstruction.diagnostics,
    ...input.optionReconstruction.diagnostics,
    ...input.verticalSpreadReconstruction.diagnostics,
  ]);
  const failures: UnpromotedTradeOwnership[] = [];

  for (const lifecycle of [...input.equityReconstruction.lifecycles].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    promoteSafely(
      'equity_lifecycle',
      [lifecycle.id],
      () => promoteEquityLifecycles({ lifecycles: [lifecycle] }),
      trades,
      diagnostics,
      failures,
    );
  }

  const ownership = validateOptionTradeOwnership(
    input.optionReconstruction,
    input.verticalSpreadReconstruction,
  );
  if (!ownership.valid) {
    diagnostics.push(inconsistentOwnershipDiagnostic(ownership.affectedLotIds, ownership.message));
    failures.push(
      unpromoted(
        'option_ownership',
        'inconsistent_ownership',
        ownership.affectedLotIds,
        ownership.message,
      ),
    );
  } else {
    const ungroupedByLifecycle = new Map<
      string,
      typeof input.verticalSpreadReconstruction.ungrouped
    >();
    for (const lifecycle of input.optionReconstruction.lifecycles) {
      ungroupedByLifecycle.set(
        lifecycle.id,
        input.verticalSpreadReconstruction.ungrouped.filter(
          (item) => item.lifecycleId === lifecycle.id,
        ),
      );
    }

    for (const lifecycle of [...input.optionReconstruction.lifecycles].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const ungroupedOwnership = ungroupedByLifecycle.get(lifecycle.id) ?? [];
      if (ungroupedOwnership.length === 0) continue;
      promoteSafely(
        'option_lifecycle',
        [lifecycle.id, ...ungroupedOwnership.map((item) => item.lotId)],
        () =>
          promoteSingleLegOptionTrades(
            { lifecycles: [lifecycle] },
            { ungrouped: ungroupedOwnership },
          ),
        trades,
        diagnostics,
        failures,
      );
    }

    for (const spread of [...input.verticalSpreadReconstruction.spreads].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      promoteSafely(
        'vertical_spread',
        [spread.id, spread.lowerStrikeLeg.lotId, spread.higherStrikeLeg.lotId],
        () => promoteVerticalSpreadTrades({ spreads: [spread] }),
        trades,
        diagnostics,
        failures,
      );
    }
  }

  trades.sort((left, right) => left.id.localeCompare(right.id));
  failures.sort((left, right) => {
    const leftKey = `${left.kind}:${left.referenceIds.join(':')}`;
    const rightKey = `${right.kind}:${right.referenceIds.join(':')}`;
    return leftKey.localeCompare(rightKey);
  });
  return { trades, diagnostics, unpromoted: failures };
}
