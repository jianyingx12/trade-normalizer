import { adaptBrokerFile, type AdaptedBrokerSource } from './adapt-broker-source.js';
import { countActivities } from '../summaries/activity-counts.js';
import type { InspectionReport } from '../output/inspection.js';

function unsupportedSourceIndexes(source: AdaptedBrokerSource): Set<number> {
  const normalized = new Set(source.activities.map((activity) => activity.provenance.sourceIndex));
  const unsupported = new Set<number>();

  for (let index = 0; index < source.sourceRecordCount; index += 1) {
    if (!normalized.has(index)) unsupported.add(index);
  }
  for (const diagnostic of source.diagnostics) {
    if (diagnostic.severity === 'error' || diagnostic.code === 'UNKNOWN_TRANSACTION_TYPE') {
      for (const index of diagnostic.sourceIndexes) unsupported.add(index);
    }
  }
  return unsupported;
}

export function inspectAdaptedSource(source: AdaptedBrokerSource): InspectionReport {
  const dates = source.activities.map((activity) => activity.activityDate).sort();
  const unsupportedRecords = unsupportedSourceIndexes(source).size;
  return {
    broker: source.broker,
    file: source.sourceFile,
    sourceRecords: source.sourceRecordCount,
    executions: source.executions.length,
    activities: source.activities.length,
    supportedRecords: source.sourceRecordCount - unsupportedRecords,
    unsupportedRecords,
    ...countActivities(source.activities),
    ...(dates.length === 0
      ? {}
      : { dateRange: { first: dates[0]!, last: dates[dates.length - 1]! } }),
    diagnostics: source.diagnostics,
  };
}

export async function inspectBrokerFile(
  filePath: string,
  broker: string,
): Promise<InspectionReport> {
  return inspectAdaptedSource(await adaptBrokerFile({ filePath, broker }));
}
