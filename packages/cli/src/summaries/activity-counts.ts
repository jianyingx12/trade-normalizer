import type { BrokerActivity, BrokerActivityType } from '@trade-normalizer/core';

export const ACTIVITY_TYPES: readonly BrokerActivityType[] = [
  'trade',
  'dividend',
  'deposit',
  'withdrawal',
  'fee',
  'split',
  'unknown',
];

export interface ActivityCounts {
  readonly activityTypes: Readonly<Record<BrokerActivityType, number>>;
  readonly assetTypes: Readonly<Record<'equity' | 'option' | 'unspecified', number>>;
}

export function countActivities(activities: readonly BrokerActivity[]): ActivityCounts {
  const activityTypes = Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, 0])) as Record<
    BrokerActivityType,
    number
  >;
  const assetTypes = { equity: 0, option: 0, unspecified: 0 };

  for (const activity of activities) {
    activityTypes[activity.activityType] += 1;
    assetTypes[activity.instrument?.assetType ?? 'unspecified'] += 1;
  }
  return { activityTypes, assetTypes };
}
