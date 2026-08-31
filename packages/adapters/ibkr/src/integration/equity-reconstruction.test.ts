import { readFileSync } from 'node:fs';

import { reconstructEquityPositions, type EquityPositionState } from '@trade-normalizer/core';
import { describe, expect, it } from 'vitest';

import { adaptIbkrTradeConfirmationExecutionCsv } from '../adapter.js';

const sourceFile = 'ibkr-equities-executions-synthetic.csv';
const fixture = readFileSync(
  new URL(`../../../../../fixtures/ibkr/${sourceFile}`, import.meta.url),
  'utf8',
);
const adapted = adaptIbkrTradeConfirmationExecutionCsv(fixture, {
  sourceId: 'fixture:ibkr-equities-executions-synthetic',
  sourceFile,
});
const reconstructed = reconstructEquityPositions(adapted.activities);

function position(symbol: string): EquityPositionState {
  const result = reconstructed.positions.find(
    (candidate) => candidate.instrument.symbol === symbol,
  );
  if (result === undefined) throw new Error(`Expected reconstructed position for ${symbol}.`);
  return result;
}

describe('IBKR equity execution reconstruction integration', () => {
  it('adapts and reconstructs the full fixture without diagnostics', () => {
    expect(adapted.executions).toHaveLength(4);
    expect(adapted.activities).toHaveLength(4);
    expect(adapted.diagnostics).toEqual([]);
    expect(reconstructed.diagnostics).toEqual([]);
    expect(reconstructed.positions).toHaveLength(2);
  });

  it('reconstructs the AAPL partial close with local timing preserved', () => {
    const aapl = position('AAPL');
    const lifecycle = aapl.lifecycles[0]!;

    expect(aapl.openQuantity.equals('6')).toBe(true);
    expect(aapl.remainingCostBasis.equals('1230.72')).toBe(true);
    expect(aapl.grossRealizedPnl.equals('44.52')).toBe(true);
    expect(aapl.matches).toHaveLength(1);
    expect(lifecycle).toMatchObject({
      status: 'open',
      openedAt: '2026-08-03T09:30:15',
      openingTimestampPrecision: 'local_datetime',
    });
    expect(aapl.matches[0]).toMatchObject({
      closedAt: '2026-08-10T14:59:30',
      closingTimestampPrecision: 'local_datetime',
    });
  });

  it('keeps MSFT partial fills as separate FIFO lots', () => {
    const msft = position('MSFT');

    expect(msft.openQuantity.equals('8')).toBe(true);
    expect(msft.lots).toHaveLength(2);
    expect(msft.lots.map((lot) => lot.originalQuantity.toString())).toEqual(['5', '3']);
    expect(msft.lots.map((lot) => lot.provenance.brokerReferences?.executionId)).toEqual([
      'E-1002',
      'E-1003',
    ]);
    expect(msft.lots.every((lot) => lot.provenance.brokerReferences?.orderId === 'O-5002')).toBe(
      true,
    );
  });

  it('does not treat reported commission as a complete fee breakdown', () => {
    expect(adapted.executions.every((execution) => execution.fees === undefined)).toBe(true);
    expect(
      adapted.executions.every((execution) => execution.reportedCommission !== undefined),
    ).toBe(true);
    expect(reconstructed.matches.every((match) => match.entryFees === undefined)).toBe(true);
    expect(reconstructed.matches.every((match) => match.exitFees === undefined)).toBe(true);
    expect(position('AAPL').netRealizedPnl).toBeUndefined();
    expect(position('MSFT').netRealizedPnl?.isZero()).toBe(true);
  });

  it('produces deterministic reconstruction from repeated adaptation', () => {
    const repeated = adaptIbkrTradeConfirmationExecutionCsv(fixture, {
      sourceId: 'fixture:ibkr-equities-executions-synthetic',
      sourceFile,
    });

    expect(reconstructEquityPositions(repeated.activities)).toEqual(reconstructed);
  });
});
