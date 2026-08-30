import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InputOverwriteError, OutputFileError } from '../errors/operational-error.js';
import { runNormalizeCommand, type NormalizeCommandIo } from './normalize.js';

const fixturePath = resolve('fixtures/robinhood/robinhood-equities-synthetic.csv');
let temporaryDirectory: string;
let copiedInput: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'trade-normalizer CLI '));
  copiedInput = join(temporaryDirectory, 'input trades.csv');
  await copyFile(fixturePath, copiedInput);
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('runNormalizeCommand', () => {
  it('writes valid canonical JSON and nothing else to stdout', async () => {
    let stdout = '';
    const io: NormalizeCommandIo = {
      writeStdout: (contents) => {
        stdout += contents;
      },
      writeOutputFile: async () => {
        throw new Error('Output file writer should not be called.');
      },
    };

    await runNormalizeCommand(copiedInput, { broker: 'robinhood' }, io);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe('1');
    expect((parsed.summary as { trades: number }).trades).toBe(4);
    expect(stdout).not.toContain('Decimal');
    expect(stdout).not.toContain(resolve('.'));
    expect(stdout.endsWith('\n')).toBe(true);
  });

  it('atomically replaces an output file without writing stdout', async () => {
    const outputFile = join(temporaryDirectory, 'normalized output.json');
    await writeFile(outputFile, 'old contents', 'utf8');
    let stdout = '';

    await runNormalizeCommand(
      copiedInput,
      { broker: 'robinhood', output: outputFile },
      {
        writeStdout: (contents) => {
          stdout += contents;
        },
        writeOutputFile: async (filePath, contents) => {
          const { writeUtf8FileAtomically } = await import('../io/write-utf8-file-atomically.js');
          await writeUtf8FileAtomically(filePath, contents);
        },
      },
    );

    const contents = await readFile(outputFile, 'utf8');
    const files = await readdir(temporaryDirectory);
    expect(JSON.parse(contents)).toMatchObject({ schemaVersion: '1', summary: { trades: 4 } });
    expect(stdout).toBe('');
    expect(files.some((file) => file.endsWith('.tmp'))).toBe(false);
  });

  it('refuses to use the input CSV as its output target', async () => {
    const before = await readFile(copiedInput, 'utf8');

    await expect(
      runNormalizeCommand(copiedInput, { broker: 'robinhood', output: copiedInput }),
    ).rejects.toBeInstanceOf(InputOverwriteError);
    expect(await readFile(copiedInput, 'utf8')).toBe(before);
  });

  it('reports output filesystem failures without leaving partial JSON', async () => {
    const outputFile = join(temporaryDirectory, 'missing-directory', 'normalized.json');

    await expect(
      runNormalizeCommand(copiedInput, { broker: 'robinhood', output: outputFile }),
    ).rejects.toBeInstanceOf(OutputFileError);
  });
});
