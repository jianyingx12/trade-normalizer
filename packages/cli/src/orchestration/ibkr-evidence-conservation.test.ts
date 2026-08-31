import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { serializeJson } from '../serialization/serialize-json.js';
import { adaptBrokerFile } from './adapt-broker-source.js';
import { normalizeBrokerFile } from './normalize-broker-source.js';

const fixturePath = resolve('fixtures/ibkr/ibkr-equities-executions-synthetic.csv');

describe('IBKR execution evidence through CLI orchestration', () => {
  it('conserves every valid execution as exactly one linked activity', async () => {
    const adapted = await adaptBrokerFile({ filePath: fixturePath, broker: 'ibkr' });

    expect(adapted.sourceRecordCount).toBe(4);
    expect(adapted.executions).toHaveLength(4);
    expect(adapted.activities).toHaveLength(4);
    expect(new Set(adapted.executions.map((execution) => execution.id)).size).toBe(4);
    expect(adapted.activities.map((activity) => activity.executionId)).toEqual(
      adapted.executions.map((execution) => execution.id),
    );
    expect(adapted.diagnostics).toEqual([]);
  });

  it('retains separate partial fills, local datetime, currency, and reported commission', async () => {
    const adapted = await adaptBrokerFile({ filePath: fixturePath, broker: 'ibkr' });
    const msftFills = adapted.executions.filter(
      (execution) => execution.provenance.brokerReferences?.orderId === 'O-5002',
    );

    expect(msftFills).toHaveLength(2);
    expect(msftFills.map((execution) => execution.provenance.brokerTransactionId)).toEqual([
      'E-1002',
      'E-1003',
    ]);
    expect(msftFills.map((execution) => execution.quantity.toString())).toEqual(['5', '3']);
    expect(adapted.executions.map((execution) => execution.executionTime)).toEqual([
      { precision: 'local_datetime', localDateTime: '2026-08-03T09:30:15' },
      { precision: 'local_datetime', localDateTime: '2026-08-04T10:15:00' },
      { precision: 'local_datetime', localDateTime: '2026-08-04T10:15:01' },
      { precision: 'local_datetime', localDateTime: '2026-08-10T14:59:30' },
    ]);
    expect(adapted.executions.every((execution) => execution.currency === 'USD')).toBe(true);
    expect(
      adapted.executions.map((execution) => execution.reportedCommission?.amount.toString()),
    ).toEqual(['-1', '-0.5', '-0.3', '-0.75']);
    expect(
      adapted.executions.every(
        (execution) =>
          execution.reportedCommission?.currency === 'USD' && execution.fees === undefined,
      ),
    ).toBe(true);
    expect(
      adapted.activities.every(
        (activity) =>
          activity.currency === 'USD' &&
          activity.reportedCommission !== undefined &&
          activity.fees === undefined,
      ),
    ).toBe(true);
  });

  it('reconstructs logical Trades without duplicating fills or fabricating UTC', async () => {
    const first = await normalizeBrokerFile({ filePath: fixturePath, broker: 'ibkr' });
    const second = await normalizeBrokerFile({ filePath: fixturePath, broker: 'ibkr' });
    const msft = first.trades.find((trade) => trade.underlying === 'MSFT')!;
    const aapl = first.trades.find((trade) => trade.underlying === 'AAPL')!;
    const json = serializeJson(first);

    expect(first.trades).toHaveLength(2);
    expect(msft.legs[0]?.quantity.toString()).toBe('8');
    expect(msft.legs[0]?.openQuantity.toString()).toBe('8');
    expect(msft.legs[0]?.openingActivityIds).toHaveLength(2);
    expect(aapl.status).toBe('partially_closed');
    expect(aapl.grossRealizedPnl.toString()).toBe('44.52');
    expect(aapl.fees).toBeUndefined();
    expect(aapl.netRealizedPnl).toBeUndefined();
    expect(first.trades.every((trade) => trade.opened.precision === 'date')).toBe(true);
    expect(first.trades.every((trade) => trade.opened.timestamp === undefined)).toBe(true);
    expect(json).not.toMatch(/2026-08-\d{2}T[^"\n]*Z/);
    expect(second).toEqual(first);
    expect(second.trades.map((trade) => trade.id)).toEqual(first.trades.map((trade) => trade.id));
  });
});
