import { resolve } from 'node:path';

import { IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS } from '@trade-normalizer/adapter-ibkr';
import { ROBINHOOD_ACTIVITY_HEADERS } from '@trade-normalizer/adapter-robinhood';
import type { Trade } from '@trade-normalizer/core';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { normalizeBrokerFile, normalizeBrokerSource } from './normalize-broker-source.js';

interface EconomicTradeView {
  readonly underlying: string;
  readonly assetType: Trade['assetType'];
  readonly strategy: Trade['strategy'];
  readonly status: Trade['status'];
  readonly grossRealizedPnl: string;
  readonly legs: readonly {
    readonly instrument: string;
    readonly direction: string;
    readonly quantity: string;
    readonly openQuantity: string;
    readonly grossRealizedPnl: string;
  }[];
}

function economicView(trade: Trade): EconomicTradeView {
  return {
    underlying: trade.underlying,
    assetType: trade.assetType,
    strategy: trade.strategy,
    status: trade.status,
    grossRealizedPnl: trade.grossRealizedPnl.toString(),
    legs: trade.legs.map((leg) => ({
      instrument:
        leg.instrument.assetType === 'equity'
          ? leg.instrument.symbol
          : `${leg.instrument.underlying}:${leg.instrument.expiration}:${leg.instrument.strike}:${leg.instrument.optionType}`,
      direction: leg.direction,
      quantity: leg.quantity.toString(),
      openQuantity: leg.openQuantity.toString(),
      grossRealizedPnl: leg.grossRealizedPnl.toString(),
    })),
  };
}

interface EconomicActivity {
  readonly side: 'buy' | 'sell';
  readonly quantity: string;
  readonly price: string;
}

function csvLine(values: readonly string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}

function robinhoodSource(activities: readonly EconomicActivity[]): string {
  const rows = activities.map((activity, index) => {
    const amount = new Decimal(activity.quantity).times(activity.price).toFixed(2);
    const displayedAmount = activity.side === 'buy' ? `($${amount})` : `$${amount}`;
    const day = 3 + index;
    return csvLine([
      `8/${day}/2026`,
      `8/${day}/2026`,
      `8/${day + 2}/2026`,
      'AAPL',
      `Synthetic ${activity.side}`,
      activity.side === 'buy' ? 'Buy' : 'Sell',
      activity.quantity,
      `$${new Decimal(activity.price).toFixed(2)}`,
      displayedAmount,
    ]);
  });
  return [csvLine(ROBINHOOD_ACTIVITY_HEADERS), ...rows].join('\n');
}

function ibkrSource(name: string, activities: readonly EconomicActivity[]): string {
  const rows = activities.map((activity, index) => {
    const sequence = index + 1;
    return csvLine([
      `DU-${name.toUpperCase()}`,
      'USD',
      'STK',
      'AAPL',
      'APPLE INC',
      '100001',
      '',
      '',
      '',
      '',
      '',
      `202608${(3 + index).toString().padStart(2, '0')};09300${index}`,
      'NASDAQ',
      activity.side.toUpperCase(),
      activity.side === 'sell' ? `-${activity.quantity}` : activity.quantity,
      activity.price,
      `T-${name}-${sequence}`,
      `E-${name}-${sequence}`,
      '',
      `O-${name}-${sequence}`,
      '',
      'N',
      '',
      '',
    ]);
  });
  return [csvLine(IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS), ...rows].join('\n');
}

describe('cross-broker canonical economic equivalence', () => {
  it('normalizes equivalent Robinhood activity and IBKR executions into the same lifecycle economics', async () => {
    const robinhood = await normalizeBrokerFile({
      filePath: resolve('fixtures/cross-broker/equivalent-equity-robinhood.csv'),
      broker: 'robinhood',
    });
    const ibkr = await normalizeBrokerFile({
      filePath: resolve('fixtures/cross-broker/equivalent-equity-ibkr.csv'),
      broker: 'ibkr',
    });

    expect(robinhood.trades).toHaveLength(1);
    expect(ibkr.trades).toHaveLength(1);
    expect(economicView(ibkr.trades[0]!)).toEqual(economicView(robinhood.trades[0]!));
    expect(economicView(ibkr.trades[0]!)).toEqual({
      underlying: 'AAPL',
      assetType: 'equity',
      strategy: 'equity_long',
      status: 'closed',
      grossRealizedPnl: '295',
      legs: [
        {
          instrument: 'AAPL',
          direction: 'long',
          quantity: '15',
          openQuantity: '0',
          grossRealizedPnl: '295',
        },
      ],
    });

    expect(robinhood.summary).toMatchObject({
      sourceRecords: 4,
      executions: 0,
      activities: 4,
      trades: 1,
    });
    expect(ibkr.summary).toMatchObject({
      sourceRecords: 4,
      executions: 4,
      activities: 4,
      trades: 1,
    });
    expect(ibkr.trades[0]!.id).not.toBe(robinhood.trades[0]!.id);
    expect(ibkr.trades[0]!.broker).toBe('ibkr');
    expect(robinhood.trades[0]!.broker).toBe('robinhood');
  });

  it.each([
    [
      'simple-complete',
      [
        { side: 'buy', quantity: '10', price: '100' },
        { side: 'sell', quantity: '10', price: '110' },
      ],
      { status: 'closed', quantity: '10', openQuantity: '0', grossRealizedPnl: '100' },
    ],
    [
      'partial-close',
      [
        { side: 'buy', quantity: '10', price: '100' },
        { side: 'sell', quantity: '4', price: '120' },
      ],
      { status: 'partially_closed', quantity: '10', openQuantity: '6', grossRealizedPnl: '80' },
    ],
    [
      'fractional',
      [
        { side: 'buy', quantity: '1.5', price: '100' },
        { side: 'sell', quantity: '0.5', price: '110' },
      ],
      { status: 'partially_closed', quantity: '1.5', openQuantity: '1', grossRealizedPnl: '5' },
    ],
  ] as const)(
    'converges on %s lifecycle economics while preserving source evidence differences',
    (name, activities, expected) => {
      const robinhood = normalizeBrokerSource({
        source: robinhoodSource(activities),
        sourceFile: `${name}-robinhood.csv`,
        broker: 'robinhood',
      });
      const ibkr = normalizeBrokerSource({
        source: ibkrSource(name, activities),
        sourceFile: `${name}-ibkr.csv`,
        broker: 'ibkr',
      });
      const robinhoodTrade = robinhood.trades[0]!;
      const ibkrTrade = ibkr.trades[0]!;

      expect(robinhood.diagnostics).toEqual([]);
      expect(ibkr.diagnostics).toEqual([]);
      expect(robinhood.trades).toHaveLength(1);
      expect(ibkr.trades).toHaveLength(1);
      expect(economicView(ibkrTrade)).toEqual(economicView(robinhoodTrade));
      expect(economicView(ibkrTrade)).toMatchObject({
        underlying: 'AAPL',
        assetType: 'equity',
        strategy: 'equity_long',
        status: expected.status,
        grossRealizedPnl: expected.grossRealizedPnl,
        legs: [
          {
            quantity: expected.quantity,
            openQuantity: expected.openQuantity,
            grossRealizedPnl: expected.grossRealizedPnl,
          },
        ],
      });
      expect(robinhood.summary.executions).toBe(0);
      expect(ibkr.summary.executions).toBe(activities.length);
      expect(ibkrTrade.id).not.toBe(robinhoodTrade.id);

      expect(
        normalizeBrokerSource({
          source: ibkrSource(name, [...activities]),
          sourceFile: `${name}-ibkr.csv`,
          broker: 'ibkr',
        }),
      ).toEqual(ibkr);
    },
  );
});
