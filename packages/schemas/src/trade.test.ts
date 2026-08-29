import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { diagnosticSchema, tradeSchema, warningSchema } from './index.js';

const validTrade = {
  id: 'trade_001',
  underlying: 'NVDA',
  assetType: 'option',
  strategy: 'bull_call_spread',
  status: 'closed',
  openedAt: '2026-08-20T14:31:00.000Z',
  closedAt: '2026-08-20T18:04:00.000Z',
  legs: [
    {
      id: 'leg_001',
      instrument: {
        assetType: 'option',
        underlying: 'NVDA',
        expiration: '2026-09-18',
        strike: '180',
        optionType: 'call',
        multiplier: 100,
      },
      direction: 'long',
      quantity: '1',
      executionIds: ['execution_001', 'execution_003'],
    },
    {
      id: 'leg_002',
      instrument: {
        assetType: 'option',
        underlying: 'NVDA',
        expiration: '2026-09-18',
        strike: '185',
        optionType: 'call',
        multiplier: 100,
      },
      direction: 'short',
      quantity: '1',
      executionIds: ['execution_002', 'execution_004'],
    },
  ],
  fees: {
    commission: '1.00',
    regulatory: '0.10',
    contract: '1.50',
    other: '0',
    total: '2.60',
  },
  grossPnl: '80.00',
  realizedPnl: '77.40',
};

describe('trade schema', () => {
  it('validates a closed logical trade independently of strategy inference', () => {
    const trade = tradeSchema.parse(validTrade);

    expect(trade.legs).toHaveLength(2);
    expect(trade.realizedPnl).toBeInstanceOf(Decimal);
    expect(trade.realizedPnl?.equals('77.40')).toBe(true);
    expect(trade.warnings).toEqual([]);
  });

  it('requires lifecycle timestamps and consistent leg identity', () => {
    expect(tradeSchema.safeParse({ ...validTrade, closedAt: undefined }).success).toBe(false);
    expect(
      tradeSchema.safeParse({
        ...validTrade,
        legs: [
          {
            ...validTrade.legs[0],
            instrument: {
              ...validTrade.legs[0]?.instrument,
              underlying: 'AAPL',
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('diagnostic schemas', () => {
  it('validates a warning with a stable machine-readable code', () => {
    const warning = warningSchema.parse({
      severity: 'warning',
      code: 'AMBIGUOUS_STRATEGY_MATCH',
      message: 'Two open trades are compatible with this closing fill.',
      executionIds: ['execution_004'],
      candidateIds: ['trade_001', 'trade_002'],
      details: { matchingRule: 'same_contract' },
    });

    expect(warning.code).toBe('AMBIGUOUS_STRATEGY_MATCH');
    expect(warning.sourceIndexes).toEqual([]);
  });

  it('rejects unknown diagnostic codes and validates errors separately', () => {
    expect(
      warningSchema.safeParse({
        severity: 'warning',
        code: 'SOMETHING_HAPPENED',
        message: 'Unstable code',
      }).success,
    ).toBe(false);

    expect(
      diagnosticSchema.safeParse({
        severity: 'error',
        code: 'MISSING_TIMESTAMP',
        message: 'The execution timestamp is required.',
      }).success,
    ).toBe(true);
  });
});
