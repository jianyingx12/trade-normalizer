import { brokerActivitySchema, type BrokerActivity } from '@trade-normalizer/schemas';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { reconstructEquityPositions } from './reconstruct-equity-positions.js';

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'VOO'] as const;
const POSITION_COUNT = 20;

const EVEN_KEY_CYCLE = [
  ['buy', 10],
  ['buy', 5],
  ['sell', 6],
  ['sell', 9],
  ['buy', 3],
  ['sell', 1],
  ['buy', 4],
  ['sell', 6],
] as const;

const ODD_KEY_CYCLE = [
  ['buy', 8],
  ['sell', 3],
  ['buy', 2],
  ['sell', 7],
  ['buy', 4],
  ['sell', 1],
  ['sell', 3],
] as const;

function generateHistory(size: number): BrokerActivity[] {
  const stepsByPosition = Array.from({ length: POSITION_COUNT }, () => 0);

  return Array.from({ length: size }, (_, sourceIndex) => {
    const positionIndex = sourceIndex % POSITION_COUNT;
    const step = stepsByPosition[positionIndex]!;
    stepsByPosition[positionIndex] = step + 1;
    const cycle = positionIndex % 2 === 0 ? EVEN_KEY_CYCLE : ODD_KEY_CYCLE;
    const [side, quantity] = cycle[step % cycle.length]!;
    const symbol = SYMBOLS[positionIndex % SYMBOLS.length]!;

    return brokerActivitySchema.parse({
      id: `large-history-${sourceIndex}`,
      broker: 'generated',
      accountId: `account-${Math.floor(positionIndex / SYMBOLS.length)}`,
      activityType: 'trade',
      instrument: { assetType: 'equity', symbol },
      activityDate: '2026-08-03',
      timestampPrecision: 'date',
      side,
      quantity: quantity.toString(),
      price: (100 + (step % 17)).toString(),
      provenance: { sourceIndex },
    });
  });
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

describe('large deterministic equity histories', () => {
  it.each([100, 1_000, 10_000])(
    'conserves accounting across %i interleaved activities',
    (size) => {
      const activities = generateHistory(size);
      const result = reconstructEquityPositions(activities);

      expect(result.diagnostics).toEqual([]);
      expect(result.positions).toHaveLength(POSITION_COUNT);
      expect(result.lifecycles.some((lifecycle) => lifecycle.status === 'closed')).toBe(true);
      expect(result.lifecycles.some((lifecycle) => lifecycle.status === 'open')).toBe(true);

      for (const position of result.positions) {
        const sourceActivities = activities.filter(
          (activity) =>
            activity.accountId === position.key.accountId &&
            activity.instrument?.assetType === 'equity' &&
            activity.instrument.symbol === position.key.symbol,
        );
        const bought = sum(
          sourceActivities
            .filter((activity) => activity.side === 'buy')
            .map((activity) => activity.quantity!),
        );
        const sold = sum(
          sourceActivities
            .filter((activity) => activity.side === 'sell')
            .map((activity) => activity.quantity!),
        );
        const originalLotQuantity = sum(position.lots.map((lot) => lot.originalQuantity));
        const matchedQuantity = sum(position.matches.map((match) => match.matchedQuantity));
        const remainingLotQuantity = sum(position.lots.map((lot) => lot.remainingQuantity));

        expect(originalLotQuantity.equals(bought)).toBe(true);
        expect(matchedQuantity.equals(sold)).toBe(true);
        expect(remainingLotQuantity.equals(position.openQuantity)).toBe(true);
        expect(position.openQuantity.equals(bought.minus(sold))).toBe(true);
        expect(position.openQuantity.isNegative()).toBe(false);
      }

      expect(
        sum(result.openLots.map((lot) => lot.remainingQuantity)).equals(
          sum(result.positions.map((position) => position.openQuantity)),
        ),
      ).toBe(true);
    },
    20_000,
  );
});
