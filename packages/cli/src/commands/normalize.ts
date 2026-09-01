import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Command } from 'commander';

import { InputOverwriteError } from '../errors/operational-error.js';
import { normalizeBrokerFile } from '../orchestration/normalize-broker-source.js';
import { processCliRuntime, type CliRuntime } from '../runtime.js';
import { serializeJson } from '../serialization/serialize-json.js';

export interface NormalizeCommandOptions {
  readonly broker: string;
  readonly output?: string;
}

export type NormalizeCommandIo = Pick<CliRuntime, 'writeStdout' | 'writeOutputFile'>;

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function sameFile(left: string, right: string): Promise<boolean> {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  if (samePath(leftPath, rightPath)) return true;

  try {
    const [leftRealPath, rightRealPath] = await Promise.all([
      realpath(leftPath),
      realpath(rightPath),
    ]);
    if (samePath(leftRealPath, rightRealPath)) return true;

    const [leftStats, rightStats] = await Promise.all([stat(leftRealPath), stat(rightRealPath)]);
    return (
      leftStats.ino !== 0 && leftStats.dev === rightStats.dev && leftStats.ino === rightStats.ino
    );
  } catch {
    // A new output path cannot yet alias an existing input file.
    return false;
  }
}

export async function runNormalizeCommand(
  inputFile: string,
  options: NormalizeCommandOptions,
  io: NormalizeCommandIo = processCliRuntime,
): Promise<void> {
  if (options.output !== undefined && (await sameFile(inputFile, options.output))) {
    throw new InputOverwriteError(inputFile);
  }

  const envelope = await normalizeBrokerFile({ filePath: inputFile, broker: options.broker });
  const json = serializeJson(envelope);

  if (options.output === undefined) {
    io.writeStdout(json);
    return;
  }
  await io.writeOutputFile(options.output, json);
}

export function registerNormalizeCommand(
  program: Command,
  runtime: CliRuntime = processCliRuntime,
): void {
  program
    .command('normalize')
    .description('Normalize a supported broker CSV into canonical logical Trades')
    .argument('<input.csv>', 'UTF-8 broker CSV file')
    .requiredOption(
      '--broker <broker>',
      'source broker (robinhood activity or UTN IBKR Trade Confirmation Execution CSV v1)',
    )
    .option('-o, --output <file>', 'write JSON to a file instead of stdout')
    .action((inputFile: string, options: NormalizeCommandOptions) =>
      runNormalizeCommand(inputFile, options, runtime),
    );
}
