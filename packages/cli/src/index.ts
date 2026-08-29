#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command()
  .name('trade-normalizer')
  .description('Normalize broker exports into canonical trade data')
  .version('0.0.0');

program.parse();
