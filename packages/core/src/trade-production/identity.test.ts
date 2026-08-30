import { optionInstrumentSchema } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_TRADE_ID_VERSION,
  createCanonicalTradeId,
  createCanonicalTradeLegId,
  type TradeIdentityInput,
  type TradeIdentityLegInput,
} from './identity.js';

const lowerLeg: TradeIdentityLegInput = {
  instrument: optionInstrumentSchema.parse({
    assetType: 'option',
    underlying: 'NVDA',
    expiration: '2026-09-18',
    strike: '180.000',
    optionType: 'call',
    multiplier: 100,
  }),
  direction: 'long',
  quantity: new Decimal('2.00'),
  lifecycleIds: ['option-lifecycle:second', 'option-lifecycle:first'],
  openingActivityIds: ['option-open-2', 'option-open-1'],
};

const higherLeg: TradeIdentityLegInput = {
  instrument: optionInstrumentSchema.parse({
    assetType: 'option',
    underlying: 'NVDA',
    expiration: '2026-09-18',
    strike: '185',
    optionType: 'call',
    multiplier: 100,
  }),
  direction: 'short',
  quantity: new Decimal(1),
  lifecycleIds: ['option-lifecycle:short'],
  openingActivityIds: ['option-open-short'],
};

function identity(override: Partial<TradeIdentityInput> = {}): TradeIdentityInput {
  return {
    broker: 'test-broker',
    accountId: 'account-1',
    strategy: 'bull_call_spread',
    legs: [lowerLeg, higherLeg],
    ...override,
  };
}

describe('canonical trade identity', () => {
  it('is stable across leg and ownership-reference ordering', () => {
    const reorderedLower = {
      ...lowerLeg,
      lifecycleIds: [...lowerLeg.lifecycleIds].reverse(),
      openingActivityIds: [...lowerLeg.openingActivityIds].reverse(),
    };

    expect(createCanonicalTradeId(identity())).toBe(
      createCanonicalTradeId(identity({ legs: [higherLeg, reorderedLower] })),
    );
  });

  it.each([
    ['account', { accountId: 'account-2' }],
    ['strategy', { strategy: 'bear_call_spread' as const }],
    [
      'lifecycle ownership',
      { legs: [{ ...lowerLeg, lifecycleIds: ['option-lifecycle:third'] }, higherLeg] },
    ],
    ['quantity ownership', { legs: [{ ...lowerLeg, quantity: new Decimal(3) }, higherLeg] }],
  ])('changes when %s changes', (_name, override) => {
    expect(createCanonicalTradeId(identity(override))).not.toBe(createCanonicalTradeId(identity()));
  });

  it('canonicalizes Decimal scale and excludes source ordering', () => {
    expect(createCanonicalTradeId(identity())).toBe(
      createCanonicalTradeId(
        identity({ legs: [{ ...lowerLeg, quantity: new Decimal('2') }, higherLeg] }),
      ),
    );
  });

  it('creates deterministic, trade-scoped leg IDs within canonical ID length', () => {
    const tradeId = createCanonicalTradeId(identity());
    const first = createCanonicalTradeLegId(tradeId, lowerLeg);

    expect(CANONICAL_TRADE_ID_VERSION).toBe('v1');
    expect(createCanonicalTradeLegId(tradeId, lowerLeg)).toBe(first);
    expect(createCanonicalTradeLegId(tradeId, higherLeg)).not.toBe(first);
    expect(tradeId.length).toBeLessThanOrEqual(256);
    expect(first.length).toBeLessThanOrEqual(256);
  });
});
