import {
  brokerActivitySchema,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { allocateVerticalSpreadOwnership } from './allocate-ownership.js';
import { generateVerticalSpreadCandidates } from './generate-candidates.js';

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
  strike: string,
  side: 'buy' | 'sell',
  quantity: string,
  sourceIndex: number,
  override: Partial<BrokerActivityInput> = {},
) {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    accountId: 'account-1',
    activityType: 'trade',
    instrument: { ...baseOption, strike },
    activityDate: '2026-08-03',
    timestamp: '2026-08-03T14:30:00.000Z',
    timestampPrecision: 'datetime',
    side,
    quantity,
    price: '4',
    provenance: { sourceIndex },
    ...override,
  });
}

function allocate(activities: readonly ReturnType<typeof activity>[]) {
  const reconstruction = reconstructOptionPositions(activities);
  const candidates = generateVerticalSpreadCandidates(reconstruction);
  return allocateVerticalSpreadOwnership(reconstruction, candidates);
}

function ownershipAtStrike(result: ReturnType<typeof allocate>, strike: string) {
  return result.lotOwnership.find((ownership) => ownership.instrument.strike.eq(strike))!;
}

describe('allocateVerticalSpreadOwnership', () => {
  it('allocates an unambiguous equal-quantity pair completely', () => {
    const result = allocate([
      activity('long-180', '180', 'buy', '2', 0),
      activity('short-185', '185', 'sell', '2', 1),
    ]);

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.quantity.toString()).toBe('2');
    expect(result.lotOwnership.map((lot) => lot.ungroupedQuantity.toString())).toEqual(['0', '0']);
    expect(result.diagnostics).toEqual([]);
  });

  it('allocates the shared minimum and preserves a long-leg remainder', () => {
    const result = allocate([
      activity('long-180', '180', 'buy', '4', 0),
      activity('short-185', '185', 'sell', '2', 1),
    ]);

    expect(result.allocations[0]?.quantity.toString()).toBe('2');
    expect(ownershipAtStrike(result, '180').ungroupedQuantity.toString()).toBe('2');
    expect(ownershipAtStrike(result, '185').ungroupedQuantity.toString()).toBe('0');
  });

  it('preserves a short-leg remainder', () => {
    const result = allocate([
      activity('long-180', '180', 'buy', '2', 0),
      activity('short-185', '185', 'sell', '4', 1),
    ]);

    expect(result.allocations[0]?.quantity.toString()).toBe('2');
    expect(ownershipAtStrike(result, '180').ungroupedQuantity.toString()).toBe('0');
    expect(ownershipAtStrike(result, '185').ungroupedQuantity.toString()).toBe('2');
  });

  it('preserves exact fractional quantity ownership', () => {
    const result = allocate([
      activity('long-180', '180', 'buy', '1.25', 0),
      activity('short-185', '185', 'sell', '0.75', 1),
    ]);

    expect(result.allocations[0]?.quantity.toString()).toBe('0.75');
    expect(ownershipAtStrike(result, '180').ungroupedQuantity.toString()).toBe('0.5');
  });

  it('leaves a single option lot wholly ungrouped without a diagnostic', () => {
    const result = allocate([activity('long-180', '180', 'buy', '1', 0)]);

    expect(result.allocations).toEqual([]);
    expect(result.lotOwnership[0]?.allocatedQuantity.toString()).toBe('0');
    expect(result.lotOwnership[0]?.ungroupedQuantity.toString()).toBe('1');
    expect(result.diagnostics).toEqual([]);
  });

  it('does not resolve competing candidates with stable IDs', () => {
    const result = allocate([
      activity('long-180', '180', 'buy', '2', 0),
      activity('short-185', '185', 'sell', '1', 1),
      activity('short-190', '190', 'sell', '1', 2),
    ]);

    expect(result.allocations).toEqual([]);
    expect(result.lotOwnership.every((lot) => lot.allocatedQuantity.isZero())).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'AMBIGUOUS_STRATEGY_MATCH',
      sourceIndexes: [0, 1, 2],
      details: {
        lotIds: expect.arrayContaining([
          expect.stringContaining('long-180'),
          expect.stringContaining('short-185'),
          expect.stringContaining('short-190'),
        ]),
      },
    });
  });

  it('allocates independent candidates separately', () => {
    const result = allocate([
      activity('first-long', '180', 'buy', '1', 0),
      activity('first-short', '185', 'sell', '1', 1),
      activity('second-long', '190', 'buy', '2', 2, {
        timestamp: '2026-08-03T15:30:00.000Z',
      }),
      activity('second-short', '195', 'sell', '2', 3, {
        timestamp: '2026-08-03T15:30:00.000Z',
      }),
    ]);

    expect(result.allocations.map((allocation) => allocation.quantity.toString())).toEqual([
      '1',
      '2',
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('conserves every lot quantity', () => {
    const result = allocate([
      activity('long-180', '180', 'buy', '3.5', 0),
      activity('short-185', '185', 'sell', '2.25', 1),
    ]);

    for (const ownership of result.lotOwnership) {
      expect(
        ownership.allocatedQuantity
          .plus(ownership.ungroupedQuantity)
          .equals(ownership.totalQuantity),
      ).toBe(true);
      expect(ownership.allocatedQuantity.lte(ownership.totalQuantity)).toBe(true);
    }
  });

  it('is deterministic when candidate input order changes', () => {
    const reconstruction = reconstructOptionPositions([
      activity('long-180', '180', 'buy', '2', 0),
      activity('short-185', '185', 'sell', '1', 1),
      activity('short-190', '190', 'sell', '1', 2),
    ]);
    const candidates = generateVerticalSpreadCandidates(reconstruction);

    expect(allocateVerticalSpreadOwnership(reconstruction, candidates)).toEqual(
      allocateVerticalSpreadOwnership(reconstruction, [...candidates].reverse()),
    );
  });
});
