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

function sameFile(left: string, right: string): boolean {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  return process.platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

export async function runNormalizeCommand(
  inputFile: string,
  options: NormalizeCommandOptions,
  io: NormalizeCommandIo = processCliRuntime,
): Promise<void> {
  if (options.output !== undefined && sameFile(inputFile, options.output)) {
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
    .requiredOption('--broker <broker>', 'source broker (currently: robinhood)')
    .option('-o, --output <file>', 'write JSON to a file instead of stdout')
    .action((inputFile: string, options: NormalizeCommandOptions) =>
      runNormalizeCommand(inputFile, options, runtime),
    );
}
