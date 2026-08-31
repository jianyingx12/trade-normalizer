import { readFile } from 'node:fs/promises';

import { normalizeBrokerSource, serializeJson } from '../packages/cli/dist/api.js';

const sourceFile = 'robinhood-equities-synthetic.csv';
const source = await readFile(
  new URL(`../fixtures/robinhood/${sourceFile}`, import.meta.url),
  'utf8',
);
const result = normalizeBrokerSource({
  source,
  sourceFile,
  broker: 'robinhood',
});

process.stdout.write(serializeJson(result));
