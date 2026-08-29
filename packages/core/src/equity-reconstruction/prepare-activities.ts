import { domainErrorSchema, type BrokerActivity, type Diagnostic } from '@trade-normalizer/schemas';

import type { EligibleEquityTradeActivity, PreparedEquityActivities } from './types.js';

function compareCanonicalActivityOrder(
  left: EligibleEquityTradeActivity,
  right: EligibleEquityTradeActivity,
): number {
  if (left.activityDate !== right.activityDate) {
    return left.activityDate < right.activityDate ? -1 : 1;
  }

  if (left.provenance.sourceIndex !== right.provenance.sourceIndex) {
    return left.provenance.sourceIndex - right.provenance.sourceIndex;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
}

function incompleteActivityDiagnostic(activity: BrokerActivity): Diagnostic {
  const missingFields = [
    activity.instrument === undefined ? 'instrument' : undefined,
    activity.side === undefined ? 'side' : undefined,
    activity.quantity === undefined ? 'quantity' : undefined,
    activity.price === undefined ? 'price' : undefined,
  ].filter((field): field is string => field !== undefined);

  return domainErrorSchema.parse({
    severity: 'error',
    code: 'INCOMPLETE_TRADE_ACTIVITY',
    message: 'Trade activity is missing fields required for equity reconstruction.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: {
      activityId: activity.id,
      missingFields,
    },
  });
}

function unsupportedAssetDiagnostic(activity: BrokerActivity): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'UNSUPPORTED_ASSET_TYPE',
    message: 'Equity reconstruction does not support this trade activity asset type.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: {
      activityId: activity.id,
      assetType: activity.instrument?.assetType,
    },
  });
}

/**
 * Selects complete equity trade activities and applies the canonical V1 replay order.
 * sourceIndex is deterministic fallback evidence, not a claim about intraday chronology.
 */
export function prepareEquityActivities(
  activities: readonly BrokerActivity[],
): PreparedEquityActivities {
  const eligible: EligibleEquityTradeActivity[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const activity of activities) {
    if (activity.activityType !== 'trade') {
      continue;
    }

    if (
      activity.instrument === undefined ||
      activity.side === undefined ||
      activity.quantity === undefined ||
      activity.price === undefined
    ) {
      diagnostics.push(incompleteActivityDiagnostic(activity));
      continue;
    }

    if (activity.instrument.assetType !== 'equity') {
      diagnostics.push(unsupportedAssetDiagnostic(activity));
      continue;
    }

    eligible.push({
      ...activity,
      activityType: 'trade',
      instrument: activity.instrument,
      side: activity.side,
      quantity: activity.quantity,
      price: activity.price,
    });
  }

  eligible.sort(compareCanonicalActivityOrder);

  return {
    activities: eligible,
    diagnostics,
  };
}
