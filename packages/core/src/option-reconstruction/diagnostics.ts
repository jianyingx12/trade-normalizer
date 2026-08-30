import { domainErrorSchema, type Diagnostic } from '@trade-normalizer/schemas';
import type { Decimal } from 'decimal.js';

import type { EligibleOptionTradeActivity, OptionPositionDirection } from './types.js';

export function optionReversalDiagnostic(
  activity: EligibleOptionTradeActivity,
  direction: OptionPositionDirection,
  availableQuantity: Decimal,
): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'OPTION_POSITION_REVERSAL_NOT_SUPPORTED',
    message: 'Option activity would cross zero and reverse the open position direction.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: {
      activityId: activity.id,
      contract: {
        underlying: activity.instrument.underlying,
        expiration: activity.instrument.expiration,
        strike: activity.instrument.strike.toString(),
        optionType: activity.instrument.optionType,
        multiplier: activity.instrument.multiplier,
      },
      direction,
      activitySide: activity.side,
      activityQuantity: activity.quantity.toString(),
      availableQuantity: availableQuantity.toString(),
    },
  });
}
