import { resolve } from 'node:path';

import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { serializeJson } from '../serialization/serialize-json.js';
import { normalizeBrokerFile } from './normalize-broker-source.js';

it('preserves the checked-in V1 golden contract when the current envelope advances', async () => {
  const legacy = JSON.parse(
    await readFile(
      resolve('packages/cli/src/test-fixtures/robinhood-equities-normalized.v1.json'),
      'utf8',
    ),
  ) as { schemaVersion: string; summary: Record<string, unknown> };

  expect(legacy.schemaVersion).toBe('1');
  expect(legacy.summary).not.toHaveProperty('executions');
});

it('emits the current V2 Robinhood envelope deterministically', async () => {
  const envelope = await normalizeBrokerFile({
    filePath: resolve('fixtures/robinhood/robinhood-equities-synthetic.csv'),
    broker: 'robinhood',
  });
  const first = serializeJson(envelope);
  const second = serializeJson(
    await normalizeBrokerFile({
      filePath: resolve('fixtures/robinhood/robinhood-equities-synthetic.csv'),
      broker: 'robinhood',
    }),
  );

  expect(first).toBe(second);
  expect(first).not.toContain(resolve('.'));
  expect(JSON.parse(first)).toMatchObject({
    schemaVersion: '2',
    summary: { sourceRecords: 17, executions: 0, activities: 17, trades: 4 },
  });
});
