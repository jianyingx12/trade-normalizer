import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from './reconstruct-option-positions.js';

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
  activityDate: '2026-08-01',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '4',
  provenance: { sourceIndex: 0 },
};

function activity(override: Partial<BrokerActivityInput> = {}) {
  return brokerActivitySchema.parse({ ...baseActivity, ...override });
}

describe('reconstructOptionPositions', () => {
  it('runs eligibility, ordering, and directional FIFO replay through one API', () => {
    const result = reconstructOptionPositions([
      activity({
        id: 'close',
        activityDate: '2026-08-02',
        side: 'sell',
        price: '5',
        provenance: { sourceIndex: 1 },
      }),
      activity({ id: 'open', quantity: '2', provenance: { sourceIndex: 0 } }),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.positions[0]?.status).toBe('long');
    expect(result.positions[0]?.openQuantity.toString()).toBe('1');
    expect(result.openLots).toHaveLength(1);
    expect(result.matches[0]?.grossRealizedPnl.toString()).toBe('100');
    expect(result.lifecycles[0]?.status).toBe('open');
  });

  it('omits fully consumed lots from the top-level open-lot view', () => {
    const result = reconstructOptionPositions([
      activity({ id: 'open' }),
      activity({
        id: 'close',
        activityDate: '2026-08-02',
        side: 'sell',
        provenance: { sourceIndex: 1 },
      }),
    ]);

    expect(result.openLots).toEqual([]);
    expect(result.positions[0]?.lots).toHaveLength(1);
    expect(result.positions[0]?.status).toBe('flat');
    expect(result.lifecycles[0]?.status).toBe('closed');
  });

  it('combines eligibility and reversal diagnostics in deterministic pipeline order', () => {
    const result = reconstructOptionPositions([
      activity({ id: 'incomplete', side: undefined }),
      activity({
        id: 'open',
        activityDate: '2026-08-02',
        provenance: { sourceIndex: 1 },
      }),
      activity({
        id: 'reversal',
        activityDate: '2026-08-03',
        side: 'sell',
        quantity: '2',
        provenance: { sourceIndex: 2 },
      }),
    ]);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'INCOMPLETE_TRADE_ACTIVITY',
      'OPTION_POSITION_REVERSAL_NOT_SUPPORTED',
    ]);
  });

  it('ignores non-trade activity and diagnoses non-option trades', () => {
    const result = reconstructOptionPositions([
      activity({
        id: 'dividend',
        activityType: 'dividend',
        side: undefined,
        quantity: undefined,
        price: undefined,
      }),
      activity({
        id: 'equity',
        instrument: { assetType: 'equity', symbol: 'AAPL' },
        provenance: { sourceIndex: 1 },
      }),
    ]);

    expect(result.positions).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'UNSUPPORTED_ASSET_TYPE',
    ]);
  });

  it('produces identical output for identical input without mutating it', () => {
    const input = [
      activity({ id: 'open', side: 'sell', quantity: '2' }),
      activity({
        id: 'close',
        activityDate: '2026-08-02',
        side: 'buy',
        provenance: { sourceIndex: 1 },
      }),
    ];
    const originalIds = input.map((item) => item.id);

    expect(reconstructOptionPositions(input)).toEqual(reconstructOptionPositions(input));
    expect(input.map((item) => item.id)).toEqual(originalIds);
  });
});
