import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  adaptIbkrTradeConfirmationExecutionCsv,
  ibkrAdapter,
  normalizeIbkrExecutionRecords,
  parseIbkrTradeConfirmationExecutionCsv,
  type IbkrTradeConfirmationExecutionRecord,
} from './index.js';

const fixture = readFileSync(
  new URL('../../../../fixtures/ibkr/ibkr-equities-executions-synthetic.csv', import.meta.url),
  'utf8',
);
const context = { sourceId: 'fixture:ibkr-equities', sourceFile: 'ibkr-equities.csv' };

function fixtureRecords(): readonly IbkrTradeConfirmationExecutionRecord[] {
  return parseIbkrTradeConfirmationExecutionCsv(fixture).records;
}

describe('IBKR execution-capable adapter', () => {
  it('adapts the complete synthetic fixture into linked canonical pairs', () => {
    const result = adaptIbkrTradeConfirmationExecutionCsv(fixture, context);

    expect(result.records).toHaveLength(4);
    expect(result.executions).toHaveLength(4);
    expect(result.activities).toHaveLength(4);
    expect(result.diagnostics).toEqual([]);
    expect(result.activities.map((activity) => activity.executionId)).toEqual(
      result.executions.map((execution) => execution.id),
    );
  });

  it('keeps separate partial fills that share one OrderID', () => {
    const result = ibkrAdapter.adapt(fixture, context);
    const fills = result.executions.filter(
      (execution) => execution.provenance.brokerReferences?.orderId === 'O-5002',
    );

    expect(fills).toHaveLength(2);
    expect(fills.map((execution) => execution.provenance.brokerTransactionId)).toEqual([
      'E-1002',
      'E-1003',
    ]);
  });

  it('emits an identical duplicate once with a warning', () => {
    const first = fixtureRecords()[0]!;
    const duplicate = { ...first, sourceIndex: 1 };
    const result = normalizeIbkrExecutionRecords([first, duplicate], context);

    expect(result.executions).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'warning',
      code: 'DUPLICATE_EXECUTION',
      sourceIndexes: [0, 1],
      executionIds: [result.executions[0]?.id],
      details: { differingFields: [] },
    });
  });

  it('emits a stronger error for conflicting rows with one execution identity', () => {
    const first = fixtureRecords()[0]!;
    const conflict = { ...first, price: '999.99', sourceIndex: 1 };
    const result = normalizeIbkrExecutionRecords([first, conflict], context);

    expect(result.executions).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.executions[0]?.price.equals('205.12')).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'DUPLICATE_EXECUTION',
      sourceIndexes: [0, 1],
      details: { differingFields: ['price'] },
    });
  });

  it('retains valid rows when another row is malformed', () => {
    const [first, second] = fixtureRecords();
    const invalid = { ...second!, quantity: 'not-a-decimal' };
    const result = normalizeIbkrExecutionRecords([first!, invalid], context);

    expect(result.executions).toHaveLength(1);
    expect(result.activities).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('INVALID_QUANTITY');
  });

  it('is deterministic across repeated imports of the same source', () => {
    const first = ibkrAdapter.adapt(fixture, context);
    const second = ibkrAdapter.adapt(fixture, context);

    expect(second).toEqual(first);
  });

  it('exposes exact-profile detection through the adapter contract', () => {
    expect(ibkrAdapter.detect(fixture)).toBe(true);
    expect(ibkrAdapter.broker).toBe('ibkr');
  });
});
