import { Command, CommanderError } from 'commander';

import { registerInspectCommand } from './commands/inspect.js';
import { registerNormalizeCommand } from './commands/normalize.js';
import { registerValidateCommand } from './commands/validate.js';
import { processCliRuntime, type CliRuntime } from './runtime.js';

export function createProgram(runtime: CliRuntime = processCliRuntime): Command {
  const program = new Command()
    .name('trade-normalizer')
    .description('Normalize broker exports into canonical trade data')
    .version('0.1.0')
    .showHelpAfterError()
    .configureOutput({ writeOut: runtime.writeStdout, writeErr: runtime.writeStderr })
    .exitOverride();

  registerNormalizeCommand(program, runtime);
  registerInspectCommand(program, runtime);
  registerValidateCommand(program, runtime);
  return program;
}

/** Runs the real command parser and returns the documented process exit code. */
export async function runCli(
  argv: readonly string[],
  runtime: CliRuntime = processCliRuntime,
): Promise<number> {
  try {
    await createProgram(runtime).parseAsync([...argv]);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 2;
    const message = error instanceof Error ? error.message : 'Unexpected CLI failure.';
    runtime.writeStderr(`Error: ${message}\n`);
    return 1;
  }
}
