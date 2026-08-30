import { domainErrorSchema, type BrokerActivity, type Diagnostic } from '@trade-normalizer/schemas';

import type { EligibleOptionTradeActivity, PreparedOptionActivities } from './types.js';

function compareStableFallback(
  left: EligibleOptionTradeActivity,
  right: EligibleOptionTradeActivity,
): number {
  if (left.provenance.sourceIndex !== right.provenance.sourceIndex) {
    return left.provenance.sourceIndex - right.provenance.sourceIndex;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
}

function compareCanonicalActivityOrder(
  datesWithDateOnlyActivity: ReadonlySet<string>,
  left: EligibleOptionTradeActivity,
  right: EligibleOptionTradeActivity,
): number {
  if (left.activityDate !== right.activityDate) {
    return left.activityDate < right.activityDate ? -1 : 1;
  }

  if (!datesWithDateOnlyActivity.has(left.activityDate)) {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp! < right.timestamp! ? -1 : 1;
    }
  }

  return compareStableFallback(left, right);
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
    message: 'Trade activity is missing fields required for option reconstruction.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: { activityId: activity.id, missingFields },
  });
}

function unsupportedAssetDiagnostic(activity: BrokerActivity): Diagnostic {
  return domainErrorSchema.parse({
    severity: 'error',
    code: 'UNSUPPORTED_ASSET_TYPE',
    message: 'Option reconstruction does not support this trade activity asset type.',
    sourceIndexes: [activity.provenance.sourceIndex],
    details: {
      activityId: activity.id,
      assetType: activity.instrument?.assetType,
    },
  });
}

/**
 * Selects complete option trades and applies truthful deterministic ordering.
 * A date containing any date-only activity uses source order for the entire date.
 */
export function prepareOptionActivities(
  activities: readonly BrokerActivity[],
): PreparedOptionActivities {
  const eligible: EligibleOptionTradeActivity[] = [];
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

    if (activity.instrument.assetType !== 'option') {
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

  const datesWithDateOnlyActivity = new Set(
    eligible
      .filter((activity) => activity.timestampPrecision === 'date')
      .map((activity) => activity.activityDate),
  );
  eligible.sort((left, right) =>
    compareCanonicalActivityOrder(datesWithDateOnlyActivity, left, right),
  );

  return { activities: eligible, diagnostics };
}
