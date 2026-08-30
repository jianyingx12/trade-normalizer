import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BrokerInputError, ValidationFailedError } from '../errors/operational-error.js';
import { runInspectCommand } from './inspect.js';
import { runValidateCommand } from './validate.js';

const fixturePath = resolve('fixtures/robinhood/robinhood-equities-synthetic.csv');
const headers =
  '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"';
let temporaryDirectory: string;

async function sourceFile(name: string, row: string): Promise<string> {
  const filePath = join(temporaryDirectory, name);
  await writeFile(filePath, `${headers}\n${row}\n`, 'utf8');
  return filePath;
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'trade-normalizer-inspect-'));
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('runInspectCommand', () => {
  it('prints source-focused fixture information without a Trade payload', async () => {
    let stdout = '';
    await runInspectCommand(fixturePath, { broker: 'robinhood' }, (text) => {
      stdout += text;
    });

    expect(stdout).toContain('Broker: robinhood');
    expect(stdout).toContain('Records: 17');
    expect(stdout).toContain('Activities: 17');
    expect(stdout).toContain('trade: 13');
    expect(stdout).toContain('Diagnostics: 0');
    expect(stdout).not.toContain('Trades:');
    expect(stdout).not.toContain('grossRealizedPnl');
  });

  it('supports deterministic JSON inspection with diagnostics and unsupported counts', async () => {
    const filePath = await sourceFile(
      'unknown.csv',
      '"8/3/2026","8/3/2026","8/5/2026","","Unknown event","MYSTERY","","",""',
    );
    let stdout = '';
    await runInspectCommand(filePath, { broker: 'robinhood', json: true }, (text) => {
      stdout += text;
    });
    const report = JSON.parse(stdout) as {
      unsupportedRecords: number;
      diagnostics: { code: string }[];
    };

    expect(report.unsupportedRecords).toBe(1);
    expect(report.diagnostics).toMatchObject([{ code: 'UNKNOWN_TRANSACTION_TYPE' }]);
    expect(stdout).not.toContain(resolve('.'));
  });
});

describe('runValidateCommand', () => {
  it('accepts the valid fixture without reconstructing Trades', async () => {
    let stdout = '';
    await runValidateCommand(fixturePath, { broker: 'robinhood' }, (text) => {
      stdout += text;
    });

    expect(stdout).toBe(
      'Valid: robinhood-equities-synthetic.csv (17 records, 17 activities, 0 warnings)\n',
    );
  });

  it('allows a usable normalization result containing warnings', async () => {
    const filePath = await sourceFile(
      'warning.csv',
      '"8/3/2026","8/3/2026","8/5/2026","","Unknown event","MYSTERY","","",""',
    );
    let stdout = '';

    await runValidateCommand(filePath, { broker: 'robinhood' }, (text) => {
      stdout += text;
    });
    expect(stdout).toContain('1 warnings');
  });

  it('rejects row-level normalization errors', async () => {
    const filePath = await sourceFile(
      'invalid-quantity.csv',
      '"8/3/2026","8/3/2026","8/5/2026","AAPL","Buy","Buy","not-a-quantity","$10.00","($10.00)"',
    );

    await expect(runValidateCommand(filePath, { broker: 'robinhood' })).rejects.toBeInstanceOf(
      ValidationFailedError,
    );
  });

  it('rejects invalid headers as a fatal broker-input error', async () => {
    const filePath = join(temporaryDirectory, 'invalid-headers.csv');
    await writeFile(filePath, 'Wrong,Headers\nvalue,value\n', 'utf8');

    await expect(runValidateCommand(filePath, { broker: 'robinhood' })).rejects.toBeInstanceOf(
      BrokerInputError,
    );
  });
});
