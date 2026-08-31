import {
  brokerActivitySchema,
  type BrokerActivity,
  type BrokerActivityInput,
  type ExecutionSide,
} from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from './reconstruct-option-positions.js';

interface ExpectedMatch {
  readonly openingActivityId: string;
  readonly closingActivityId: string;
  readonly quantity: string;
}

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 22_695_477) + 1) >>> 0;
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
  let direction: 'long' | 'short' | undefined;
  let inventory = 0;
  let totalOpened = 0;
  let totalClosed = 0;

  function add(side: ExecutionSide, quantity: number, index: number): void {
    const id = `option-${seed}-${index}`;
    inputs.push({
      id,
      broker: 'generated',
      accountId: `account-${seed % 2}`,
      activityType: 'trade',
      instrument: {
        assetType: 'option',
        underlying: 'AAPL',
        expiration: '2026-09-18',
        strike: '200',
        optionType: 'call',
        multiplier: 100,
      },
      activityDate: '2026-08-03',
      timestampPrecision: 'date',
      side,
      quantity: quantity.toString(),
      price: ((next() % 50) + 1).toString(),
      provenance: { sourceIndex: index },
    });

    const openingSide =
      direction === undefined ||
      (direction === 'long' && side === 'buy') ||
      (direction === 'short' && side === 'sell');
    if (openingSide) {
      if (direction === undefined) direction = side === 'buy' ? 'long' : 'short';
      inventory += quantity;
      totalOpened += quantity;
      fifo.push({ id, remaining: quantity });
      return;
    }

    inventory -= quantity;
    totalClosed += quantity;
    let remainingClose = quantity;
    while (remainingClose > 0) {
      const lot = fifo[0]!;
      const matched = Math.min(lot.remaining, remainingClose);
      expectedMatches.push({
        openingActivityId: lot.id,
        closingActivityId: id,
        quantity: matched.toString(),
      });
      lot.remaining -= matched;
      remainingClose -= matched;
      if (lot.remaining === 0) fifo.shift();
    }
    if (inventory === 0) direction = undefined;
  }

  for (let index = 0; index < 36; index += 1) {
    if (direction === undefined) {
      add(next() % 2 === 0 ? 'buy' : 'sell', (next() % 4) + 1, index);
      continue;
    }
    const shouldAdd = next() % 3 !== 0;
    const side = direction === 'long' ? (shouldAdd ? 'buy' : 'sell') : shouldAdd ? 'sell' : 'buy';
    const quantity = shouldAdd ? (next() % 4) + 1 : (next() % inventory) + 1;
    add(side, quantity, index);
  }

  if (direction !== undefined) {
    add(direction === 'long' ? 'sell' : 'buy', inventory, inputs.length);
  }

  return { inputs, expectedMatches, totalOpened, totalClosed };
}

function parse(inputs: readonly BrokerActivityInput[]): BrokerActivity[] {
  return inputs.map((input) => brokerActivitySchema.parse(input));
}

describe('generated option reconstruction invariants', () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    'conserves directional FIFO ownership for deterministic seed %i',
    (seed) => {
      const generated = generatedCase(seed);
      const result = reconstructOptionPositions(parse(generated.inputs));
      const position = result.positions[0]!;

      expect(result.diagnostics).toEqual([]);
      expect(result.positions).toHaveLength(1);
      expect(position.status).toBe('flat');
      expect(position.openQuantity.isZero()).toBe(true);
      expect(result.openLots).toEqual([]);
      expect(position.lifecycles.length).toBeGreaterThan(0);
      expect(position.lifecycles.every((lifecycle) => lifecycle.status === 'closed')).toBe(true);
      expect(
        sum(position.lots.map((lot) => lot.originalQuantity)).equals(generated.totalOpened),
      ).toBe(true);
      expect(
        sum(position.matches.map((match) => match.matchedQuantity)).equals(generated.totalClosed),
      ).toBe(true);
      expect(sum(position.lots.map((lot) => lot.remainingQuantity)).isZero()).toBe(true);
      expect(
        position.matches.map((match) => ({
          openingActivityId: match.openingActivityId,
          closingActivityId: match.closingActivityId,
          quantity: match.matchedQuantity.toString(),
        })),
      ).toEqual(generated.expectedMatches);

      const reorderedCopy = parse([...generated.inputs].reverse());
      expect(reconstructOptionPositions(reorderedCopy)).toEqual(result);
    },
  );
});
