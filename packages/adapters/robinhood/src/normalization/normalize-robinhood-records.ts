import type {
  AdapterNormalizationResult,
  AdapterSourceContext,
  BrokerActivity,
  Diagnostic,
} from '@trade-normalizer/core';

import type { RobinhoodActivityRecord } from '../parsing/robinhood-record.js';
import { normalizeRobinhoodRecord } from './normalize-robinhood-record.js';

export function normalizeRobinhoodRecords(
  records: readonly RobinhoodActivityRecord[],
  context: AdapterSourceContext,
): AdapterNormalizationResult {
  if (context.sourceId.trim().length === 0) {
    throw new TypeError('Adapter sourceId must be a non-empty import-scoped identifier.');
  }

  const activities: BrokerActivity[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const result = normalizeRobinhoodRecord(record, context);
    diagnostics.push(...result.diagnostics);
    if (result.activity !== undefined) {
      activities.push(result.activity);
    }
  }

  return { activities, diagnostics };
}
