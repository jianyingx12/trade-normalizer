import {
  brokerActivitySchema,
  tradeSchema,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { reconstructVerticalSpreads } from '../vertical-spreads/reconstruct-vertical-spreads.js';
import { promoteVerticalSpreadTrades } from './promote-vertical-spreads.js';

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
  strike: string,
  optionType: 'call' | 'put',
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
    instrument: { ...baseOption, strike, optionType },
    activityDate: '2026-08-03',
    timestamp: '2026-08-03T14:30:00.000Z',
    timestampPrecision: 'datetime',
    side,
    quantity,
    price,
    provenance: { sourceIndex },
    ...override,
  });
}

function pipeline(activities: readonly ReturnType<typeof activity>[]) {
  const options = reconstructOptionPositions(activities);
  const verticals = reconstructVerticalSpreads(options);
  return { verticals, trades: promoteVerticalSpreadTrades(verticals) };
}

describe('promoteVerticalSpreadTrades', () => {
  it.each([
    ['bull call', 'call', 'buy', 'sell', 'bull_call_spread', 'long', 'short'],
    ['bear call', 'call', 'sell', 'buy', 'bear_call_spread', 'short', 'long'],
    ['bull put', 'put', 'buy', 'sell', 'bull_put_spread', 'long', 'short'],
    ['bear put', 'put', 'sell', 'buy', 'bear_put_spread', 'short', 'long'],
  ] as const)(
    'promotes an open %s without reclassifying it',
    (_name, optionType, lowerSide, higherSide, strategy, lowerDirection, higherDirection) => {
      const result = pipeline([
        activity('lower-open', '180', optionType, lowerSide, '2', '4', 0),
        activity('higher-open', '185', optionType, higherSide, '2', '2', 1),
      ]);
      const trade = result.trades[0]!;

      expect(result.trades).toHaveLength(1);
      expect(trade.strategy).toBe(strategy);
      expect(trade.status).toBe('open');
      expect(trade.legs).toHaveLength(2);
      expect(trade.legs.map((leg) => leg.direction)).toEqual([lowerDirection, higherDirection]);
      expect(trade.legs.map((leg) => leg.quantity.toString())).toEqual(['2', '2']);
      expect(tradeSchema.safeParse(trade).success).toBe(true);
    },
  );

  it('preserves strong structural inference evidence and activity ownership', () => {
    const result = pipeline([
      activity('lower-open', '180', 'call', 'buy', '1', '4', 0),
      activity('higher-open', '185', 'call', 'sell', '1', '2', 1),
    ]);
    const trade = result.trades[0]!;

    expect(trade.strategyInference).toEqual({
      level: 'strong',
      correlation: 'datetime',
      openingTimeDistanceMs: 0,
      candidateId: result.verticals.spreads[0]?.candidateId,
    });
    expect(trade.legs.map((leg) => leg.openingActivityIds)).toEqual([
      ['lower-open'],
      ['higher-open'],
    ]);
    expect(trade.legs.every((leg) => leg.executionIds.length === 0)).toBe(true);
  });

  it('maps partial paired closure without final closed timing', () => {
    const result = pipeline([
      activity('lower-open', '180', 'call', 'buy', '2', '4', 0),
      activity('higher-open', '185', 'call', 'sell', '2', '2', 1),
      activity('lower-close', '180', 'call', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
      activity('higher-close', '185', 'call', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
      }),
    ]);
    const trade = result.trades[0]!;

    expect(trade.status).toBe('partially_closed');
    expect(trade.closed).toBeUndefined();
    expect(trade.legs.map((leg) => leg.openQuantity.toString())).toEqual(['1', '1']);
    expect(trade.legs.map((leg) => leg.closingActivityIds)).toEqual([
      ['lower-close'],
      ['higher-close'],
    ]);
  });

  it('maps fully closed timing and existing spread accounting', () => {
    const result = pipeline([
      activity('lower-open', '180', 'call', 'buy', '1', '4', 0, { fees: fees('0.4') }),
      activity('higher-open', '185', 'call', 'sell', '1', '2', 1, { fees: fees('0.2') }),
      activity('lower-close', '180', 'call', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
        fees: fees('0.3'),
      }),
      activity('higher-close', '185', 'call', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
        fees: fees('0.1'),
      }),
    ]);
    const spread = result.verticals.spreads[0]!;
    const trade = result.trades[0]!;

    expect(trade.status).toBe('closed');
    expect(trade.closed).toEqual({
      date: '2026-08-04',
      timestamp: '2026-08-04T15:00:01.000Z',
      precision: 'datetime',
    });
    expect(trade.grossRealizedPnl.equals(spread.grossRealizedPnl)).toBe(true);
    expect(trade.fees?.equals(spread.realizedFees!)).toBe(true);
    expect(trade.netRealizedPnl?.equals(spread.netRealizedPnl!)).toBe(true);
    expect(trade.legs[0]?.grossRealizedPnl.equals(spread.lowerStrikeLeg.grossRealizedPnl)).toBe(
      true,
    );
    expect(trade.legs[1]?.grossRealizedPnl.equals(spread.higherStrikeLeg.grossRealizedPnl)).toBe(
      true,
    );
  });

  it('keeps aggregate fees and net P&L unknown when one leg lacks fee evidence', () => {
    const result = pipeline([
      activity('lower-open', '180', 'call', 'buy', '1', '4', 0),
      activity('higher-open', '185', 'call', 'sell', '1', '2', 1, { fees: fees('0') }),
      activity('lower-close', '180', 'call', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: undefined,
        timestampPrecision: 'date',
      }),
      activity('higher-close', '185', 'call', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: undefined,
        timestampPrecision: 'date',
        fees: fees('0'),
      }),
    ]);
    const trade = result.trades[0]!;

    expect(trade.grossRealizedPnl.toString()).toBe('300');
    expect(trade.fees).toBeUndefined();
    expect(trade.netRealizedPnl).toBeUndefined();
    expect(trade.legs[0]?.fees).toBeUndefined();
    expect(trade.legs[1]?.fees?.isZero()).toBe(true);
  });

  it('produces deterministic identity independent of spread output ordering', () => {
    const result = pipeline([
      activity('lower-open', '180', 'call', 'buy', '1', '4', 0),
      activity('higher-open', '185', 'call', 'sell', '1', '2', 1),
    ]);

    expect(promoteVerticalSpreadTrades(result.verticals)).toEqual(
      promoteVerticalSpreadTrades({ spreads: [...result.verticals.spreads].reverse() }),
    );
  });
});
