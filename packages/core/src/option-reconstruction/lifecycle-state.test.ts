import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { prepareOptionActivities } from './prepare-activities.js';
import { replayOptionActivities } from './replay-activities.js';

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  accountId: 'account-1',
  activityType: 'trade',
  instrument: {
    assetType: 'option',
    underlying: 'AAPL',
    expiration: '2026-09-18',
    strike: '200',
    optionType: 'call',
    multiplier: 100,
  },
  activityDate: '2026-08-01',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '4',
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
  return replayOptionActivities(prepareOptionActivities(activities).activities);
}

describe('option position lifecycles', () => {
  it('keeps additional entries and partial closes in one open long lifecycle', () => {
    const result = replay([
      { id: 'buy-1', quantity: '2' },
      { id: 'buy-2', quantity: '1', price: '5' },
      { id: 'partial-sell', side: 'sell', quantity: '1', price: '6' },
    ]);
    const lifecycle = result.lifecycles[0];

    expect(lifecycle).toMatchObject({
      id: 'option-lifecycle:buy-1',
      direction: 'long',
      status: 'open',
      openingActivityId: 'buy-1',
      openedOn: '2026-08-01',
      activityIds: ['buy-1', 'buy-2', 'partial-sell'],
    });
    expect(lifecycle?.openQuantity.toString()).toBe('2');
    expect(lifecycle?.remainingOpeningPremium.toString()).toBe('900');
    expect(lifecycle?.closingActivityId).toBeUndefined();
  });

  it('closes a short lifecycle when buy quantity returns it exactly to zero', () => {
    const result = replay([
      { id: 'short-open', side: 'sell', quantity: '2', price: '5' },
      { id: 'partial-buy', side: 'buy', quantity: '1', price: '4' },
      { id: 'closing-buy', side: 'buy', quantity: '1', price: '3' },
    ]);
    const lifecycle = result.lifecycles[0];

    expect(lifecycle).toMatchObject({
      direction: 'short',
      status: 'closed',
      openingActivityId: 'short-open',
      closingActivityId: 'closing-buy',
      openedOn: '2026-08-01',
      closedOn: '2026-08-03',
    });
    expect(lifecycle?.openQuantity.isZero()).toBe(true);
    expect(lifecycle?.grossRealizedPnl.toString()).toBe('300');
  });

  it('starts a separate opposite-direction lifecycle after returning to flat', () => {
    const result = replay([
      { id: 'long-open', side: 'buy' },
      { id: 'long-close', side: 'sell', price: '5' },
      { id: 'short-open', side: 'sell', price: '6' },
      { id: 'short-close', side: 'buy', price: '4' },
    ]);

    expect(result.lifecycles.map((lifecycle) => lifecycle.direction)).toEqual(['long', 'short']);
    expect(result.lifecycles.map((lifecycle) => lifecycle.status)).toEqual(['closed', 'closed']);
    expect(result.lifecycles.map((lifecycle) => lifecycle.activityIds)).toEqual([
      ['long-open', 'long-close'],
      ['short-open', 'short-close'],
    ]);
    expect(result.positions[0]?.lifecycles).toEqual(result.lifecycles);
  });

  it('keeps lots and matches linked to their lifecycle', () => {
    const result = replay([{ id: 'open' }, { id: 'close', side: 'sell', price: '5' }]);

    expect(result.lifecycles[0]?.lots[0]?.lifecycleId).toBe('option-lifecycle:open');
    expect(result.lifecycles[0]?.matches[0]?.lifecycleId).toBe('option-lifecycle:open');
  });

  it('does not record a rejected reversal in lifecycle history', () => {
    const result = replay([
      { id: 'open', quantity: '1' },
      { id: 'reversal', side: 'sell', quantity: '2', price: '6' },
    ]);

    expect(result.diagnostics[0]?.code).toBe('OPTION_POSITION_REVERSAL_NOT_SUPPORTED');
    expect(result.lifecycles[0]?.activityIds).toEqual(['open']);
    expect(result.lifecycles[0]?.status).toBe('open');
    expect(result.lifecycles[0]?.openQuantity.toString()).toBe('1');
  });
});
