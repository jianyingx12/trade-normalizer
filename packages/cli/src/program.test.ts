import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from './program.js';
import type { CliRuntime } from './runtime.js';

const fixturePath = resolve('fixtures/robinhood/robinhood-equities-synthetic.csv');
const ibkrFixturePath = resolve('fixtures/ibkr/ibkr-equities-executions-synthetic.csv');
const identicalDuplicatePath = resolve('fixtures/ibkr/ibkr-identical-duplicate-synthetic.csv');
const conflictingDuplicatePath = resolve('fixtures/ibkr/ibkr-conflicting-duplicate-synthetic.csv');
const unsupportedIbkrProfilePath = resolve('fixtures/ibkr/ibkr-unsupported-profile-synthetic.csv');

interface CapturedRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly files: Readonly<Record<string, string>>;
}

async function run(arguments_: readonly string[]): Promise<CapturedRun> {
  let stdout = '';
  let stderr = '';
  const files: Record<string, string> = {};
  const runtime: CliRuntime = {
    writeStdout: (contents) => {
      stdout += contents;
    },
    writeStderr: (contents) => {
      stderr += contents;
    },
    writeOutputFile: async (filePath, contents) => {
      files[filePath] = contents;
    },
  };
  const code = await runCli(['node', 'trade-normalizer', ...arguments_], runtime);
  return { code, stdout, stderr, files };
}

describe('CLI command integration', () => {
  it('normalizes to uncontaminated stdout JSON', async () => {
    const result = await run(['normalize', fixturePath, '--broker', 'robinhood']);
    const document = JSON.parse(result.stdout) as { schemaVersion: string; trades: unknown[] };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(document.schemaVersion).toBe('2');
    expect(document.trades).toHaveLength(4);
  });

  it('normalizes to an output file while leaving stdout empty', async () => {
    const result = await run([
      'normalize',
      fixturePath,
      '--broker',
      'robinhood',
      '--output',
      'normalized.json',
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.files['normalized.json']!)).toMatchObject({
      schemaVersion: '2',
      summary: { executions: 0, trades: 4 },
    });
  });

  it('normalizes the fixed IBKR profile to uncontaminated stdout JSON', async () => {
    const result = await run(['normalize', ibkrFixturePath, '--broker', 'ibkr']);
    const document = JSON.parse(result.stdout) as {
      schemaVersion: string;
      summary: { sourceRecords: number; executions: number; activities: number; trades: number };
      trades: { opened: { precision: string; timestamp?: string } }[];
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(document).toMatchObject({
      schemaVersion: '2',
      summary: { sourceRecords: 4, executions: 4, activities: 4, trades: 2 },
    });
    expect(document.trades.every((trade) => trade.opened.precision === 'date')).toBe(true);
    expect(document.trades.every((trade) => trade.opened.timestamp === undefined)).toBe(true);
    expect(result.stdout).not.toMatch(/2026-08-\d{2}T[^"\n]*Z/);
    expect(result.stdout.endsWith('\n')).toBe(true);
  });

  it('writes IBKR normalization to an output file without contaminating stdout', async () => {
    const result = await run([
      'normalize',
      ibkrFixturePath,
      '--broker',
      'ibkr',
      '--output',
      'ibkr-normalized.json',
    ]);
    const document = JSON.parse(result.files['ibkr-normalized.json']!);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(document).toMatchObject({
      schemaVersion: '2',
      source: { broker: 'ibkr', file: 'ibkr-equities-executions-synthetic.csv' },
      summary: { executions: 4, activities: 4, trades: 2 },
    });
  });

  it.each([
    ['inspect', ['inspect', fixturePath, '--broker', 'robinhood'], 'Records: 17'],
    [
      'validate',
      ['validate', fixturePath, '--broker', 'robinhood'],
      'Valid: robinhood-equities-synthetic.csv',
    ],
  ] as const)('runs the %s command successfully', async (_name, arguments_, expected) => {
    const result = await run(arguments_);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(expected);
    expect(result.stderr).toBe('');
  });

  it.each([
    ['inspect', ['inspect', ibkrFixturePath, '--broker', 'ibkr'], 'Executions: 4'],
    ['validate', ['validate', ibkrFixturePath, '--broker', 'ibkr'], '4 executions, 4 activities'],
  ] as const)('runs IBKR %s through the CLI', async (_name, arguments_, expected) => {
    const result = await run(arguments_);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(expected);
    expect(result.stderr).toBe('');
  });

  it('keeps an identical IBKR duplicate usable with a warning', async () => {
    const result = await run(['validate', identicalDuplicatePath, '--broker', 'ibkr']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('1 execution, 1 activity, 1 warning');
    expect(result.stderr).toBe('');
  });

  it('returns safe partial normalization for a conflicting duplicate', async () => {
    const result = await run(['normalize', conflictingDuplicatePath, '--broker', 'ibkr']);
    const document = JSON.parse(result.stdout) as {
      summary: { executions: number; activities: number; trades: number; diagnostics: number };
      diagnostics: { severity: string; code: string }[];
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(document.summary).toEqual(
      expect.objectContaining({ executions: 1, activities: 1, trades: 1, diagnostics: 1 }),
    );
    expect(document.diagnostics).toMatchObject([
      { severity: 'error', code: 'DUPLICATE_EXECUTION' },
    ]);
  });

  it('fails validation for a conflicting IBKR duplicate', async () => {
    const result = await run(['validate', conflictingDuplicatePath, '--broker', 'ibkr']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Conflicting IBKR rows share one stable execution identity');
  });

  it('rejects an IBKR CSV outside the exact supported profile', async () => {
    const result = await run(['normalize', unsupportedIbkrProfilePath, '--broker', 'ibkr']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Error: Unsupported IBKR input profile. Expected: UTN IBKR Trade Confirmation Execution CSV v1.\n',
    );
  });

  it('rejects a CSV outside the supported Robinhood profile', async () => {
    const result = await run(['normalize', unsupportedIbkrProfilePath, '--broker', 'robinhood']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Error: Unsupported Robinhood input profile. Expected: supported account-activity CSV headers.\n',
    );
  });

  it('names the fixed IBKR profile in command help', async () => {
    const result = await run(['normalize', '--help']);

    expect(result.code).toBe(0);
    expect(result.stdout.replace(/\s+/g, ' ')).toContain(
      'UTN IBKR Trade Confirmation Execution CSV v1',
    );
    expect(result.stderr).toBe('');
  });

  it('uses exit code 1 and stderr for an unsupported broker', async () => {
    const result = await run(['normalize', fixturePath, '--broker', 'webull']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unsupported broker: webull');
    expect(result.stderr).toContain('Supported brokers: robinhood, ibkr');
  });

  it('uses exit code 1 for a missing input file', async () => {
    const result = await run(['normalize', 'missing.csv', '--broker', 'robinhood']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Error: Unable to read input file: missing.csv\n');
    expect(result.stderr).not.toContain('at ');
  });

  it('suppresses stack traces for unexpected operational failures', async () => {
    let stderr = '';
    const code = await runCli(
      [
        'node',
        'trade-normalizer',
        'normalize',
        fixturePath,
        '--broker',
        'robinhood',
        '--output',
        'failure.json',
      ],
      {
        writeStdout: () => undefined,
        writeStderr: (contents) => {
          stderr += contents;
        },
        writeOutputFile: async () => {
          throw new Error('Synthetic disk failure.');
        },
      },
    );

    expect(code).toBe(1);
    expect(stderr).toBe('Error: Synthetic disk failure.\n');
    expect(stderr).not.toContain('at ');
  });

  it('uses exit code 2 for invalid command usage', async () => {
    const result = await run(['normalize', '--broker', 'robinhood']);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("missing required argument 'input.csv'");
  });
});
