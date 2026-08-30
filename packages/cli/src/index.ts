#!/usr/bin/env node

import { Command, CommanderError } from 'commander';

import { registerNormalizeCommand } from './commands/normalize.js';

function createProgram(): Command {
  const program = new Command()
    .name('trade-normalizer')
    .description('Normalize broker exports into canonical trade data')
    .version('0.0.0')
    .showHelpAfterError()
    .exitOverride();

  registerNormalizeCommand(program);
  return program;
}

async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode === 0 ? 0 : 2;
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected CLI failure.';
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}

await main();
