import { brokerActivitySchema, type BrokerActivityInput } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { prepareEquityActivities } from './prepare-activities.js';
import { replayEquityActivities } from './replay-activities.js';

const baseActivity: BrokerActivityInput = {
  id: 'activity-base',
  broker: 'test-broker',
  accountId: 'account-1',
  activityType: 'trade',
  instrument: { assetType: 'equity', symbol: 'AAPL' },
  activityDate: '2026-08-03',
  timestampPrecision: 'date',
  side: 'buy',
  quantity: '1',
  price: '100',
  provenance: { sourceIndex: 0 },
};

function prepared(overrides: readonly Partial<BrokerActivityInput>[]) {
  const activities = overrides.map((override, index) =>
    brokerActivitySchema.parse({
      ...baseActivity,
      id: `activity-${index}`,
      provenance: { sourceIndex: index },
      ...override,
    }),
  );

  return prepareEquityActivities(activities).activities;
}

function decimalStrings(values: readonly Decimal[]): string[] {
  return values.map((value) => value.toString());
}

describe('replayEquityActivities', () => {
  it('creates a distinct open FIFO lot for each buy', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'buy-1', quantity: '2', price: '100' },
        { id: 'buy-2', quantity: '3', price: '110' },
      ]),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]?.openQuantity.toString()).toBe('5');
    expect(result.positions[0]?.remainingCostBasis.toString()).toBe('530');
    expect(result.positions[0]?.lots.map((lot) => lot.openingActivityId)).toEqual([
      'buy-1',
      'buy-2',
    ]);
  });

  it('partially closes a lot and calculates gross realized P&L', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'buy', quantity: '2.5', price: '10.20' },
        { id: 'sell', side: 'sell', quantity: '1.25', price: '12.40' },
      ]),
    );
    const position = result.positions[0];
    const match = result.matches[0];

    expect(position?.openQuantity.toString()).toBe('1.25');
    expect(position?.remainingCostBasis.toString()).toBe('12.75');
    expect(position?.grossRealizedPnl.toString()).toBe('2.75');
    expect(match).toMatchObject({ openingActivityId: 'buy', closingActivityId: 'sell' });
    expect(match?.matchedQuantity.toString()).toBe('1.25');
    expect(match?.entryCostBasis.toString()).toBe('12.75');
    expect(match?.exitProceeds.toString()).toBe('15.5');
  });

  it('consumes the oldest lots first when one sell spans multiple buys', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'buy-old', quantity: '2', price: '10' },
        { id: 'buy-new', quantity: '3', price: '20' },
        { id: 'sell', side: 'sell', quantity: '4', price: '30' },
      ]),
    );

    expect(result.matches.map((match) => match.openingActivityId)).toEqual(['buy-old', 'buy-new']);
    expect(decimalStrings(result.matches.map((match) => match.matchedQuantity))).toEqual([
      '2',
      '2',
    ]);
    expect(
      decimalStrings(result.positions[0]?.lots.map((lot) => lot.remainingQuantity) ?? []),
    ).toEqual(['0', '1']);
    expect(result.positions[0]?.grossRealizedPnl.toString()).toBe('60');
  });

  it('supports multiple sells and reaches exact Decimal zero on full close', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'buy', quantity: '0.3', price: '10' },
        { id: 'sell-1', side: 'sell', quantity: '0.1', price: '11' },
        { id: 'sell-2', side: 'sell', quantity: '0.2', price: '12' },
      ]),
    );

    expect(result.matches).toHaveLength(2);
    expect(result.positions[0]?.openQuantity.isZero()).toBe(true);
    expect(result.positions[0]?.remainingCostBasis.isZero()).toBe(true);
    expect(result.positions[0]?.grossRealizedPnl.toString()).toBe('0.5');
  });

  it('isolates positions by symbol and account', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'aapl-account-1', quantity: '2' },
        {
          id: 'msft-account-1',
          instrument: { assetType: 'equity', symbol: 'MSFT' },
          quantity: '3',
        },
        { id: 'aapl-account-2', accountId: 'account-2', quantity: '4' },
      ]),
    );

    expect(result.positions.map((position) => position.key)).toEqual([
      { broker: 'test-broker', accountId: 'account-1', symbol: 'AAPL' },
      { broker: 'test-broker', accountId: 'account-1', symbol: 'MSFT' },
      { broker: 'test-broker', accountId: 'account-2', symbol: 'AAPL' },
    ]);
  });

  it('diagnoses a sell without an open position and creates no inventory', () => {
    const result = replayEquityActivities(prepared([{ id: 'sell', side: 'sell', quantity: '1' }]));

    expect(result.positions).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('SELL_WITHOUT_OPEN_POSITION');
  });

  it('rejects an oversell atomically and leaves the open lot unchanged', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'buy', quantity: '2', price: '10' },
        { id: 'oversell', side: 'sell', quantity: '3', price: '20' },
      ]),
    );

    expect(result.diagnostics[0]?.code).toBe('NEGATIVE_POSITION');
    expect(result.diagnostics[0]?.details).toMatchObject({
      activityId: 'oversell',
      sellQuantity: '3',
      availableQuantity: '2',
    });
    expect(result.matches).toEqual([]);
    expect(result.positions[0]?.openQuantity.toString()).toBe('2');
    expect(result.positions[0]?.grossRealizedPnl.isZero()).toBe(true);
  });

  it('preserves quantity and cost conservation across FIFO matches', () => {
    const result = replayEquityActivities(
      prepared([
        { id: 'buy-1', quantity: '1.25', price: '8' },
        { id: 'buy-2', quantity: '2.75', price: '12' },
        { id: 'sell', side: 'sell', quantity: '3.5', price: '15' },
      ]),
    );
    const position = result.positions[0];
    const boughtQuantity = new Decimal('4');
    const matchedQuantity = result.matches.reduce(
      (total, match) => total.plus(match.matchedQuantity),
      new Decimal(0),
    );
    const originalCost = new Decimal('43');
    const matchedCost = result.matches.reduce(
      (total, match) => total.plus(match.entryCostBasis),
      new Decimal(0),
    );

    expect(matchedQuantity.plus(position?.openQuantity ?? 0).equals(boughtQuantity)).toBe(true);
    expect(matchedCost.plus(position?.remainingCostBasis ?? 0).equals(originalCost)).toBe(true);
  });
});
