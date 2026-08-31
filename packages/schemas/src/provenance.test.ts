import { describe, expect, it } from 'vitest';

import { sourceProvenanceSchema } from './index.js';

describe('source provenance schema', () => {
  it('preserves multiple broker references in isolated metadata', () => {
    const provenance = sourceProvenanceSchema.parse({
      brokerTransactionId: 'exec-123',
      brokerReferences: {
        executionId: 'exec-123',
        tradeId: 'trade-456',
        originalTradeId: 'trade-100',
        orderId: 'order-789',
        orderReference: 'strategy-alpha',
        instrumentId: 'broker-instrument-42',
      },
      brokerMetadata: {
        exchange: 'NASDAQ',
        isApiOrder: 'true',
      },
      sourceIndex: 2,
    });

    expect(provenance.brokerReferences).toEqual({
      executionId: 'exec-123',
      tradeId: 'trade-456',
      originalTradeId: 'trade-100',
      orderId: 'order-789',
      orderReference: 'strategy-alpha',
      instrumentId: 'broker-instrument-42',
    });
    expect(provenance.brokerMetadata).toEqual({
      exchange: 'NASDAQ',
      isApiOrder: 'true',
    });
  });

  it.each([
    ['an empty reference map', {}],
    ['an invalid reference key', { 'IBKR Exec ID': 'exec-123' }],
    ['an empty reference value', { executionId: ' ' }],
  ])('rejects %s', (_label, brokerReferences) => {
    expect(
      sourceProvenanceSchema.safeParse({
        brokerReferences,
        sourceIndex: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects an unbounded reference collection', () => {
    const brokerReferences = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`reference${index}`, `value-${index}`]),
    );

    expect(sourceProvenanceSchema.safeParse({ brokerReferences, sourceIndex: 0 }).success).toBe(
      false,
    );
  });
});
