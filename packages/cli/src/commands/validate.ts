import { basename } from 'node:path';

import type { Command } from 'commander';

import { ValidationFailedError } from '../errors/operational-error.js';
import { adaptBrokerFile } from '../orchestration/adapt-broker-source.js';
import { processCliRuntime, type CliRuntime } from '../runtime.js';

export interface ValidateCommandOptions {
  readonly broker: string;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
    `Valid: ${basename(inputFile)} (${countLabel(adapted.sourceRecordCount, 'record')}, ${countLabel(adapted.executions.length, 'execution')}, ${countLabel(adapted.activities.length, 'activity', 'activities')}, ${countLabel(warnings.length, 'warning')})\n`,
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
    .requiredOption(
      '--broker <broker>',
      'source broker (robinhood activity or UTN IBKR Trade Confirmation Execution CSV v1)',
    )
    .action((inputFile: string, options: ValidateCommandOptions) =>
      runValidateCommand(inputFile, options, runtime.writeStdout),
    );
}
