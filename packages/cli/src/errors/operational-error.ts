import type { Diagnostic } from '@trade-normalizer/core';

export class UnsupportedBrokerError extends Error {
  readonly broker: string;
  readonly supportedBrokers: readonly string[];

  constructor(broker: string, supportedBrokers: readonly string[]) {
    super(`Unsupported broker: ${broker}. Supported brokers: ${supportedBrokers.join(', ')}`);
    this.name = 'UnsupportedBrokerError';
    this.broker = broker;
    this.supportedBrokers = supportedBrokers;
  }
}

export class InputFileError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    super(`Unable to read input file: ${filePath}`, { cause });
    this.name = 'InputFileError';
    this.filePath = filePath;
  }
}

export class OutputFileError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause?: unknown) {
    super(`Unable to write output file: ${filePath}`, { cause });
    this.name = 'OutputFileError';
    this.filePath = filePath;
  }
}

export class InputOverwriteError extends Error {
  constructor(filePath: string) {
    super(`Output file must not overwrite the input file: ${filePath}`);
    this.name = 'InputOverwriteError';
  }
}

export class BrokerInputError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const reason = diagnostics[0]?.message ?? 'Broker input could not be adapted.';
    super(reason);
    this.name = 'BrokerInputError';
    this.diagnostics = diagnostics;
  }
}

export class BrokerAdapterError extends Error {
  readonly broker: string;

  constructor(broker: string, cause: unknown) {
    super(`The ${broker} adapter failed unexpectedly.`, { cause });
    this.name = 'BrokerAdapterError';
    this.broker = broker;
  }
}
