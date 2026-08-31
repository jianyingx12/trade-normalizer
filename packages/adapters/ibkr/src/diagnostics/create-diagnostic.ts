import { domainErrorSchema, type Diagnostic, type DiagnosticCode } from '@trade-normalizer/core';

interface AdapterErrorOptions {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly sourceIndex?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function createIbkrAdapterError(options: AdapterErrorOptions): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: options.code,
    message: options.message,
    sourceIndexes: options.sourceIndex === undefined ? [] : [options.sourceIndex],
    ...(options.details === undefined ? {} : { details: options.details }),
  });
}
