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
    executionTime: {
      precision: 'utc_datetime',
      timestamp: '2026-08-20T14:31:00.000Z',
    },
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
    expect(execution.executionTime).toEqual({
      precision: 'utc_datetime',
      timestamp: '2026-08-20T14:31:00.000Z',
    });
    expect(execution.provenance.sourceIndex).toBe(4);
  });

  it('accepts a source-local datetime without fabricating UTC', () => {
    const execution = executionSchema.parse({
      ...validExecution,
      executionTime: {
        precision: 'local_datetime',
        localDateTime: '2026-08-20T10:31:00',
      },
    });

    expect(execution.executionTime).toEqual({
      precision: 'local_datetime',
      localDateTime: '2026-08-20T10:31:00',
    });
  });

  it('accepts execution evidence with date-only precision', () => {
    const execution = executionSchema.parse({
      ...validExecution,
      executionTime: {
        precision: 'date',
        date: '2026-08-20',
      },
    });

    expect(execution.executionTime).toEqual({ precision: 'date', date: '2026-08-20' });
  });

  it('preserves currency and signed commission without inventing a fee breakdown', () => {
    const execution = executionSchema.parse({
      ...validExecution,
      currency: 'CAD',
      reportedCommission: {
        amount: '0.20',
        currency: 'USD',
        effect: 'rebate',
      },
      fees: undefined,
    });

    expect(execution.currency).toBe('CAD');
    expect(execution.reportedCommission?.amount.equals('0.20')).toBe(true);
    expect(execution.reportedCommission?.currency).toBe('USD');
    expect(execution.reportedCommission?.effect).toBe('rebate');
    expect(execution.fees).toBeUndefined();
  });

  it('rejects floating-point quantities and invalid timing variants', () => {
    expect(executionSchema.safeParse({ ...validExecution, quantity: 0.1 }).success).toBe(false);
    expect(
      executionSchema.safeParse({
        ...validExecution,
        executionTime: {
          precision: 'utc_datetime',
          timestamp: '2026-08-20T10:31:00-04:00',
        },
      }).success,
    ).toBe(false);
    expect(
      executionSchema.safeParse({
        ...validExecution,
        executionTime: {
          precision: 'local_datetime',
          localDateTime: '2026-08-20T10:31:00Z',
        },
      }).success,
    ).toBe(false);
    expect(
      executionSchema.safeParse({
        ...validExecution,
        executionTime: {
          precision: 'date',
          date: '2026-08-20',
          timestamp: '2026-08-20T00:00:00.000Z',
        },
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
