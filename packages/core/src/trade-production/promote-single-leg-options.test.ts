import {
  brokerActivitySchema,
  tradeSchema,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { reconstructVerticalSpreads } from '../vertical-spreads/reconstruct-vertical-spreads.js';
import { promoteSingleLegOptionTrades } from './promote-single-leg-options.js';

const baseOption: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function fees(total: string): NonNullable<BrokerActivityInput['fees']> {
  return { commission: total, regulatory: '0', contract: '0', other: '0', total };
}

function activity(
  id: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  sourceIndex: number,
  override: Partial<BrokerActivityInput> = {},
) {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    accountId: 'account-1',
    activityType: 'trade',
    instrument: baseOption,
    activityDate: '2026-08-03',
    timestampPrecision: 'date',
    side,
    quantity,
    price,
    provenance: { sourceIndex },
    ...override,
  });
}

function pipeline(activities: readonly ReturnType<typeof activity>[]) {
  const optionReconstruction = reconstructOptionPositions(activities);
  const verticalReconstruction = reconstructVerticalSpreads(optionReconstruction);
  return {
    optionReconstruction,
    verticalReconstruction,
    trades: promoteSingleLegOptionTrades(optionReconstruction, verticalReconstruction),
  };
}

describe('promoteSingleLegOptionTrades', () => {
  it.each([
    ['long call', 'call', 'buy', 'sell', 'long_call', 'long'],
    ['long put', 'put', 'buy', 'sell', 'long_put', 'long'],
    ['short call', 'call', 'sell', 'buy', 'short_call', 'short'],
    ['short put', 'put', 'sell', 'buy', 'short_put', 'short'],
  ] as const)(
    'promotes a closed %s',
    (_name, optionType, openingSide, closingSide, strategy, direction) => {
      const result = pipeline([
        activity('open', openingSide, '1', '4', 0, {
          instrument: { ...baseOption, optionType },
        }),
        activity('close', closingSide, '1', '6', 1, {
          activityDate: '2026-08-04',
          instrument: { ...baseOption, optionType },
        }),
      ]);
      const trade = result.trades[0]!;

      expect(result.trades).toHaveLength(1);
      expect(trade.strategy).toBe(strategy);
      expect(trade.status).toBe('closed');
      expect(trade.legs[0]?.direction).toBe(direction);
      expect(trade.legs[0]?.quantity.toString()).toBe('1');
      expect(trade.legs[0]?.openQuantity.isZero()).toBe(true);
      expect(trade.legs[0]?.executionIds).toEqual([]);
      expect(tradeSchema.safeParse(trade).success).toBe(true);
    },
  );

  it('promotes open and partially closed single-leg ownership', () => {
    const open = pipeline([activity('open', 'buy', '2', '4', 0)]).trades[0]!;
    const partial = pipeline([
      activity('open', 'buy', '2', '4', 0),
      activity('partial-close', 'sell', '1', '5', 1),
    ]).trades[0]!;

    expect(open.status).toBe('open');
    expect(open.legs[0]?.openQuantity.toString()).toBe('2');
    expect(partial.status).toBe('partially_closed');
    expect(partial.legs[0]?.openQuantity.toString()).toBe('1');
    expect(partial.closed).toBeUndefined();
    expect(partial.grossRealizedPnl.toString()).toBe('100');
  });

  it('preserves date-only and confirmed datetime timing without fabrication', () => {
    const dateOnly = pipeline([
      activity('date-open', 'buy', '1', '4', 0),
      activity('date-close', 'sell', '1', '5', 1, { activityDate: '2026-08-04' }),
    ]).trades[0]!;
    const datetime = pipeline([
      activity('time-open', 'buy', '1', '4', 0, {
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
      activity('time-close', 'sell', '1', '5', 1, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
    ]).trades[0]!;

    expect(dateOnly.opened).toEqual({ date: '2026-08-03', precision: 'date' });
    expect(dateOnly.closed).toEqual({ date: '2026-08-04', precision: 'date' });
    expect(datetime.opened.timestamp).toBe('2026-08-03T14:30:00.000Z');
    expect(datetime.closed?.timestamp).toBe('2026-08-04T15:30:00.000Z');
  });

  it('promotes only leftover quantity after spread ownership', () => {
    const result = pipeline([
      activity('long-lower', 'buy', '3', '4', 0, {
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
      activity('short-higher', 'sell', '1', '2', 1, {
        instrument: { ...baseOption, strike: '185' },
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
    ]);

    expect(result.verticalReconstruction.spreads[0]?.quantity.toString()).toBe('1');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.strategy).toBe('long_call');
    expect(result.trades[0]?.legs[0]?.quantity.toString()).toBe('2');
    expect(result.trades[0]?.legs[0]?.openingActivityIds).toEqual(['long-lower']);
  });

  it('conserves quantity, P&L, and recurring Decimal fee allocation with a spread', () => {
    const result = pipeline([
      activity('long-lower', 'buy', '3', '4', 0, {
        fees: fees('0.3'),
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
      activity('short-higher', 'sell', '1', '2', 1, {
        instrument: { ...baseOption, strike: '185' },
        fees: fees('0.1'),
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
      activity('close-lower', 'sell', '3', '6', 2, {
        activityDate: '2026-08-04',
        fees: fees('0.3'),
      }),
      activity('close-higher', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        instrument: { ...baseOption, strike: '185' },
        fees: fees('0.1'),
      }),
    ]);
    const spread = result.verticalReconstruction.spreads[0]!;
    const single = result.trades[0]!;
    const reconstructedGross = result.optionReconstruction.matches.reduce(
      (total, match) => total.plus(match.grossRealizedPnl),
      new Decimal(0),
    );
    const reconstructedFees = result.optionReconstruction.matches.reduce(
      (total, match) => total.plus(match.openingFees ?? 0).plus(match.closingFees ?? 0),
      new Decimal(0),
    );

    expect(spread.quantity.plus(single.legs[0]!.quantity).toString()).toBe('3');
    expect(spread.grossRealizedPnl.plus(single.grossRealizedPnl).equals(reconstructedGross)).toBe(
      true,
    );
    expect(spread.realizedFees?.plus(single.fees ?? 0).equals(reconstructedFees)).toBe(true);
    expect(spread.netRealizedPnl?.plus(single.netRealizedPnl ?? 0).toString()).toBe('699.2');
  });

  it('keeps missing fees and net P&L unknown', () => {
    const trade = pipeline([
      activity('open', 'buy', '1', '4', 0),
      activity('close', 'sell', '1', '5', 1, { fees: fees('0') }),
    ]).trades[0]!;

    expect(trade.grossRealizedPnl.toString()).toBe('100');
    expect(trade.fees).toBeUndefined();
    expect(trade.netRealizedPnl).toBeUndefined();
  });

  it('keeps separate zero-to-zero lifecycles and deterministic output identity', () => {
    const result = pipeline([
      activity('first-open', 'buy', '1', '4', 0),
      activity('first-close', 'sell', '1', '5', 1, { activityDate: '2026-08-04' }),
      activity('second-open', 'sell', '1', '3', 2, { activityDate: '2026-08-05' }),
    ]);
    const repeated = promoteSingleLegOptionTrades(
      { lifecycles: [...result.optionReconstruction.lifecycles].reverse() },
      result.verticalReconstruction,
    );

    expect(result.trades).toEqual(repeated);
    expect(result.trades).toHaveLength(2);
    expect(new Set(result.trades.map((trade) => trade.id)).size).toBe(2);
    expect(result.trades.map((trade) => trade.strategy).sort()).toEqual([
      'long_call',
      'short_call',
    ]);
  });

  it('rejects inconsistent ownership instead of double-promoting quantity', () => {
    const result = pipeline([activity('open', 'buy', '2', '4', 0)]);
    const ownership = result.verticalReconstruction.ungrouped[0]!;

    expect(() =>
      promoteSingleLegOptionTrades(result.optionReconstruction, {
        ungrouped: [
          {
            ...ownership,
            allocatedQuantity: ownership.allocatedQuantity.plus(1),
          },
        ],
      }),
    ).toThrow('Inconsistent ungrouped option ownership');
  });
});
