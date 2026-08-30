import type { Command } from 'commander';

import { inspectBrokerFile } from '../orchestration/inspect-broker-source.js';
import { formatInspection } from '../output/format-inspection.js';
import { serializeJson } from '../serialization/serialize-json.js';

export interface InspectCommandOptions {
  readonly broker: string;
  readonly json?: boolean;
}

export async function runInspectCommand(
  inputFile: string,
  options: InspectCommandOptions,
  writeStdout: (contents: string) => void = (contents) => process.stdout.write(contents),
): Promise<void> {
  const report = await inspectBrokerFile(inputFile, options.broker);
  writeStdout(options.json === true ? serializeJson(report) : formatInspection(report));
}

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Inspect broker source and adaptation results without reconstructing Trades')
    .argument('<input.csv>', 'UTF-8 broker CSV file')
    .requiredOption('--broker <broker>', 'source broker (currently: robinhood)')
    .option('--json', 'write the inspection report as JSON')
    .action((inputFile: string, options: InspectCommandOptions) =>
      runInspectCommand(inputFile, options),
    );
}
