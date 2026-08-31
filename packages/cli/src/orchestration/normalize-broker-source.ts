import type { NormalizationEnvelope } from '../output/types.js';
import {
  adaptBrokerFile,
  adaptBrokerSource,
  type AdaptBrokerFileInput,
  type AdaptBrokerSourceInput,
} from './adapt-broker-source.js';
import { normalizeBrokerActivities } from './normalize-broker-activities.js';

export type NormalizeBrokerSourceInput = AdaptBrokerSourceInput;
export type NormalizeBrokerFileInput = AdaptBrokerFileInput;

/** Adapts in-memory broker text before invoking the broker-independent normalization pipeline. */
export function normalizeBrokerSource(input: NormalizeBrokerSourceInput): NormalizationEnvelope {
  const adapted = adaptBrokerSource(input);
  return normalizeBrokerActivities({
    broker: adapted.broker,
    sourceFile: adapted.sourceFile,
    sourceRecordCount: adapted.sourceRecordCount,
    executionCount: adapted.executions.length,
    activities: adapted.activities,
    diagnostics: adapted.diagnostics,
  });
}

/** Reads one local UTF-8 file; the input path itself never appears in the output envelope. */
export async function normalizeBrokerFile(
  input: NormalizeBrokerFileInput,
): Promise<NormalizationEnvelope> {
  const adapted = await adaptBrokerFile(input);
  return normalizeBrokerActivities({
    ...adapted,
    executionCount: adapted.executions.length,
  });
}
