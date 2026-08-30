import {
  brokerActivitySchema,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { reconstructVerticalSpreads } from './reconstruct-vertical-spreads.js';

const baseOption: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function activity(
  id: string,
  strike: string,
  side: 'buy' | 'sell',
  quantity: string,
  sourceIndex: number,
  override: Partial<BrokerActivityInput> = {},
) {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    accountId: 'account-1',
    activityType: 'trade',
    instrument: { ...baseOption, strike },
    activityDate: '2026-08-03',
    timestamp: '2026-08-03T14:30:00.000Z',
    timestampPrecision: 'datetime',
    side,
    quantity,
    price: '4',
    provenance: { sourceIndex },
    ...override,
  });
}

function reconstruct(
  activities: readonly ReturnType<typeof activity>[],
  datetimeGroupingWindowMs?: number,
) {
  return reconstructVerticalSpreads(
    reconstructOptionPositions(activities),
    datetimeGroupingWindowMs === undefined ? {} : { datetimeGroupingWindowMs },
  );
}

describe('reconstructVerticalSpreads', () => {
  it('returns reconstructed spreads and only positive ungrouped ownership', () => {
    const result = reconstruct([
      activity('long-180', '180', 'buy', '4', 0),
      activity('short-185', '185', 'sell', '2', 1),
    ]);

    expect(result.spreads).toHaveLength(1);
    expect(result.spreads[0]?.strategy).toBe('bull_call_spread');
    expect(result.spreads[0]?.quantity.toString()).toBe('2');
    expect(result.ungrouped).toHaveLength(1);
    expect(result.ungrouped[0]?.instrument.strike.toString()).toBe('180');
    expect(result.ungrouped[0]?.ungroupedQuantity.toString()).toBe('2');
    expect(result.diagnostics).toEqual([]);
  });

  it('returns ambiguous ownership ungrouped instead of choosing a spread', () => {
    const result = reconstruct([
      activity('long-180', '180', 'buy', '2', 0),
      activity('short-185', '185', 'sell', '1', 1),
      activity('short-190', '190', 'sell', '1', 2),
    ]);

    expect(result.spreads).toEqual([]);
    expect(result.ungrouped).toHaveLength(3);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'AMBIGUOUS_STRATEGY_MATCH',
    ]);
  });

  it('applies the configured confirmed-datetime correlation window', () => {
    const activities = [
      activity('long-180', '180', 'buy', '1', 0),
      activity('short-185', '185', 'sell', '1', 1, {
        timestamp: '2026-08-03T14:30:00.250Z',
      }),
    ];

    expect(reconstruct(activities).spreads).toEqual([]);
    expect(reconstruct(activities, 250).spreads).toHaveLength(1);
  });

  it('keeps independent zero-to-zero spread lifecycles separate', () => {
    const result = reconstruct([
      activity('first-long-open', '180', 'buy', '1', 0),
      activity('first-short-open', '185', 'sell', '1', 1),
      activity('first-long-close', '180', 'sell', '1', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T14:30:00.000Z',
      }),
      activity('first-short-close', '185', 'buy', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T14:30:00.000Z',
      }),
      activity('second-long-open', '180', 'buy', '2', 4, {
        activityDate: '2026-08-05',
        timestamp: '2026-08-05T14:30:00.000Z',
      }),
      activity('second-short-open', '185', 'sell', '2', 5, {
        activityDate: '2026-08-05',
        timestamp: '2026-08-05T14:30:00.000Z',
      }),
    ]);

    expect(result.spreads).toHaveLength(2);
    expect(result.spreads.map((spread) => spread.status)).toEqual(['closed', 'open']);
    expect(result.spreads.map((spread) => spread.quantity.toString())).toEqual(['1', '2']);
  });

  it('preserves Phase 6 diagnostics in the high-level result', () => {
    const incomplete = activity('incomplete', '180', 'buy', '1', 0, { price: undefined });
    const result = reconstructVerticalSpreads(reconstructOptionPositions([incomplete]));

    expect(result.spreads).toEqual([]);
    expect(result.ungrouped).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'INCOMPLETE_TRADE_ACTIVITY',
    ]);
  });
});
