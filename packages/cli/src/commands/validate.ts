import { basename } from 'node:path';

import type { Command } from 'commander';

import { ValidationFailedError } from '../errors/operational-error.js';
import { adaptBrokerFile } from '../orchestration/adapt-broker-source.js';
import { processCliRuntime, type CliRuntime } from '../runtime.js';

export interface ValidateCommandOptions {
  readonly broker: string;
}

export async function runValidateCommand(
  inputFile: string,
  options: ValidateCommandOptions,
  writeStdout: (contents: string) => void = (contents) => process.stdout.write(contents),
): Promise<void> {
  const adapted = await adaptBrokerFile({ filePath: inputFile, broker: options.broker });
  const errors = adapted.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) throw new ValidationFailedError(errors);
  const warnings = adapted.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning');
  writeStdout(
    `Valid: ${basename(inputFile)} (${adapted.sourceRecordCount} records, ${adapted.activities.length} activities, ${warnings.length} warnings)\n`,
  );
}

export function registerValidateCommand(
  program: Command,
  runtime: CliRuntime = processCliRuntime,
): void {
  program
    .command('validate')
    .description('Validate broker CSV parsing and canonical activity normalization')
    .argument('<input.csv>', 'UTF-8 broker CSV file')
    .requiredOption('--broker <broker>', 'source broker (currently: robinhood)')
    .action((inputFile: string, options: ValidateCommandOptions) =>
      runValidateCommand(inputFile, options, runtime.writeStdout),
    );
}
