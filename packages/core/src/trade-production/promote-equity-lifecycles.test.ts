import {
  brokerActivitySchema,
  tradeSchema,
  type BrokerActivityInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructEquityPositions } from '../equity-reconstruction/reconstruct-equity-positions.js';
import { promoteEquityLifecycles } from './promote-equity-lifecycles.js';

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

function fees(total: string): NonNullable<BrokerActivityInput['fees']> {
  return { commission: total, regulatory: '0', contract: '0', other: '0', total };
}

function reconstruct(overrides: readonly Partial<BrokerActivityInput>[]) {
  const activities = overrides.map((override, index) =>
    brokerActivitySchema.parse({
      ...baseActivity,
      id: `activity-${index}`,
      activityDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
      provenance: { sourceIndex: index },
      ...override,
    }),
  );
  return reconstructEquityPositions(activities);
}

describe('promoteEquityLifecycles', () => {
  it('promotes one closed lifecycle to one date-precision equity_long Trade', () => {
    const trades = promoteEquityLifecycles(
      reconstruct([
        { id: 'buy', quantity: '2' },
        { id: 'sell', side: 'sell', quantity: '2', price: '12' },
      ]),
    );
    const trade = trades[0]!;

    expect(trades).toHaveLength(1);
    expect(trade).toMatchObject({
      broker: 'test-broker',
      accountId: 'account-1',
      underlying: 'AAPL',
      assetType: 'equity',
      strategy: 'equity_long',
      status: 'closed',
      opened: { date: '2026-08-01', precision: 'date' },
      closed: { date: '2026-08-02', precision: 'date' },
    });
    expect(trade.opened.timestamp).toBeUndefined();
    expect(trade.closed?.timestamp).toBeUndefined();
    expect(trade.legs[0]).toMatchObject({
      direction: 'long',
      lifecycleIds: ['lifecycle:buy'],
      openingActivityIds: ['buy'],
      closingActivityIds: ['sell'],
      executionIds: [],
    });
    expect(trade.legs[0]?.quantity.toString()).toBe('2');
    expect(trade.legs[0]?.openQuantity.isZero()).toBe(true);
    expect(tradeSchema.safeParse(trade).success).toBe(true);
  });

  it('promotes an untouched open lifecycle without closed timing', () => {
    const trade = promoteEquityLifecycles(reconstruct([{ id: 'buy', quantity: '2' }]))[0]!;

    expect(trade.status).toBe('open');
    expect(trade.closed).toBeUndefined();
    expect(trade.legs[0]?.openQuantity.toString()).toBe('2');
    expect(trade.grossRealizedPnl.isZero()).toBe(true);
  });

  it('keeps additional buys and partial sells in one partially_closed Trade', () => {
    const trade = promoteEquityLifecycles(
      reconstruct([
        { id: 'buy-1', quantity: '2' },
        { id: 'buy-2', quantity: '1', price: '11' },
        { id: 'partial-sell', side: 'sell', quantity: '1', price: '12' },
      ]),
    )[0]!;

    expect(trade.status).toBe('partially_closed');
    expect(trade.closed).toBeUndefined();
    expect(trade.legs[0]?.quantity.toString()).toBe('3');
    expect(trade.legs[0]?.openQuantity.toString()).toBe('2');
    expect(trade.legs[0]?.openingActivityIds).toEqual(['buy-1', 'buy-2']);
    expect(trade.legs[0]?.closingActivityIds).toEqual(['partial-sell']);
    expect(trade.grossRealizedPnl.toString()).toBe('2');
  });

  it('preserves confirmed datetime timing', () => {
    const trade = promoteEquityLifecycles(
      reconstruct([
        {
          id: 'buy',
          timestampPrecision: 'datetime',
          timestamp: '2026-08-01T14:30:00.000Z',
        },
        {
          id: 'sell',
          side: 'sell',
          timestampPrecision: 'datetime',
          timestamp: '2026-08-02T15:45:00.000Z',
        },
      ]),
    )[0]!;

    expect(trade.opened).toEqual({
      date: '2026-08-01',
      timestamp: '2026-08-01T14:30:00.000Z',
      precision: 'datetime',
    });
    expect(trade.closed).toEqual({
      date: '2026-08-02',
      timestamp: '2026-08-02T15:45:00.000Z',
      precision: 'datetime',
    });
  });

  it('conserves known realized fees and net P&L', () => {
    const trade = promoteEquityLifecycles(
      reconstruct([
        { id: 'buy', fees: fees('0.3') },
        { id: 'sell', side: 'sell', price: '12', fees: fees('0.2') },
      ]),
    )[0]!;

    expect(trade.grossRealizedPnl.toString()).toBe('2');
    expect(trade.fees?.toString()).toBe('0.5');
    expect(trade.netRealizedPnl?.toString()).toBe('1.5');
    expect(trade.legs[0]?.fees?.equals(trade.fees!)).toBe(true);
  });

  it('keeps fees and net P&L unknown when a matched side lacks fees', () => {
    const trade = promoteEquityLifecycles(
      reconstruct([{ id: 'buy' }, { id: 'sell', side: 'sell', price: '12', fees: fees('0') }]),
    )[0]!;

    expect(trade.grossRealizedPnl.toString()).toBe('2');
    expect(trade.fees).toBeUndefined();
    expect(trade.netRealizedPnl).toBeUndefined();
  });

  it('produces stable IDs while isolating lifecycles and accounts', () => {
    const reconstruction = reconstruct([
      { id: 'first-buy' },
      { id: 'first-close', side: 'sell', price: '11' },
      { id: 'second-buy', accountId: 'account-2' },
    ]);
    const original = promoteEquityLifecycles(reconstruction);
    const reordered = promoteEquityLifecycles({
      lifecycles: [...reconstruction.lifecycles].reverse(),
    });

    expect(original).toEqual(reordered);
    expect(new Set(original.map((trade) => trade.id)).size).toBe(2);
    expect(original.map((trade) => trade.accountId).sort()).toEqual(['account-1', 'account-2']);
  });
});
