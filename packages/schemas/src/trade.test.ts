import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { diagnosticSchema, tradeSchema, tradeTimingSchema, warningSchema } from './index.js';

const validTrade = {
  id: 'trade_001',
  broker: 'test-broker',
  accountId: 'account-1',
  underlying: 'NVDA',
  assetType: 'option',
  strategy: 'bull_call_spread',
  status: 'closed',
  opened: {
    date: '2026-08-20',
    timestamp: '2026-08-20T14:31:00.000Z',
    precision: 'datetime',
  },
  closed: {
    date: '2026-08-20',
    timestamp: '2026-08-20T18:04:00.000Z',
    precision: 'datetime',
  },
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
      openQuantity: '0',
      lifecycleIds: ['option-lifecycle-1'],
      openingActivityIds: ['activity_001'],
      closingActivityIds: ['activity_003'],
      executionIds: ['execution_001', 'execution_003'],
      grossRealizedPnl: '50',
      fees: '1.3',
      netRealizedPnl: '48.7',
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
      openQuantity: '0',
      lifecycleIds: ['option-lifecycle-2'],
      openingActivityIds: ['activity_002'],
      closingActivityIds: ['activity_004'],
      executionIds: ['execution_002', 'execution_004'],
      grossRealizedPnl: '30',
      fees: '1.3',
      netRealizedPnl: '28.7',
    },
  ],
  grossRealizedPnl: '80',
  fees: '2.6',
  netRealizedPnl: '77.4',
  strategyInference: {
    level: 'strong',
    correlation: 'datetime',
    openingTimeDistanceMs: 0,
    candidateId: 'vertical-candidate-1',
  },
};

describe('trade timing schema', () => {
  it('preserves honest date-only timing without a timestamp', () => {
    expect(tradeTimingSchema.parse({ date: '2026-08-20', precision: 'date' })).toEqual({
      date: '2026-08-20',
      precision: 'date',
    });
  });

  it('requires timestamp presence to match declared precision', () => {
    expect(
      tradeTimingSchema.safeParse({
        date: '2026-08-20',
        timestamp: '2026-08-20T00:00:00.000Z',
        precision: 'date',
      }).success,
    ).toBe(false);
    expect(tradeTimingSchema.safeParse({ date: '2026-08-20', precision: 'datetime' }).success).toBe(
      false,
    );
  });
});

describe('trade schema', () => {
  it('validates activity-owned logical trades with optional execution references', () => {
    const withoutExecutions = {
      ...validTrade,
      legs: validTrade.legs.map((leg) => ({ ...leg, executionIds: undefined })),
    };
    const trade = tradeSchema.parse(withoutExecutions);

    expect(trade.legs.every((leg) => leg.executionIds.length === 0)).toBe(true);
    expect(trade.netRealizedPnl).toBeInstanceOf(Decimal);
    expect(trade.strategyInference?.level).toBe('strong');
  });

  it('supports a partially closed trade without final closed timing', () => {
    const partial = tradeSchema.parse({
      ...validTrade,
      status: 'partially_closed',
      closed: undefined,
      legs: validTrade.legs.map((leg) => ({ ...leg, openQuantity: '0.5' })),
    });

    expect(partial.status).toBe('partially_closed');
    expect(partial.closed).toBeUndefined();
  });

  it('requires final timing only for a fully closed trade', () => {
    expect(tradeSchema.safeParse({ ...validTrade, closed: undefined }).success).toBe(false);
    expect(
      tradeSchema.safeParse({ ...validTrade, status: 'open', closed: validTrade.closed }).success,
    ).toBe(false);
  });

  it('validates leg quantity, identity, and ownership references', () => {
    const firstLeg = validTrade.legs[0]!;
    expect(
      tradeSchema.safeParse({
        ...validTrade,
        legs: [{ ...firstLeg, openQuantity: '2' }, validTrade.legs[1]],
      }).success,
    ).toBe(false);
    expect(
      tradeSchema.safeParse({
        ...validTrade,
        legs: [{ ...firstLeg, openingActivityIds: [] }, validTrade.legs[1]],
      }).success,
    ).toBe(false);
    expect(
      tradeSchema.safeParse({
        ...validTrade,
        legs: [
          {
            ...firstLeg,
            instrument: { ...firstLeg.instrument, underlying: 'AAPL' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('enforces P&L and known-fee conservation', () => {
    expect(tradeSchema.safeParse({ ...validTrade, grossRealizedPnl: '81' }).success).toBe(false);
    expect(tradeSchema.safeParse({ ...validTrade, fees: undefined }).success).toBe(false);
    expect(tradeSchema.safeParse({ ...validTrade, netRealizedPnl: '78' }).success).toBe(false);
  });

  it('preserves unknown fees instead of treating them as zero', () => {
    const trade = tradeSchema.parse({
      ...validTrade,
      fees: undefined,
      netRealizedPnl: undefined,
      legs: validTrade.legs.map((leg) => ({
        ...leg,
        fees: undefined,
        netRealizedPnl: undefined,
      })),
    });

    expect(trade.fees).toBeUndefined();
    expect(trade.netRealizedPnl).toBeUndefined();
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
