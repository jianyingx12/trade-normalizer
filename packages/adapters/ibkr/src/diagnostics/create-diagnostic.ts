import {
  domainErrorSchema,
  warningSchema,
  type Diagnostic,
  type DiagnosticCode,
} from '@trade-normalizer/core';

interface AdapterErrorOptions {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly sourceIndex?: number;
  readonly sourceIndexes?: readonly number[];
  readonly executionIds?: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;
}

function diagnosticInput(options: AdapterErrorOptions) {
  return {
    code: options.code,
    message: options.message,
    sourceIndexes:
      options.sourceIndexes ?? (options.sourceIndex === undefined ? [] : [options.sourceIndex]),
    executionIds: options.executionIds ?? [],
    ...(options.details === undefined ? {} : { details: options.details }),
  };
}

export function createIbkrAdapterError(options: AdapterErrorOptions): Diagnostic {
  return domainErrorSchema.parse({ severity: 'error', ...diagnosticInput(options) });
}

export function createIbkrAdapterWarning(options: AdapterErrorOptions): Diagnostic {
  return warningSchema.parse({ severity: 'warning', ...diagnosticInput(options) });
}
