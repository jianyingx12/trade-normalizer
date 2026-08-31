import { resolve } from 'node:path';

import type { Trade } from '@trade-normalizer/core';
import { describe, expect, it } from 'vitest';

import { normalizeBrokerFile } from './normalize-broker-source.js';

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
});
