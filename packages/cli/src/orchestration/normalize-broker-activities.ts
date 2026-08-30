import {
  buildCanonicalTrades,
  reconstructEquityPositions,
  reconstructOptionPositions,
  reconstructVerticalSpreads,
  type BrokerActivity,
  type BrokerActivityType,
  type Diagnostic,
  type OptionReconstructionResult,
  type VerticalSpreadReconstructionResult,
} from '@trade-normalizer/core';

import {
  NORMALIZATION_SCHEMA_VERSION,
  type NormalizationEnvelope,
  type NormalizationSummary,
  type NormalizeBrokerActivitiesInput,
} from '../output/types.js';

const activityTypes: readonly BrokerActivityType[] = [
  'trade',
  'dividend',
  'deposit',
  'withdrawal',
  'fee',
  'split',
  'unknown',
];

function uniqueDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyOptionReconstruction(): OptionReconstructionResult {
  return {
    positions: [],
    openLots: [],
    matches: [],
    lifecycles: [],
    diagnostics: [],
  };
}

function emptyVerticalReconstruction(): VerticalSpreadReconstructionResult {
  return { spreads: [], ungrouped: [], diagnostics: [] };
}

function summarize(
  input: NormalizeBrokerActivitiesInput,
  trades: NormalizationEnvelope['trades'],
  diagnostics: readonly Diagnostic[],
): NormalizationSummary {
  const typeCounts = Object.fromEntries(activityTypes.map((type) => [type, 0])) as Record<
    BrokerActivityType,
    number
  >;
  const assetTypes = { equity: 0, option: 0, unspecified: 0 };

  for (const activity of input.activities) {
    typeCounts[activity.activityType] += 1;
    const assetType = activity.instrument?.assetType ?? 'unspecified';
    assetTypes[assetType] += 1;
  }

  return {
    sourceRecords: input.sourceRecordCount,
    activities: input.activities.length,
    trades: trades.length,
    diagnostics: diagnostics.length,
    activityTypes: typeCounts,
    assetTypes,
  };
}

function optionTradeActivities(activities: readonly BrokerActivity[]): BrokerActivity[] {
  return activities.filter(
    (activity) => activity.activityType === 'trade' && activity.instrument?.assetType === 'option',
  );
}

/** Coordinates existing reconstruction stages from already normalized canonical activities. */
export function normalizeBrokerActivities(
  input: NormalizeBrokerActivitiesInput,
): NormalizationEnvelope {
  const equityActivities = input.activities.filter(
    (activity) => activity.activityType === 'trade' && activity.instrument?.assetType === 'equity',
  );
  const optionActivities = optionTradeActivities(input.activities);
  const equityReconstruction = reconstructEquityPositions(equityActivities);
  const optionReconstruction =
    optionActivities.length === 0
      ? emptyOptionReconstruction()
      : reconstructOptionPositions(optionActivities);
  const verticalSpreadReconstruction =
    optionActivities.length === 0
      ? emptyVerticalReconstruction()
      : reconstructVerticalSpreads(optionReconstruction);
  const built = buildCanonicalTrades({
    equityReconstruction,
    optionReconstruction,
    verticalSpreadReconstruction,
  });
  const diagnostics = uniqueDiagnostics([...(input.diagnostics ?? []), ...built.diagnostics]);

  return {
    schemaVersion: NORMALIZATION_SCHEMA_VERSION,
    source: { broker: input.broker, file: input.sourceFile },
    summary: summarize(input, built.trades, diagnostics),
    trades: built.trades,
    diagnostics,
  };
}
