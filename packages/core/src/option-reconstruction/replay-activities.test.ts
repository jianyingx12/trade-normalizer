import {
  brokerActivitySchema,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { prepareOptionActivities } from './prepare-activities.js';
import { replayOptionActivities } from './replay-activities.js';

const baseInstrument: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'AAPL',
  expiration: '2026-09-18',
  strike: '200',
  optionType: 'call',
  multiplier: 100,
};

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  accountId: 'account-1',
  activityType: 'trade',
  instrument: baseInstrument,
  activityDate: '2026-08-03',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '4',
  provenance: { sourceIndex: 0 },
};

function instrument(override: Partial<OptionInstrumentInput> = {}): OptionInstrumentInput {
  return { ...baseInstrument, ...override };
}

function fees(total: string): NonNullable<BrokerActivityInput['fees']> {
  return {
    commission: total,
    regulatory: '0',
    contract: '0',
    other: '0',
    total,
  };
}

function prepared(overrides: readonly Partial<BrokerActivityInput>[]) {
  const activities = overrides.map((override, index) =>
    brokerActivitySchema.parse({
      ...baseActivity,
      id: `activity-${index}`,
      provenance: { sourceIndex: index },
      ...override,
    }),
  );
  return prepareOptionActivities(activities).activities;
}

function decimalStrings(values: readonly Decimal[]): string[] {
  return values.map((value) => value.toString());
}

describe('replayOptionActivities', () => {
  it('opens a long option lot with a buy', () => {
    const result = replayOptionActivities(prepared([{ id: 'long-open', quantity: '2' }]));
    const position = result.positions[0];

    expect(position?.status).toBe('long');
    expect(position?.openQuantity.toString()).toBe('2');
    expect(position?.lots[0]).toMatchObject({
      direction: 'long',
      openingActivityId: 'long-open',
    });
    expect(position?.remainingOpeningPremium.toString()).toBe('800');
  });

  it('opens a short option lot with a sell from flat', () => {
    const result = replayOptionActivities(
      prepared([{ id: 'short-open', side: 'sell', quantity: '3', price: '3.5' }]),
    );
    const position = result.positions[0];

    expect(position?.status).toBe('short');
    expect(position?.openQuantity.toString()).toBe('3');
    expect(position?.lots[0]?.direction).toBe('short');
    expect(position?.remainingOpeningPremium.toString()).toBe('1050');
  });

  it('matches multiple long lots FIFO and preserves a partial remainder', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'buy-1', side: 'buy', quantity: '2', price: '4' },
        { id: 'buy-2', side: 'buy', quantity: '1', price: '5' },
        { id: 'sell', side: 'sell', quantity: '2.5', price: '6' },
      ]),
    );
    const position = result.positions[0];

    expect(result.matches.map((match) => match.openingActivityId)).toEqual(['buy-1', 'buy-2']);
    expect(decimalStrings(result.matches.map((match) => match.matchedQuantity))).toEqual([
      '2',
      '0.5',
    ]);
    expect(decimalStrings(position?.lots.map((lot) => lot.remainingQuantity) ?? [])).toEqual([
      '0',
      '0.5',
    ]);
    expect(position?.openQuantity.toString()).toBe('0.5');
    expect(position?.remainingOpeningPremium.toString()).toBe('250');
    expect(position?.grossRealizedPnl.toString()).toBe('450');
  });

  it('matches multiple short lots FIFO and preserves a partial remainder', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'sell-1', side: 'sell', quantity: '2', price: '4' },
        { id: 'sell-2', side: 'sell', quantity: '1', price: '3.5' },
        { id: 'buy', side: 'buy', quantity: '2.5', price: '2' },
      ]),
    );
    const position = result.positions[0];

    expect(result.matches.map((match) => match.openingActivityId)).toEqual(['sell-1', 'sell-2']);
    expect(decimalStrings(result.matches.map((match) => match.matchedQuantity))).toEqual([
      '2',
      '0.5',
    ]);
    expect(position?.status).toBe('short');
    expect(position?.openQuantity.toString()).toBe('0.5');
    expect(position?.remainingOpeningPremium.toString()).toBe('175');
    expect(position?.grossRealizedPnl.toString()).toBe('475');
  });

  it.each([
    ['long', 'buy' as const, 'sell' as const, '4', '5.5'],
    ['short', 'sell' as const, 'buy' as const, '4', '2.5'],
  ])('calculates %s gross P&L with multiplier', (direction, openSide, closeSide, entry, exit) => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open', side: openSide, price: entry },
        { id: 'close', side: closeSide, price: exit },
      ]),
    );

    expect(result.matches[0]?.direction).toBe(direction);
    expect(result.matches[0]?.openingPremium.toString()).toBe('400');
    expect(result.matches[0]?.closingPremium.toString()).toBe(direction === 'long' ? '550' : '250');
    expect(result.matches[0]?.grossRealizedPnl.toString()).toBe('150');
    expect(result.positions[0]?.status).toBe('flat');
    expect(result.positions[0]?.openQuantity.isZero()).toBe(true);
  });

  it('uses an explicit non-100 multiplier in premium and P&L calculations', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open', instrument: instrument({ multiplier: 10 }), price: '4' },
        {
          id: 'close',
          instrument: instrument({ multiplier: 10 }),
          side: 'sell',
          price: '5.5',
        },
      ]),
    );

    expect(result.matches[0]?.openingPremium.toString()).toBe('40');
    expect(result.matches[0]?.closingPremium.toString()).toBe('55');
    expect(result.matches[0]?.grossRealizedPnl.toString()).toBe('15');
  });

  it('isolates exact contracts, accounts, and multipliers', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'call' },
        { id: 'put', instrument: instrument({ optionType: 'put' }) },
        { id: 'strike', instrument: instrument({ strike: '205' }) },
        { id: 'expiration', instrument: instrument({ expiration: '2026-10-16' }) },
        { id: 'multiplier', instrument: instrument({ multiplier: 10 }) },
        { id: 'account', accountId: 'account-2' },
      ]),
    );

    expect(result.positions).toHaveLength(6);
    expect(new Set(result.positions.map((position) => position.key.contractKey)).size).toBe(5);
  });

  it('rejects a long-to-short reversal atomically', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open', side: 'buy', quantity: '1' },
        { id: 'reverse', side: 'sell', quantity: '3', price: '5' },
      ]),
    );

    expect(result.diagnostics[0]?.code).toBe('OPTION_POSITION_REVERSAL_NOT_SUPPORTED');
    expect(result.matches).toEqual([]);
    expect(result.positions[0]?.status).toBe('long');
    expect(result.positions[0]?.openQuantity.toString()).toBe('1');
    expect(result.positions[0]?.grossRealizedPnl.isZero()).toBe(true);
  });

  it('rejects a short-to-long reversal atomically', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open', side: 'sell', quantity: '1' },
        { id: 'reverse', side: 'buy', quantity: '2', price: '2' },
      ]),
    );

    expect(result.diagnostics[0]?.code).toBe('OPTION_POSITION_REVERSAL_NOT_SUPPORTED');
    expect(result.matches).toEqual([]);
    expect(result.positions[0]?.status).toBe('short');
    expect(result.positions[0]?.openQuantity.toString()).toBe('1');
  });

  it('preserves explicit opening fee facts without multiplying them', () => {
    const result = replayOptionActivities(
      prepared([
        {
          id: 'open',
          fees: {
            commission: '0.5',
            regulatory: '0',
            contract: '0.1',
            other: '0',
            total: '0.6',
          },
        },
      ]),
    );

    expect(result.positions[0]?.lots[0]?.openingFees?.total.toString()).toBe('0.6');
  });

  it('conserves quantities and reaches exact Decimal zero on closure', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open-1', quantity: '0.3' },
        { id: 'open-2', quantity: '0.2' },
        { id: 'close', side: 'sell', quantity: '0.5', price: '5' },
      ]),
    );
    const position = result.positions[0]!;
    const openingQuantity = position.lots.reduce(
      (total, lot) => total.plus(lot.originalQuantity),
      new Decimal(0),
    );
    const matchedQuantity = position.matches.reduce(
      (total, match) => total.plus(match.matchedQuantity),
      new Decimal(0),
    );

    expect(matchedQuantity.plus(position.openQuantity).equals(openingQuantity)).toBe(true);
    expect(position.openQuantity.isZero()).toBe(true);
    expect(position.remainingOpeningPremium.isZero()).toBe(true);
    expect(position.status).toBe('flat');
  });

  it.each([
    ['long', 'buy' as const, 'sell' as const, '4', '6'],
    ['short', 'sell' as const, 'buy' as const, '6', '4'],
  ])(
    'allocates known fees and calculates %s net P&L',
    (_direction, openSide, closeSide, entry, exit) => {
      const result = replayOptionActivities(
        prepared([
          {
            id: 'open',
            side: openSide,
            quantity: '3',
            price: entry,
            fees: fees('0.30'),
          },
          {
            id: 'close',
            side: closeSide,
            quantity: '1',
            price: exit,
            fees: fees('0.10'),
          },
        ]),
      );
      const match = result.matches[0];
      const position = result.positions[0];

      expect(match?.openingFees?.toString()).toBe('0.1');
      expect(match?.closingFees?.toString()).toBe('0.1');
      expect(match?.grossRealizedPnl.toString()).toBe('200');
      expect(match?.netRealizedPnl?.toString()).toBe('199.8');
      expect(position?.remainingOpeningFees?.toString()).toBe('0.2');
      expect(position?.netRealizedPnl?.toString()).toBe('199.8');
    },
  );

  it('keeps net P&L unknown when either matched side has missing fees', () => {
    const missingOpening = replayOptionActivities(
      prepared([
        { id: 'open', price: '4' },
        { id: 'close', side: 'sell', price: '5', fees: fees('0') },
      ]),
    );
    const missingClosing = replayOptionActivities(
      prepared([
        { id: 'open', price: '4', fees: fees('0') },
        { id: 'close', side: 'sell', price: '5' },
      ]),
    );

    expect(missingOpening.matches[0]?.netRealizedPnl).toBeUndefined();
    expect(missingOpening.positions[0]?.netRealizedPnl).toBeUndefined();
    expect(missingClosing.matches[0]?.netRealizedPnl).toBeUndefined();
    expect(missingClosing.positions[0]?.netRealizedPnl).toBeUndefined();
  });

  it('distinguishes explicitly known zero fees from missing fees', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open', price: '4', fees: fees('0') },
        { id: 'close', side: 'sell', price: '5', fees: fees('0') },
      ]),
    );

    expect(result.matches[0]?.openingFees?.isZero()).toBe(true);
    expect(result.matches[0]?.closingFees?.isZero()).toBe(true);
    expect(result.matches[0]?.netRealizedPnl?.toString()).toBe('100');
  });

  it('conserves opening and closing fee totals across FIFO matches', () => {
    const result = replayOptionActivities(
      prepared([
        { id: 'open-1', quantity: '1', fees: fees('0.10') },
        { id: 'open-2', quantity: '2', fees: fees('0.20') },
        { id: 'close', side: 'sell', quantity: '3', price: '5', fees: fees('0.17') },
      ]),
    );
    const openingFees = result.matches.reduce(
      (total, match) => total.plus(match.openingFees ?? 0),
      new Decimal(0),
    );
    const closingFees = result.matches.reduce(
      (total, match) => total.plus(match.closingFees ?? 0),
      new Decimal(0),
    );

    expect(openingFees.toString()).toBe('0.3');
    expect(closingFees.toString()).toBe('0.17');
    expect(result.positions[0]?.remainingOpeningFees?.isZero()).toBe(true);
  });
});
