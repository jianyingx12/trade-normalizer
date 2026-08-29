import {
  domainErrorSchema,
  warningSchema,
  type Diagnostic,
  type DiagnosticCode,
} from '@trade-normalizer/core';

interface DiagnosticOptions {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly sourceIndex?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

function contextFrom(options: DiagnosticOptions) {
  return {
    code: options.code,
    message: options.message,
    sourceIndexes: options.sourceIndex === undefined ? [] : [options.sourceIndex],
    ...(options.details === undefined ? {} : { details: options.details }),
  };
}

export function createAdapterError(options: DiagnosticOptions): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    ...contextFrom(options),
  });
}

export function createAdapterWarning(options: DiagnosticOptions): Diagnostic {
  return warningSchema.parse({
    severity: 'warning',
    ...contextFrom(options),
  });
}
