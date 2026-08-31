import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from './program.js';
import type { CliRuntime } from './runtime.js';

const fixturePath = resolve('fixtures/robinhood/robinhood-equities-synthetic.csv');
const ibkrFixturePath = resolve('fixtures/ibkr/ibkr-equities-executions-synthetic.csv');

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
    expect(result.stderr).toContain('Unable to read input file');
  });

  it('uses exit code 2 for invalid command usage', async () => {
    const result = await run(['normalize', '--broker', 'robinhood']);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("missing required argument 'input.csv'");
  });
});
