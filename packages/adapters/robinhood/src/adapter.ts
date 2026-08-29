import type {
  AdapterSourceContext,
  BrokerActivityAdapter,
  BrokerAdapterResult,
} from '@trade-normalizer/core';

import { detectRobinhoodActivityCsv } from './detection/detect-robinhood.js';
import { normalizeRobinhoodRecords } from './normalization/normalize-robinhood-records.js';
import { parseRobinhoodActivityCsv } from './parsing/parse-robinhood-csv.js';
import type { RobinhoodActivityRecord } from './parsing/robinhood-record.js';

export function adaptRobinhoodActivityCsv(
  source: string,
  context: AdapterSourceContext,
): BrokerAdapterResult<RobinhoodActivityRecord> {
  const parsed = parseRobinhoodActivityCsv(source);
  const normalized = normalizeRobinhoodRecords(parsed.records, context);

  return {
    records: parsed.records,
    activities: normalized.activities,
    diagnostics: [...parsed.diagnostics, ...normalized.diagnostics],
  };
}

export const robinhoodAdapter: BrokerActivityAdapter<RobinhoodActivityRecord> = {
  broker: 'robinhood',
  packageName: '@trade-normalizer/adapter-robinhood',
  detect: detectRobinhoodActivityCsv,
  parse: parseRobinhoodActivityCsv,
  normalize: normalizeRobinhoodRecords,
  adapt: adaptRobinhoodActivityCsv,
};
