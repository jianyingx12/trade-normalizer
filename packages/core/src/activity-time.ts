import type { BrokerActivity } from '@trade-normalizer/schemas';

/** Returns the source datetime text without claiming local time is a UTC instant. */
export function brokerActivityDateTime(
  activity: Pick<BrokerActivity, 'timestamp' | 'localDateTime'>,
): string | undefined {
  return activity.timestamp ?? activity.localDateTime;
}
