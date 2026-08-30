import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { brokerActivitySchema, decimalToString } from './index.js';

const provenance = {
  sourceFile: 'robinhood-equities-synthetic.csv',
  sourceIndex: 0,
  sourceRow: 2,
};

describe('broker activity schema', () => {
  it('validates date-only trade activity without fabricating a timestamp or fees', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_001',
      broker: 'robinhood',
      activityType: 'trade',
      instrument: {
        assetType: 'equity',
        symbol: 'AAPL',
      },
      activityDate: '2026-08-03',
      timestampPrecision: 'date',
      side: 'buy',
      quantity: '10',
      price: '205.12',
      grossAmount: '-2051.20',
      provenance,
    });

    expect(activity.timestamp).toBeUndefined();
    expect(activity.fees).toBeUndefined();
    expect(activity.quantity).toBeInstanceOf(Decimal);
    expect(activity.grossAmount?.equals('-2051.20')).toBe(true);
  });

  it('validates datetime trade activity with canonical UTC time', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_002',
      broker: 'ibkr',
      activityType: 'trade',
      activityDate: '2026-08-03',
      timestamp: '2026-08-03T14:31:00.000Z',
      timestampPrecision: 'datetime',
      side: 'sell',
      quantity: '1.5',
      price: '210.25',
      provenance,
    });

    expect(activity.timestamp).toBe('2026-08-03T14:31:00.000Z');
  });

  it('validates date-only option trade activity without inventing fees or a timestamp', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_option_date',
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
      quantity: '2',
      price: '4.25',
      provenance: { sourceIndex: 0 },
    });

    expect(activity.instrument?.assetType).toBe('option');
    expect(activity.quantity?.equals(2)).toBe(true);
    expect(activity.price?.equals('4.25')).toBe(true);
    expect(activity.timestamp).toBeUndefined();
    expect(activity.fees).toBeUndefined();
  });

  it('validates datetime option trade activity with an explicit multiplier and fees', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_option_datetime',
      broker: 'test-broker',
      activityType: 'trade',
      instrument: {
        assetType: 'option',
        underlying: 'AAPL',
        expiration: '2026-09-18',
        strike: '17.5',
        optionType: 'put',
        multiplier: 10,
      },
      activityDate: '2026-08-03',
      timestamp: '2026-08-03T14:31:00.000Z',
      timestampPrecision: 'datetime',
      side: 'sell',
      quantity: '1',
      price: '2.10',
      fees: {
        commission: '0.50',
        regulatory: '0',
        contract: '0.10',
        other: '0',
        total: '0.60',
      },
      provenance: { sourceIndex: 0 },
    });

    expect(activity.instrument).toMatchObject({
      assetType: 'option',
      multiplier: 10,
      optionType: 'put',
    });
    expect(activity.fees?.total.equals('0.60')).toBe(true);
  });

  it('validates dividend activity without execution-only fields', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_003',
      broker: 'robinhood',
      activityType: 'dividend',
      instrument: {
        assetType: 'equity',
        symbol: 'MSFT',
      },
      activityDate: '2026-08-18',
      timestampPrecision: 'date',
      grossAmount: '3.32',
      provenance: { ...provenance, sourceIndex: 7, sourceRow: 9 },
    });

    expect(activity.side).toBeUndefined();
    expect(activity.quantity).toBeUndefined();
    expect(activity.grossAmount?.equals('3.32')).toBe(true);
  });

  it.each([
    ['fee', '-5.00'],
    ['deposit', '1500.00'],
  ] as const)(
    'validates %s account activity with optional financial fields',
    (activityType, amount) => {
      const activity = brokerActivitySchema.parse({
        id: `activity_${activityType}`,
        broker: 'robinhood',
        activityType,
        activityDate: '2026-08-28',
        timestampPrecision: 'date',
        grossAmount: amount,
        provenance,
      });

      expect(activity.instrument).toBeUndefined();
      expect(activity.fees).toBeUndefined();
      expect(activity.grossAmount?.equals(amount)).toBe(true);
    },
  );

  it('allows an activity with no optional financial fields', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_unknown',
      broker: 'robinhood',
      activityType: 'unknown',
      activityDate: '2026-08-28',
      timestampPrecision: 'date',
      provenance,
    });

    expect(activity.quantity).toBeUndefined();
    expect(activity.price).toBeUndefined();
    expect(activity.grossAmount).toBeUndefined();
    expect(activity.fees).toBeUndefined();
  });

  it.each([
    [
      'date precision with a timestamp',
      {
        activityDate: '2026-08-03',
        timestampPrecision: 'date',
        timestamp: '2026-08-03T00:00:00.000Z',
      },
    ],
    [
      'datetime precision without a timestamp',
      { activityDate: '2026-08-03', timestampPrecision: 'datetime' },
    ],
    ['an invalid activity date', { activityDate: '2026-02-30', timestampPrecision: 'date' }],
    [
      'a non-UTC timestamp',
      {
        activityDate: '2026-08-03',
        timestampPrecision: 'datetime',
        timestamp: '2026-08-03T10:31:00.000-04:00',
      },
    ],
  ])('rejects %s', (_label, temporalFields) => {
    expect(
      brokerActivitySchema.safeParse({
        id: 'activity_invalid',
        broker: 'robinhood',
        activityType: 'trade',
        provenance,
        ...temporalFields,
      }).success,
    ).toBe(false);
  });

  it('uses the canonical non-exponential Decimal serialization convention', () => {
    const activity = brokerActivitySchema.parse({
      id: 'activity_large_amount',
      broker: 'robinhood',
      activityType: 'deposit',
      activityDate: '2026-08-27',
      timestampPrecision: 'date',
      grossAmount: '1000000000000000000000000000000',
      provenance,
    });

    expect(activity.grossAmount).toBeInstanceOf(Decimal);
    expect(decimalToString(activity.grossAmount!)).toBe('1000000000000000000000000000000');
  });
});
