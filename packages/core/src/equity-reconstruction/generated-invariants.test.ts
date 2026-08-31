import {
  brokerActivitySchema,
  type BrokerActivity,
  type BrokerActivityInput,
} from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { reconstructEquityPositions } from './reconstruct-equity-positions.js';

interface ExpectedMatch {
  readonly openingActivityId: string;
  readonly closingActivityId: string;
  readonly quantity: string;
}

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

function generatedCase(seed: number) {
  const next = generator(seed);
  const inputs: BrokerActivityInput[] = [];
  const fifo: { id: string; remaining: number }[] = [];
  const expectedMatches: ExpectedMatch[] = [];
  let inventory = 0;
  let totalBought = 0;
  let totalSold = 0;

  for (let index = 0; index < 48; index += 1) {
    const shouldBuy = inventory === 0 || next() % 3 !== 0;
    const quantity = shouldBuy ? (next() % 5) + 1 : (next() % inventory) + 1;
    const id = `equity-${seed}-${index}`;
    const side = shouldBuy ? 'buy' : 'sell';
    inputs.push({
      id,
      broker: 'generated',
      accountId: `account-${seed % 3}`,
      activityType: 'trade',
      instrument: { assetType: 'equity', symbol: 'AAPL' },
      activityDate: '2026-08-03',
      timestampPrecision: 'date',
      side,
      quantity: quantity.toString(),
      price: ((next() % 200) + 1).toString(),
      provenance: { sourceIndex: index },
    });

    if (shouldBuy) {
      inventory += quantity;
      totalBought += quantity;
      fifo.push({ id, remaining: quantity });
      continue;
    }

    inventory -= quantity;
    totalSold += quantity;
    let remainingSell = quantity;
    while (remainingSell > 0) {
      const lot = fifo[0]!;
      const matched = Math.min(lot.remaining, remainingSell);
      expectedMatches.push({
        openingActivityId: lot.id,
        closingActivityId: id,
        quantity: matched.toString(),
      });
      lot.remaining -= matched;
      remainingSell -= matched;
      if (lot.remaining === 0) fifo.shift();
    }
  }

  return { inputs, expectedMatches, inventory, totalBought, totalSold };
}

function parse(inputs: readonly BrokerActivityInput[]): BrokerActivity[] {
  return inputs.map((input) => brokerActivitySchema.parse(input));
}

describe('generated equity reconstruction invariants', () => {
  it.each(Array.from({ length: 16 }, (_, index) => index + 1))(
    'conserves quantity and FIFO ownership for deterministic seed %i',
    (seed) => {
      const generated = generatedCase(seed);
      const activities = parse(generated.inputs);
      const result = reconstructEquityPositions(activities);
      const position = result.positions[0]!;

      expect(result.diagnostics).toEqual([]);
      expect(result.positions).toHaveLength(1);
      expect(
        sum(position.lots.map((lot) => lot.originalQuantity)).equals(generated.totalBought),
      ).toBe(true);
      expect(
        sum(position.matches.map((match) => match.matchedQuantity)).equals(generated.totalSold),
      ).toBe(true);
      expect(
        sum(position.lots.map((lot) => lot.remainingQuantity)).equals(position.openQuantity),
      ).toBe(true);
      expect(position.openQuantity.equals(generated.inventory)).toBe(true);
      expect(
        sum(result.openLots.map((lot) => lot.remainingQuantity)).equals(generated.inventory),
      ).toBe(true);
      expect(
        position.matches.map((match) => ({
          openingActivityId: match.openingActivityId,
          closingActivityId: match.closingActivityId,
          quantity: match.matchedQuantity.toString(),
        })),
      ).toEqual(generated.expectedMatches);

      const reorderedCopy = parse([...generated.inputs].reverse());
      expect(reconstructEquityPositions(reorderedCopy)).toEqual(result);
    },
  );
});
