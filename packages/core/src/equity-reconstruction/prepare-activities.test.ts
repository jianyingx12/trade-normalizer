import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { prepareEquityActivities } from './prepare-activities.js';

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  activityType: 'trade',
  instrument: { assetType: 'equity', symbol: 'AAPL' },
  activityDate: '2026-08-03',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '100',
  provenance: { sourceIndex: 0 },
};

function activity(override: Partial<BrokerActivityInput> = {}) {
  return brokerActivitySchema.parse({
    ...baseActivity,
    ...override,
  });
}

describe('prepareEquityActivities', () => {
  it('keeps complete equity trade activity', () => {
    const result = prepareEquityActivities([activity()]);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.instrument).toEqual({ assetType: 'equity', symbol: 'AAPL' });
    expect(result.diagnostics).toEqual([]);
  });

  it('ignores non-trade activity without a diagnostic', () => {
    const dividend = activity({
      id: 'activity-dividend',
      activityType: 'dividend',
      side: undefined,
      quantity: undefined,
      price: undefined,
    });

    expect(prepareEquityActivities([dividend])).toEqual({ activities: [], diagnostics: [] });
  });

  it('diagnoses incomplete trade activity', () => {
    const incomplete = activity({
      id: 'activity-incomplete',
      side: undefined,
      quantity: undefined,
    });
    const result = prepareEquityActivities([incomplete]);

    expect(result.activities).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('INCOMPLETE_TRADE_ACTIVITY');
    expect(result.diagnostics[0]?.details).toMatchObject({
      activityId: 'activity-incomplete',
      missingFields: ['side', 'quantity'],
    });
  });

  it('diagnoses option trade activity as an unsupported asset type', () => {
    const option = activity({
      id: 'activity-option',
      instrument: {
        assetType: 'option',
        underlying: 'AAPL',
        expiration: '2026-09-18',
        strike: '200',
        optionType: 'call',
        multiplier: 100,
      },
    });
    const result = prepareEquityActivities([option]);

    expect(result.activities).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('UNSUPPORTED_ASSET_TYPE');
    expect(result.diagnostics[0]?.details).toMatchObject({
      activityId: 'activity-option',
      assetType: 'option',
    });
  });

  it('orders activities by activityDate before source order', () => {
    const later = activity({
      id: 'activity-later',
      activityDate: '2026-08-04',
      provenance: { sourceIndex: 0 },
    });
    const earlier = activity({
      id: 'activity-earlier',
      activityDate: '2026-08-03',
      provenance: { sourceIndex: 10 },
    });

    expect(prepareEquityActivities([later, earlier]).activities.map((item) => item.id)).toEqual([
      'activity-earlier',
      'activity-later',
    ]);
  });

  it('uses sourceIndex for activities sharing one date', () => {
    const second = activity({ id: 'activity-second', provenance: { sourceIndex: 2 } });
    const first = activity({ id: 'activity-first', provenance: { sourceIndex: 1 } });

    expect(prepareEquityActivities([second, first]).activities.map((item) => item.id)).toEqual([
      'activity-first',
      'activity-second',
    ]);
  });

  it('uses stable activity ID as the final ordering fallback', () => {
    const beta = activity({ id: 'activity-beta' });
    const alpha = activity({ id: 'activity-alpha' });

    expect(prepareEquityActivities([beta, alpha]).activities.map((item) => item.id)).toEqual([
      'activity-alpha',
      'activity-beta',
    ]);
  });

  it('keeps symbols isolated while ordering the shared activity stream', () => {
    const msft = activity({
      id: 'activity-msft',
      instrument: { assetType: 'equity', symbol: 'MSFT' },
      provenance: { sourceIndex: 1 },
    });
    const aapl = activity({ id: 'activity-aapl', provenance: { sourceIndex: 0 } });

    expect(
      prepareEquityActivities([msft, aapl]).activities.map((item) => item.instrument.symbol),
    ).toEqual(['AAPL', 'MSFT']);
  });

  it('does not mutate input and produces deterministic output', () => {
    const input = [
      activity({ id: 'activity-2', provenance: { sourceIndex: 2 } }),
      activity({ id: 'activity-1', provenance: { sourceIndex: 1 } }),
    ];
    const originalOrder = input.map((item) => item.id);

    const first = prepareEquityActivities(input);
    const second = prepareEquityActivities(input);

    expect(input.map((item) => item.id)).toEqual(originalOrder);
    expect(first).toEqual(second);
  });
});
