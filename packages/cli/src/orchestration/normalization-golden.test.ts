import { resolve } from 'node:path';

import { expect, it } from 'vitest';

import { serializeJson } from '../serialization/serialize-json.js';
import { normalizeBrokerFile } from './normalize-broker-source.js';

it('matches the stable V1 Robinhood equities normalization envelope', async () => {
  const envelope = await normalizeBrokerFile({
    filePath: resolve('fixtures/robinhood/robinhood-equities-synthetic.csv'),
    broker: 'robinhood',
  });
  const json = serializeJson(envelope);

  expect(json).not.toContain(resolve('.'));
  await expect(json).toMatchFileSnapshot('../test-fixtures/robinhood-equities-normalized.v1.json');
});
