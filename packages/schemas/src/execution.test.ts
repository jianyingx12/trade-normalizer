import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { executionSchema, feeBreakdownSchema } from './index.js';

const validFees = {
  commission: '0.50',
  regulatory: '0.03',
  contract: '0.65',
  other: '0',
  total: '1.18',
};

describe('fee breakdown schema', () => {
  it('validates non-negative components with an exact total', () => {
    const fees = feeBreakdownSchema.parse(validFees);

    expect(fees.total).toBeInstanceOf(Decimal);
    expect(fees.total.equals('1.18')).toBe(true);
  });

  it('rejects negative components and mismatched totals', () => {
    expect(
      feeBreakdownSchema.safeParse({ ...validFees, commission: '-0.50', total: '0.18' }).success,
    ).toBe(false);
    expect(feeBreakdownSchema.safeParse({ ...validFees, total: '1.19' }).success).toBe(false);
  });
});

describe('execution schema', () => {
  const validExecution = {
    id: 'execution_001',
    broker: 'robinhood',
    accountId: 'account_001',
    instrument: {
      assetType: 'equity',
      symbol: 'AAPL',
    },
    side: 'buy',
    quantity: '10',
    price: '186.70',
    fees: validFees,
    executedAt: '2026-08-20T14:31:00.000Z',
    provenance: {
      brokerTransactionId: 'broker-fill-123',
      sourceFile: 'trades.csv',
      sourceIndex: 4,
      sourceRow: 6,
      rawReference: 'row-6',
    },
  };

  it('validates a fill and defaults an unknown position effect', () => {
    const execution = executionSchema.parse(validExecution);

    expect(execution.positionEffect).toBe('unknown');
    expect(execution.quantity.equals('10')).toBe(true);
    expect(execution.price.equals('186.70')).toBe(true);
    expect(execution.provenance.sourceIndex).toBe(4);
  });

  it('rejects floating-point quantities and non-UTC timestamps', () => {
    expect(executionSchema.safeParse({ ...validExecution, quantity: 0.1 }).success).toBe(false);
    expect(
      executionSchema.safeParse({
        ...validExecution,
        executedAt: '2026-08-20T10:31:00-04:00',
      }).success,
    ).toBe(false);
  });

  it('rejects broker-specific fields outside provenance', () => {
    expect(
      executionSchema.safeParse({
        ...validExecution,
        robinhoodOrderState: 'filled',
      }).success,
    ).toBe(false);
  });
});
