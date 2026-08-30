import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { prepareOptionActivities } from './prepare-activities.js';

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  activityType: 'trade',
  instrument: {
    assetType: 'option',
    underlying: 'AAPL',
    expiration: '2026-09-18',
    strike: '200',
    optionType: 'call',
    multiplier: 100,
  },
  activityDate: '2026-08-03',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '4',
  provenance: { sourceIndex: 0 },
};

function activity(override: Partial<BrokerActivityInput> = {}) {
  return brokerActivitySchema.parse({ ...baseActivity, ...override });
}

describe('prepareOptionActivities', () => {
  it('keeps complete canonical option trade activity', () => {
    const result = prepareOptionActivities([activity()]);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.instrument).toMatchObject({
      assetType: 'option',
      underlying: 'AAPL',
      multiplier: 100,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('ignores non-trade activity without a diagnostic', () => {
    const dividend = activity({
      activityType: 'dividend',
      side: undefined,
      quantity: undefined,
      price: undefined,
    });

    expect(prepareOptionActivities([dividend])).toEqual({ activities: [], diagnostics: [] });
  });

  it('diagnoses incomplete option trade activity', () => {
    const result = prepareOptionActivities([
      activity({ id: 'incomplete', quantity: undefined, price: undefined }),
    ]);

    expect(result.activities).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('INCOMPLETE_TRADE_ACTIVITY');
    expect(result.diagnostics[0]?.details).toMatchObject({
      activityId: 'incomplete',
      missingFields: ['quantity', 'price'],
    });
  });

  it('diagnoses an equity trade as an unsupported asset type', () => {
    const result = prepareOptionActivities([
      activity({ instrument: { assetType: 'equity', symbol: 'AAPL' } }),
    ]);

    expect(result.activities).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('UNSUPPORTED_ASSET_TYPE');
    expect(result.diagnostics[0]?.details).toMatchObject({ assetType: 'equity' });
  });

  it('orders different dates by activityDate', () => {
    const later = activity({ id: 'later', activityDate: '2026-08-04' });
    const earlier = activity({
      id: 'earlier',
      activityDate: '2026-08-03',
      provenance: { sourceIndex: 10 },
    });

    expect(prepareOptionActivities([later, earlier]).activities.map((item) => item.id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('orders an all-datetime date by canonical timestamp', () => {
    const laterTimestamp = activity({
      id: 'later-timestamp',
      timestampPrecision: 'datetime',
      timestamp: '2026-08-03T15:00:00.000Z',
      provenance: { sourceIndex: 0 },
    });
    const earlierTimestamp = activity({
      id: 'earlier-timestamp',
      timestampPrecision: 'datetime',
      timestamp: '2026-08-03T14:00:00.000Z',
      provenance: { sourceIndex: 1 },
    });

    expect(
      prepareOptionActivities([laterTimestamp, earlierTimestamp]).activities.map((item) => item.id),
    ).toEqual(['earlier-timestamp', 'later-timestamp']);
  });

  it('uses source order for an entire date when any activity is date-only', () => {
    const laterTimestamp = activity({
      id: 'datetime',
      timestampPrecision: 'datetime',
      timestamp: '2026-08-03T23:00:00.000Z',
      provenance: { sourceIndex: 0 },
    });
    const dateOnly = activity({ id: 'date-only', provenance: { sourceIndex: 1 } });
    const earlierTimestamp = activity({
      id: 'earlier-datetime',
      timestampPrecision: 'datetime',
      timestamp: '2026-08-03T10:00:00.000Z',
      provenance: { sourceIndex: 2 },
    });

    expect(
      prepareOptionActivities([earlierTimestamp, dateOnly, laterTimestamp]).activities.map(
        (item) => item.id,
      ),
    ).toEqual(['datetime', 'date-only', 'earlier-datetime']);
  });

  it('uses sourceIndex for date-only activities sharing one date', () => {
    const second = activity({ id: 'second', provenance: { sourceIndex: 2 } });
    const first = activity({ id: 'first', provenance: { sourceIndex: 1 } });

    expect(prepareOptionActivities([second, first]).activities.map((item) => item.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('uses stable activity ID as the final fallback', () => {
    const beta = activity({ id: 'beta' });
    const alpha = activity({ id: 'alpha' });

    expect(prepareOptionActivities([beta, alpha]).activities.map((item) => item.id)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('does not mutate input and produces deterministic output', () => {
    const input = [
      activity({ id: 'second', provenance: { sourceIndex: 2 } }),
      activity({ id: 'first', provenance: { sourceIndex: 1 } }),
    ];
    const originalOrder = input.map((item) => item.id);

    expect(prepareOptionActivities(input)).toEqual(prepareOptionActivities(input));
    expect(input.map((item) => item.id)).toEqual(originalOrder);
  });
});
