import { readFileSync } from 'node:fs';

import { reconstructEquityPositions, type EquityPositionState } from '@trade-normalizer/core';
import { describe, expect, it } from 'vitest';

import { adaptRobinhoodActivityCsv } from '../adapter.js';

const sourceFile = 'robinhood-equities-synthetic.csv';
const fixture = readFileSync(
  new URL(`../../../../../fixtures/robinhood/${sourceFile}`, import.meta.url),
  'utf8',
);
const adapted = adaptRobinhoodActivityCsv(fixture, {
  sourceId: 'fixture:robinhood-equities-synthetic',
  sourceFile,
});
const reconstructed = reconstructEquityPositions(adapted.activities);

function position(symbol: string): EquityPositionState {
  const result = reconstructed.positions.find(
    (candidate) => candidate.instrument.symbol === symbol,
  );
  if (result === undefined) {
    throw new Error(`Expected reconstructed position for ${symbol}`);
  }
  return result;
}

function decimalStrings(values: readonly { toString(): string }[]): string[] {
  return values.map((value) => value.toString());
}

describe('Robinhood fixture equity reconstruction', () => {
  it('normalizes and reconstructs the complete fixture without diagnostics', () => {
    expect(adapted.activities).toHaveLength(17);
    expect(adapted.activities.filter((activity) => activity.activityType === 'trade')).toHaveLength(
      13,
    );
    expect(adapted.diagnostics).toEqual([]);
    expect(reconstructed.diagnostics).toEqual([]);
    expect(reconstructed.positions).toHaveLength(4);
    expect(reconstructed.lifecycles).toHaveLength(4);
  });

  it('reconstructs the completed AAPL FIFO lifecycle', () => {
    const aapl = position('AAPL');

    expect(decimalStrings(aapl.matches.map((match) => match.matchedQuantity))).toEqual([
      '6',
      '4',
      '5',
    ]);
    expect(decimalStrings(aapl.lots.map((lot) => lot.remainingQuantity))).toEqual(['0', '0']);
    expect(aapl.openQuantity.isZero()).toBe(true);
    expect(aapl.remainingCostBasis.isZero()).toBe(true);
    expect(aapl.grossRealizedPnl.toString()).toBe('163.7');
    expect(aapl.lifecycles[0]?.status).toBe('closed');
  });

  it('reconstructs NVDA across a partial close and later buy', () => {
    const nvda = position('NVDA');

    expect(decimalStrings(nvda.matches.map((match) => match.matchedQuantity))).toEqual([
      '2',
      '4',
      '3',
    ]);
    expect(nvda.openQuantity.isZero()).toBe(true);
    expect(nvda.grossRealizedPnl.toString()).toBe('73.95');
    expect(nvda.lifecycles).toHaveLength(1);
    expect(nvda.lifecycles[0]?.status).toBe('closed');
  });

  it('reconstructs the completed MSFT lifecycle while ignoring its dividend', () => {
    const msft = position('MSFT');

    expect(decimalStrings(msft.matches.map((match) => match.matchedQuantity))).toEqual(['1', '3']);
    expect(msft.openQuantity.isZero()).toBe(true);
    expect(msft.grossRealizedPnl.toString()).toBe('43.45');
    expect(msft.lifecycles[0]?.activityIds).toHaveLength(3);
    expect(msft.lifecycles[0]?.status).toBe('closed');
  });

  it('preserves VOO fractional open inventory', () => {
    const voo = position('VOO');

    expect(decimalStrings(voo.matches.map((match) => match.matchedQuantity))).toEqual(['0.5']);
    expect(voo.openQuantity.toString()).toBe('0.875');
    expect(voo.remainingCostBasis.toString()).toBe('548.1');
    expect(voo.grossRealizedPnl.toString()).toBe('2.85');
    expect(voo.lifecycles[0]?.status).toBe('open');
    expect(reconstructed.openLots).toHaveLength(1);
    expect(reconstructed.openLots[0]?.instrument.symbol).toBe('VOO');
    expect(reconstructed.openLots[0]?.remainingQuantity.toString()).toBe('0.875');
  });

  it('does not claim net P&L when fixture fees are absent', () => {
    expect(reconstructed.matches.every((match) => match.entryFees === undefined)).toBe(true);
    expect(reconstructed.matches.every((match) => match.exitFees === undefined)).toBe(true);
    expect(reconstructed.matches.every((match) => match.netRealizedPnl === undefined)).toBe(true);
    expect(reconstructed.positions.every((item) => item.netRealizedPnl === undefined)).toBe(true);
  });

  it('satisfies quantity conservation for every reconstructed position', () => {
    for (const item of reconstructed.positions) {
      const zero = item.openQuantity.minus(item.openQuantity);
      const openingQuantity = item.lots.reduce(
        (total, lot) => total.plus(lot.originalQuantity),
        zero,
      );
      const matchedQuantity = item.matches.reduce(
        (total, match) => total.plus(match.matchedQuantity),
        zero,
      );
      const lotRemainingQuantity = item.lots.reduce(
        (total, lot) => total.plus(lot.remainingQuantity),
        zero,
      );

      expect(matchedQuantity.plus(item.openQuantity).equals(openingQuantity)).toBe(true);
      expect(lotRemainingQuantity.equals(item.openQuantity)).toBe(true);
    }
  });

  it('produces deterministic output for repeated reconstruction', () => {
    expect(reconstructEquityPositions(adapted.activities)).toEqual(
      reconstructEquityPositions(adapted.activities),
    );
  });
});
