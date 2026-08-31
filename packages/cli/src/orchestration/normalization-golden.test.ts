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

it.each([
  [
    'Robinhood',
    'robinhood',
    'fixtures/robinhood/robinhood-equities-synthetic.csv',
    '../test-fixtures/robinhood-equities-normalized.v2.json',
  ],
  [
    'IBKR',
    'ibkr',
    'fixtures/ibkr/ibkr-equities-executions-synthetic.csv',
    '../test-fixtures/ibkr-equities-normalized.v2.json',
  ],
] as const)(
  'matches the stable V2 %s normalization envelope',
  async (_name, broker, file, golden) => {
    const envelope = await normalizeBrokerFile({ filePath: resolve(file), broker });
    const json = serializeJson(envelope);

    expect(json).not.toContain(resolve('.'));
    await expect(json).toMatchFileSnapshot(golden);
  },
);
