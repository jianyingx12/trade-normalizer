import {
  brokerActivitySchema,
  tradeSchema,
  type BrokerActivity,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructEquityPositions } from '../equity-reconstruction/reconstruct-equity-positions.js';
import type { EquityPositionLifecycle } from '../equity-reconstruction/types.js';
import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { reconstructVerticalSpreads } from '../vertical-spreads/reconstruct-vertical-spreads.js';
import { buildCanonicalTrades } from './build-canonical-trades.js';

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
  instrument: BrokerActivityInput['instrument'],
  side: 'buy' | 'sell',
  quantity: string,
  price: string | undefined,
  sourceIndex: number,
  override: Partial<BrokerActivityInput> = {},
): BrokerActivity {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    accountId: 'account-1',
    activityType: 'trade',
    instrument,
    activityDate: '2026-08-03',
    timestampPrecision: 'date',
    side,
    quantity,
    price,
    provenance: { sourceIndex },
    ...override,
  });
}

function build(equities: readonly BrokerActivity[], options: readonly BrokerActivity[]) {
  const equityReconstruction = reconstructEquityPositions(equities);
  const optionReconstruction = reconstructOptionPositions(options);
  const verticalSpreadReconstruction = reconstructVerticalSpreads(optionReconstruction);
  return {
    equityReconstruction,
    optionReconstruction,
    verticalSpreadReconstruction,
    result: buildCanonicalTrades({
      equityReconstruction,
      optionReconstruction,
      verticalSpreadReconstruction,
    }),
  };
}

describe('buildCanonicalTrades', () => {
  it('builds schema-valid Trades for a mixed equity, single-option, and spread portfolio', () => {
    const equity = [
      activity('aapl-open', { assetType: 'equity', symbol: 'AAPL' }, 'buy', '2', '10', 0),
      activity('aapl-close', { assetType: 'equity', symbol: 'AAPL' }, 'sell', '2', '12', 1, {
        activityDate: '2026-08-04',
      }),
    ];
    const options = [
      activity('spread-lower', baseOption, 'buy', '1', '4', 2, {
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
      activity('spread-higher', { ...baseOption, strike: '185' }, 'sell', '1', '2', 3, {
        timestamp: '2026-08-03T14:30:00.000Z',
        timestampPrecision: 'datetime',
      }),
      activity(
        'single-put',
        { ...baseOption, underlying: 'TSLA', optionType: 'put', strike: '200' },
        'buy',
        '1',
        '5',
        4,
      ),
    ];

    const { result } = build(equity, options);

    expect(result.trades.map((trade) => trade.strategy).sort()).toEqual([
      'bull_call_spread',
      'equity_long',
      'long_put',
    ]);
    expect(result.trades.every((trade) => tradeSchema.safeParse(trade).success)).toBe(true);
    expect(result.trades.every((trade) => !('unrealizedPnl' in trade))).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.unpromoted).toEqual([]);
  });

  it('conserves partial spread ownership without double-producing option quantity', () => {
    const lower = activity('lower', baseOption, 'buy', '3', '4', 0, {
      timestamp: '2026-08-03T14:30:00.000Z',
      timestampPrecision: 'datetime',
    });
    const higher = activity('higher', { ...baseOption, strike: '185' }, 'sell', '1', '2', 1, {
      timestamp: '2026-08-03T14:30:00.000Z',
      timestampPrecision: 'datetime',
    });

    const { result } = build([], [lower, higher]);
    const spread = result.trades.find((trade) => trade.strategy === 'bull_call_spread')!;
    const single = result.trades.find((trade) => trade.strategy === 'long_call')!;

    expect(result.trades).toHaveLength(2);
    expect(spread.legs.map((leg) => leg.quantity.toString())).toEqual(['1', '1']);
    expect(single.legs[0]?.quantity.toString()).toBe('2');
    expect(new Set(result.trades.flatMap((trade) => trade.legs.map((leg) => leg.id))).size).toBe(3);
    expect(result.unpromoted).toEqual([]);
  });

  it('deduplicates diagnostics propagated through reconstruction stages', () => {
    const incompleteOption = activity('missing-price', baseOption, 'buy', '1', undefined, 0);

    const { result } = build([], [incompleteOption]);

    expect(
      result.diagnostics.filter((item) => item.code === 'INCOMPLETE_TRADE_ACTIVITY'),
    ).toHaveLength(1);
    expect(result.trades).toEqual([]);
  });

  it('preserves ambiguity diagnostics while safely producing only ungrouped single legs', () => {
    const exact = {
      timestamp: '2026-08-03T14:30:00.000Z',
      timestampPrecision: 'datetime' as const,
    };
    const options = [
      activity('long', baseOption, 'buy', '2', '4', 0, exact),
      activity('short-185', { ...baseOption, strike: '185' }, 'sell', '1', '2', 1, exact),
      activity('short-190', { ...baseOption, strike: '190' }, 'sell', '1', '1', 2, exact),
    ];

    const { result } = build([], options);

    expect(result.diagnostics.some((item) => item.code === 'AMBIGUOUS_STRATEGY_MATCH')).toBe(true);
    expect(result.trades.map((trade) => trade.strategy).sort()).toEqual([
      'long_call',
      'short_call',
      'short_call',
    ]);
    expect(result.unpromoted).toEqual([]);
  });

  it('keeps safe equity output but blocks all option promotion when ownership is inconsistent', () => {
    const equity = activity(
      'equity-open',
      { assetType: 'equity', symbol: 'AAPL' },
      'buy',
      '1',
      '10',
      0,
    );
    const assembled = build([equity], [activity('option-open', baseOption, 'buy', '1', '4', 1)]);
    const result = buildCanonicalTrades({
      equityReconstruction: assembled.equityReconstruction,
      optionReconstruction: assembled.optionReconstruction,
      verticalSpreadReconstruction: {
        ...assembled.verticalSpreadReconstruction,
        ungrouped: [],
      },
    });

    expect(result.trades.map((trade) => trade.strategy)).toEqual(['equity_long']);
    expect(result.diagnostics.some((item) => item.code === 'INCONSISTENT_TRADE_OWNERSHIP')).toBe(
      true,
    );
    expect(result.unpromoted).toMatchObject([
      { kind: 'option_ownership', reason: 'inconsistent_ownership' },
    ]);
  });

  it('reports an isolated promotion failure without suppressing another valid lifecycle', () => {
    const assembled = build(
      [
        activity('aapl-open', { assetType: 'equity', symbol: 'AAPL' }, 'buy', '1', '10', 0),
        activity('aapl-close', { assetType: 'equity', symbol: 'AAPL' }, 'sell', '1', '11', 1),
        activity('msft-open', { assetType: 'equity', symbol: 'MSFT' }, 'buy', '1', '20', 2),
      ],
      [],
    );
    const lifecycles = assembled.equityReconstruction.lifecycles.map((lifecycle) =>
      lifecycle.instrument.symbol === 'AAPL'
        ? ({ ...lifecycle, closedOn: undefined } as unknown as EquityPositionLifecycle)
        : lifecycle,
    );

    const result = buildCanonicalTrades({
      equityReconstruction: { ...assembled.equityReconstruction, lifecycles },
      optionReconstruction: assembled.optionReconstruction,
      verticalSpreadReconstruction: assembled.verticalSpreadReconstruction,
    });

    expect(result.trades.map((trade) => trade.underlying)).toEqual(['MSFT']);
    expect(result.diagnostics.some((item) => item.code === 'TRADE_PROMOTION_FAILED')).toBe(true);
    expect(result.unpromoted).toMatchObject([
      { kind: 'equity_lifecycle', reason: 'promotion_failed' },
    ]);
  });

  it('is deterministic when reconstruction collections are reordered', () => {
    const assembled = build(
      [
        activity('msft', { assetType: 'equity', symbol: 'MSFT' }, 'buy', '1', '20', 0),
        activity('aapl', { assetType: 'equity', symbol: 'AAPL' }, 'buy', '1', '10', 1),
      ],
      [activity('option', baseOption, 'buy', '1', '4', 2)],
    );
    const reordered = buildCanonicalTrades({
      equityReconstruction: {
        ...assembled.equityReconstruction,
        lifecycles: [...assembled.equityReconstruction.lifecycles].reverse(),
      },
      optionReconstruction: {
        ...assembled.optionReconstruction,
        lifecycles: [...assembled.optionReconstruction.lifecycles].reverse(),
      },
      verticalSpreadReconstruction: {
        ...assembled.verticalSpreadReconstruction,
        spreads: [...assembled.verticalSpreadReconstruction.spreads].reverse(),
        ungrouped: [...assembled.verticalSpreadReconstruction.ungrouped].reverse(),
      },
    });

    expect(reordered).toEqual(assembled.result);
  });
});
