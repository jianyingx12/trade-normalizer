import type {
  AdapterSourceContext,
  ExecutionCapableBrokerAdapter,
  ExecutionCapableBrokerAdapterResult,
} from '@trade-normalizer/core';

import { detectIbkrTradeConfirmationExecutionCsv } from './detection/detect-ibkr.js';
import { normalizeIbkrExecutionRecords } from './normalization/normalize-ibkr-records.js';
import { parseIbkrTradeConfirmationExecutionCsv } from './parsing/parse-ibkr-csv.js';
import type { IbkrTradeConfirmationExecutionRecord } from './parsing/ibkr-record.js';

export function adaptIbkrTradeConfirmationExecutionCsv(
  source: string,
  context: AdapterSourceContext,
): ExecutionCapableBrokerAdapterResult<IbkrTradeConfirmationExecutionRecord> {
  const parsed = parseIbkrTradeConfirmationExecutionCsv(source);
  const normalized = normalizeIbkrExecutionRecords(parsed.records, context);

  return {
    records: parsed.records,
    executions: normalized.executions,
    activities: normalized.activities,
    diagnostics: [...parsed.diagnostics, ...normalized.diagnostics],
  };
}

export const ibkrAdapter: ExecutionCapableBrokerAdapter<IbkrTradeConfirmationExecutionRecord> = {
  broker: 'ibkr',
  packageName: '@trade-normalizer/adapter-ibkr',
  detect: detectIbkrTradeConfirmationExecutionCsv,
  parse: parseIbkrTradeConfirmationExecutionCsv,
  normalize: normalizeIbkrExecutionRecords,
  adapt: adaptIbkrTradeConfirmationExecutionCsv,
};
