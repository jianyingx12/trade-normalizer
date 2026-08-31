import { resolve } from 'node:path';

import { normalizeBrokerFile, serializeJson } from '../packages/cli/dist/api.js';

const [broker, fixture] = process.argv.slice(2);

if (broker === undefined || fixture === undefined) {
  throw new Error('Usage: node examples/normalize-broker-file.mjs <broker> <input.csv>');
}

const result = await normalizeBrokerFile({
  filePath: resolve(fixture),
  broker,
});

process.stdout.write(serializeJson(result));
