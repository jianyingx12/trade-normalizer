import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BrokerInputError, ValidationFailedError } from '../errors/operational-error.js';
import { runInspectCommand } from './inspect.js';
import { runValidateCommand } from './validate.js';

const fixturePath = resolve('fixtures/robinhood/robinhood-equities-synthetic.csv');
const ibkrFixturePath = resolve('fixtures/ibkr/ibkr-equities-executions-synthetic.csv');
const identicalDuplicatePath = resolve('fixtures/ibkr/ibkr-identical-duplicate-synthetic.csv');
const conflictingDuplicatePath = resolve('fixtures/ibkr/ibkr-conflicting-duplicate-synthetic.csv');
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
    expect(stdout).toContain('Executions: 0');
    expect(stdout).toContain('Activities: 17');
    expect(stdout).toContain('trade: 13');
    expect(stdout).toContain('Diagnostics: 0');
    expect(stdout).not.toContain('Trades:');
    expect(stdout).not.toContain('grossRealizedPnl');
  });

  it('reports retained execution evidence for the fixed IBKR profile', async () => {
    let stdout = '';
    await runInspectCommand(ibkrFixturePath, { broker: 'ibkr' }, (text) => {
      stdout += text;
    });

    expect(stdout).toContain('Broker: ibkr');
    expect(stdout).toContain('Records: 4');
    expect(stdout).toContain('Executions: 4');
    expect(stdout).toContain('Activities: 4');
    expect(stdout).toContain('equity: 4');
    expect(stdout).toContain('Diagnostics: 0');
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
      executions: number;
      unsupportedRecords: number;
      diagnostics: { code: string }[];
    };

    expect(report.executions).toBe(0);
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
      'Valid: robinhood-equities-synthetic.csv (17 records, 0 executions, 17 activities, 0 warnings)\n',
    );
  });

  it('validates IBKR executions and their activity projections', async () => {
    let stdout = '';
    await runValidateCommand(ibkrFixturePath, { broker: 'ibkr' }, (text) => {
      stdout += text;
    });

    expect(stdout).toBe(
      'Valid: ibkr-equities-executions-synthetic.csv (4 records, 4 executions, 4 activities, 0 warnings)\n',
    );
  });

  it('accepts an identical IBKR duplicate with one warning', async () => {
    let stdout = '';
    await runValidateCommand(identicalDuplicatePath, { broker: 'ibkr' }, (text) => {
      stdout += text;
    });

    expect(stdout).toBe(
      'Valid: ibkr-identical-duplicate-synthetic.csv (2 records, 1 execution, 1 activity, 1 warning)\n',
    );
  });

  it('rejects a conflicting IBKR duplicate diagnostic', async () => {
    await expect(
      runValidateCommand(conflictingDuplicatePath, { broker: 'ibkr' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
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
    expect(stdout).toContain('1 warning');
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
