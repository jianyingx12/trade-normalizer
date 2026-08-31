import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { prepareEquityActivities } from './prepare-activities.js';
import { replayEquityActivities } from './replay-activities.js';

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  accountId: 'account-1',
  activityType: 'trade',
  instrument: { assetType: 'equity', symbol: 'AAPL' },
  activityDate: '2026-08-01',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '10',
  provenance: { sourceIndex: 0 },
};

function replay(overrides: readonly Partial<BrokerActivityInput>[]) {
  const activities = overrides.map((override, index) =>
    brokerActivitySchema.parse({
      ...baseActivity,
      id: `activity-${index}`,
      activityDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
      provenance: { sourceIndex: index },
      ...override,
    }),
  );

  return replayEquityActivities(prepareEquityActivities(activities).activities);
}

describe('equity position lifecycles', () => {
  it('keeps partial exposure in one open lifecycle', () => {
    const result = replay([
      { id: 'buy-1', quantity: '2' },
      { id: 'buy-2', quantity: '1', price: '12' },
      { id: 'sell', side: 'sell', quantity: '1', price: '15' },
    ]);
    const lifecycle = result.lifecycles[0];

    expect(result.lifecycles).toHaveLength(1);
    expect(lifecycle).toMatchObject({
      id: 'lifecycle:buy-1',
      status: 'open',
      openingActivityId: 'buy-1',
      openedOn: '2026-08-01',
      activityIds: ['buy-1', 'buy-2', 'sell'],
    });
    expect(lifecycle?.closingActivityId).toBeUndefined();
    expect(lifecycle?.closedOn).toBeUndefined();
    expect(lifecycle?.openQuantity.toString()).toBe('2');
    expect(lifecycle?.lots).toHaveLength(2);
    expect(lifecycle?.matches).toHaveLength(1);
  });

  it('closes a lifecycle only when inventory returns exactly to zero', () => {
    const result = replay([
      { id: 'buy', quantity: '2' },
      { id: 'partial-sell', side: 'sell', quantity: '1', price: '11' },
      { id: 'closing-sell', side: 'sell', quantity: '1', price: '12' },
    ]);
    const lifecycle = result.lifecycles[0];

    expect(lifecycle).toMatchObject({
      status: 'closed',
      openingActivityId: 'buy',
      closingActivityId: 'closing-sell',
      openedOn: '2026-08-01',
      closedOn: '2026-08-03',
    });
    expect(lifecycle?.openQuantity.isZero()).toBe(true);
    expect(lifecycle?.grossRealizedPnl.toString()).toBe('3');
  });

  it('preserves confirmed datetime precision without changing date-only lifecycles', () => {
    const result = replay([
      {
        id: 'buy',
        timestamp: '2026-08-01T14:30:00.000Z',
        timestampPrecision: 'datetime',
      },
      {
        id: 'sell',
        side: 'sell',
        timestamp: '2026-08-02T15:45:00.000Z',
        timestampPrecision: 'datetime',
      },
    ]);
    const lifecycle = result.lifecycles[0]!;

    expect(lifecycle).toMatchObject({
      openedAt: '2026-08-01T14:30:00.000Z',
      openingTimestampPrecision: 'datetime',
      closedAt: '2026-08-02T15:45:00.000Z',
      closingTimestampPrecision: 'datetime',
    });
    expect(lifecycle.lots[0]).toMatchObject({
      openedAt: '2026-08-01T14:30:00.000Z',
      timestampPrecision: 'datetime',
    });
    expect(lifecycle.matches[0]).toMatchObject({
      closedAt: '2026-08-02T15:45:00.000Z',
      closingTimestampPrecision: 'datetime',
      closingSourceIndex: 1,
    });

    const dateOnly = replay([{ id: 'date-only' }]).lifecycles[0]!;
    expect(dateOnly.openingTimestampPrecision).toBe('date');
    expect(dateOnly.openedAt).toBeUndefined();
  });

  it('preserves local wall-clock timing through equity reconstruction', () => {
    const result = replay([
      {
        id: 'buy',
        localDateTime: '2026-08-01T09:30:01',
        timestampPrecision: 'local_datetime',
      },
      {
        id: 'sell',
        side: 'sell',
        localDateTime: '2026-08-02T15:59:45',
        timestampPrecision: 'local_datetime',
      },
    ]);
    const lifecycle = result.lifecycles[0]!;

    expect(lifecycle).toMatchObject({
      openedAt: '2026-08-01T09:30:01',
      openingTimestampPrecision: 'local_datetime',
      closedAt: '2026-08-02T15:59:45',
      closingTimestampPrecision: 'local_datetime',
    });
    expect(lifecycle.lots[0]?.openedAt).toBe('2026-08-01T09:30:01');
    expect(lifecycle.matches[0]?.closedAt).toBe('2026-08-02T15:59:45');
  });

  it('starts a new lifecycle after a fully closed position is reopened', () => {
    const result = replay([
      { id: 'first-buy' },
      { id: 'first-close', side: 'sell', price: '11' },
      { id: 'second-buy', price: '20' },
    ]);

    expect(result.lifecycles.map((lifecycle) => lifecycle.id)).toEqual([
      'lifecycle:first-buy',
      'lifecycle:second-buy',
    ]);
    expect(result.lifecycles.map((lifecycle) => lifecycle.status)).toEqual(['closed', 'open']);
    expect(result.lifecycles[0]?.activityIds).toEqual(['first-buy', 'first-close']);
    expect(result.lifecycles[1]?.activityIds).toEqual(['second-buy']);
    expect(result.positions[0]?.lifecycles).toEqual(result.lifecycles);
  });

  it('keeps lots and matches linked to their lifecycle', () => {
    const result = replay([
      { id: 'first-buy' },
      { id: 'first-close', side: 'sell', price: '11' },
      { id: 'second-buy', price: '20' },
      { id: 'second-close', side: 'sell', price: '18' },
    ]);

    expect(result.lifecycles[0]?.lots[0]?.lifecycleId).toBe('lifecycle:first-buy');
    expect(result.lifecycles[0]?.matches[0]?.lifecycleId).toBe('lifecycle:first-buy');
    expect(result.lifecycles[1]?.lots[0]?.lifecycleId).toBe('lifecycle:second-buy');
    expect(result.lifecycles[1]?.matches[0]?.lifecycleId).toBe('lifecycle:second-buy');
    expect(result.lifecycles[0]?.grossRealizedPnl.toString()).toBe('1');
    expect(result.lifecycles[1]?.grossRealizedPnl.toString()).toBe('-2');
  });

  it('does not record a rejected oversell in lifecycle history', () => {
    const result = replay([
      { id: 'buy' },
      { id: 'oversell', side: 'sell', quantity: '2', price: '12' },
    ]);

    expect(result.diagnostics[0]?.code).toBe('NEGATIVE_POSITION');
    expect(result.lifecycles[0]?.activityIds).toEqual(['buy']);
    expect(result.lifecycles[0]?.status).toBe('open');
    expect(result.lifecycles[0]?.openQuantity.toString()).toBe('1');
  });

  it('keeps lifecycle histories isolated by account and symbol', () => {
    const result = replay([
      { id: 'account-1-aapl' },
      { id: 'account-2-aapl', accountId: 'account-2' },
      {
        id: 'account-1-msft',
        instrument: { assetType: 'equity', symbol: 'MSFT' },
      },
    ]);

    expect(result.lifecycles.map((lifecycle) => lifecycle.key)).toEqual([
      { broker: 'test-broker', accountId: 'account-1', symbol: 'AAPL' },
      { broker: 'test-broker', accountId: 'account-2', symbol: 'AAPL' },
      { broker: 'test-broker', accountId: 'account-1', symbol: 'MSFT' },
    ]);
  });
});
