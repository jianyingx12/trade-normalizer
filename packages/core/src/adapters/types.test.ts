import type { BrokerActivity, Execution } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import type {
  AdapterParseResult,
  ExecutionAdapterNormalizationResult,
  ExecutionCapableBrokerAdapter,
  ExecutionCapableBrokerAdapterResult,
} from './types.js';

interface TestRecord {
  readonly sourceIndex: number;
}

const activity = {} as BrokerActivity;
const execution = {} as Execution;

const adapter: ExecutionCapableBrokerAdapter<TestRecord> = {
  broker: 'test-broker',
  packageName: '@trade-normalizer/adapter-test',
  detect: () => true,
  parse: (): AdapterParseResult<TestRecord> => ({
    records: [{ sourceIndex: 0 }],
    diagnostics: [],
  }),
  normalize: (): ExecutionAdapterNormalizationResult => ({
    activities: [activity],
    executions: [execution],
    diagnostics: [],
  }),
  adapt: (): ExecutionCapableBrokerAdapterResult<TestRecord> => ({
    records: [{ sourceIndex: 0 }],
    activities: [activity],
    executions: [execution],
    diagnostics: [],
  }),
};

describe('execution-capable adapter contract', () => {
  it('adds executions while retaining records, activities, and diagnostics', () => {
    const result = adapter.adapt('', { sourceId: 'test-source' });

    expect(result.records).toHaveLength(1);
    expect(result.activities).toEqual([activity]);
    expect(result.executions).toEqual([execution]);
    expect(result.diagnostics).toEqual([]);
  });
});
