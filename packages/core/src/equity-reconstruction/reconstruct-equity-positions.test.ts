import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructEquityPositions } from './reconstruct-equity-positions.js';

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  activityType: 'trade',
  instrument: { assetType: 'equity', symbol: 'AAPL' },
  activityDate: '2026-08-01',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '10',
  provenance: { sourceIndex: 0 },
};

function activity(override: Partial<BrokerActivityInput> = {}) {
  return brokerActivitySchema.parse({ ...baseActivity, ...override });
}

describe('reconstructEquityPositions', () => {
  it('runs eligibility, ordering, and FIFO replay through one API', () => {
    const result = reconstructEquityPositions([
      activity({
        id: 'sell',
        activityDate: '2026-08-02',
        side: 'sell',
        quantity: '1',
        price: '15',
        provenance: { sourceIndex: 1 },
      }),
      activity({ id: 'buy', quantity: '2', provenance: { sourceIndex: 0 } }),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.positions[0]?.openQuantity.toString()).toBe('1');
    expect(result.openLots).toHaveLength(1);
    expect(result.openLots[0]?.remainingQuantity.toString()).toBe('1');
    expect(result.matches[0]?.grossRealizedPnl.toString()).toBe('5');
    expect(result.lifecycles[0]?.status).toBe('open');
  });

  it('omits fully consumed lots from the top-level open-lot view', () => {
    const result = reconstructEquityPositions([
      activity({ id: 'buy', quantity: '1' }),
      activity({
        id: 'sell',
        activityDate: '2026-08-02',
        side: 'sell',
        quantity: '1',
        provenance: { sourceIndex: 1 },
      }),
    ]);

    expect(result.openLots).toEqual([]);
    expect(result.positions[0]?.lots).toHaveLength(1);
    expect(result.positions[0]?.lots[0]?.remainingQuantity.isZero()).toBe(true);
    expect(result.lifecycles[0]?.status).toBe('closed');
  });

  it('returns eligibility and replay diagnostics in deterministic pipeline order', () => {
    const result = reconstructEquityPositions([
      activity({ id: 'incomplete', side: undefined }),
      activity({
        id: 'unmatched-sell',
        side: 'sell',
        activityDate: '2026-08-02',
        provenance: { sourceIndex: 1 },
      }),
    ]);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'INCOMPLETE_TRADE_ACTIVITY',
      'SELL_WITHOUT_OPEN_POSITION',
    ]);
  });

  it('ignores non-trade activity without creating inventory', () => {
    const result = reconstructEquityPositions([
      activity({
        id: 'dividend',
        activityType: 'dividend',
        side: undefined,
        quantity: undefined,
        price: undefined,
      }),
    ]);

    expect(result).toEqual({
      positions: [],
      openLots: [],
      matches: [],
      lifecycles: [],
      diagnostics: [],
    });
  });

  it('produces identical output for identical input without mutating it', () => {
    const input = [
      activity({ id: 'buy', quantity: '2' }),
      activity({
        id: 'sell',
        activityDate: '2026-08-02',
        side: 'sell',
        provenance: { sourceIndex: 1 },
      }),
    ];
    const originalIds = input.map((item) => item.id);

    expect(reconstructEquityPositions(input)).toEqual(reconstructEquityPositions(input));
    expect(input.map((item) => item.id)).toEqual(originalIds);
  });
});
