import { domainErrorSchema, type Diagnostic } from '@trade-normalizer/schemas';

import type { UnpromotedTradeOwnershipKind } from './types.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function promotionFailureDiagnostic(
  kind: UnpromotedTradeOwnershipKind,
  referenceIds: readonly string[],
  error: unknown,
): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'TRADE_PROMOTION_FAILED',
    message: `Canonical Trade promotion failed for ${kind}.`,
    details: { kind, referenceIds, cause: errorMessage(error).slice(0, 3000) },
  });
}

export function inconsistentOwnershipDiagnostic(
  affectedLotIds: readonly string[],
  message: string,
): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'INCONSISTENT_TRADE_OWNERSHIP',
    message: 'Option ownership cannot be promoted without risking duplicate or missing quantity.',
    details: { affectedLotIds, cause: message.slice(0, 3000) },
  });
}
