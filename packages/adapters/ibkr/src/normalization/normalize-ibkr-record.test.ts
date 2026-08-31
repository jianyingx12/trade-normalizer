import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  normalizeIbkrExecutionRecord,
  parseIbkrTradeConfirmationExecutionCsv,
  type IbkrTradeConfirmationExecutionRecord,
} from '../index.js';

const fixture = readFileSync(
  new URL('../../../../../fixtures/ibkr/ibkr-equities-executions-synthetic.csv', import.meta.url),
  'utf8',
);
const records = parseIbkrTradeConfirmationExecutionCsv(fixture).records;
const context = { sourceId: 'fixture:ibkr-equities', sourceFile: 'ibkr-equities.csv' };

function recordAt(index: number): IbkrTradeConfirmationExecutionRecord {
  const record = records[index];
  if (record === undefined) throw new Error(`Missing fixture record ${index}.`);
  return record;
}

function normalize(override: Partial<IbkrTradeConfirmationExecutionRecord> = {}, index = 0) {
  return normalizeIbkrExecutionRecord({ ...recordAt(index), ...override }, context);
}

describe('IBKR execution record normalization', () => {
  it('maps a stock buy into linked Execution and BrokerActivity facts', () => {
    const result = normalize();
    const execution = result.execution!;
    const activity = result.activity!;

    expect(result.diagnostics).toEqual([]);
    expect(execution).toMatchObject({
      id: 'ibkr:execution:DU-SYNTHETIC-001:execution:E-1001',
      broker: 'ibkr',
      accountId: 'DU-SYNTHETIC-001',
      instrument: { assetType: 'equity', symbol: 'AAPL' },
      side: 'buy',
      currency: 'USD',
      executionTime: {
        precision: 'local_datetime',
        localDateTime: '2026-08-03T09:30:15',
      },
    });
    expect(execution.quantity.equals('10')).toBe(true);
    expect(execution.price.equals('205.12')).toBe(true);
    expect(execution.reportedCommission?.amount.equals('-1')).toBe(true);
    expect(execution.reportedCommission).toMatchObject({ currency: 'USD', effect: 'charge' });
    expect(execution.fees).toBeUndefined();
    expect(execution.provenance).toMatchObject({
      brokerTransactionId: 'E-1001',
      brokerReferences: {
        executionId: 'E-1001',
        tradeId: 'T-1001',
        orderId: 'O-5001',
        orderReference: 'opening-buy',
        instrumentId: '100001',
      },
      brokerMetadata: {
        assetClass: 'STK',
        exchange: 'NASDAQ',
        isApiOrder: 'true',
      },
      sourceIndex: 0,
    });
    expect(activity).toMatchObject({
      executionId: execution.id,
      activityType: 'trade',
      activityDate: '2026-08-03',
      localDateTime: '2026-08-03T09:30:15',
      timestampPrecision: 'local_datetime',
      side: 'buy',
      currency: 'USD',
    });
    expect(activity.quantity?.equals(execution.quantity)).toBe(true);
    expect(activity.provenance).toEqual(execution.provenance);
  });

  it('maps a negative SELL quantity to positive canonical quantity', () => {
    const result = normalize({}, 3);

    expect(result.diagnostics).toEqual([]);
    expect(result.execution?.side).toBe('sell');
    expect(result.execution?.quantity.equals('4')).toBe(true);
    expect(result.activity?.quantity?.equals('4')).toBe(true);
    expect(result.execution?.provenance.brokerReferences?.originalTradeId).toBe('T-0999');
  });

  it('uses TradeID when ExecID is absent', () => {
    const result = normalize({ execId: '' });

    expect(result.diagnostics).toEqual([]);
    expect(result.execution?.id).toBe('ibkr:execution:DU-SYNTHETIC-001:trade:T-1001');
    expect(result.execution?.provenance.brokerTransactionId).toBe('T-1001');
  });

  it('preserves a positive commission as a rebate', () => {
    const result = normalize({ commission: '0.25', commissionCurrency: 'CAD' });

    expect(result.execution?.reportedCommission?.amount.equals('0.25')).toBe(true);
    expect(result.execution?.reportedCommission).toMatchObject({
      currency: 'CAD',
      effect: 'rebate',
    });
  });

  it('preserves exact zero commission without creating complete fees', () => {
    const result = normalize({ commission: '0', commissionCurrency: 'EUR' });

    expect(result.diagnostics).toEqual([]);
    expect(result.execution?.reportedCommission?.amount.isZero()).toBe(true);
    expect(result.execution?.reportedCommission).toMatchObject({
      currency: 'EUR',
      effect: 'zero',
    });
    expect(result.execution?.fees).toBeUndefined();
  });

  it('allows absent commission evidence when both commission fields are blank', () => {
    const result = normalize({ commission: '', commissionCurrency: '' });

    expect(result.diagnostics).toEqual([]);
    expect(result.execution?.reportedCommission).toBeUndefined();
    expect(result.activity?.reportedCommission).toBeUndefined();
  });

  it('preserves a non-API order as source metadata', () => {
    const result = normalize({}, 1);

    expect(result.diagnostics).toEqual([]);
    expect(result.execution?.provenance.brokerMetadata?.isApiOrder).toBe('false');
  });

  it('preserves extreme Decimal quantity and price without precision loss', () => {
    const result = normalize({
      quantity: '1000000000000000000000000000000',
      price: '0.000000000000000000000001',
      commission: '',
      commissionCurrency: '',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.execution?.quantity.toFixed()).toBe('1000000000000000000000000000000');
    expect(result.execution?.price.toFixed()).toBe('0.000000000000000000000001');
  });

  it.each([
    ['non-equity asset', { assetClass: 'OPT' }, 'UNSUPPORTED_ASSET_TYPE'],
    ['unknown side', { buySell: 'BOT' }, 'INVALID_EXECUTION_SIDE'],
    ['BUY with negative quantity', { quantity: '-10' }, 'QUANTITY_SIDE_CONFLICT'],
    ['malformed quantity', { quantity: 'ten' }, 'INVALID_QUANTITY'],
    ['zero price', { price: '0' }, 'INVALID_PRICE'],
    ['malformed timestamp', { dateTime: '2026-08-03 09:30:15' }, 'INVALID_TIMESTAMP'],
    ['malformed commission', { commission: '$1.00' }, 'INVALID_COMMISSION'],
    ['invalid primary currency', { currencyPrimary: 'usd' }, 'INVALID_CURRENCY'],
    ['missing commission currency', { commissionCurrency: '' }, 'INVALID_CURRENCY'],
    ['invalid API-order flag', { isApiOrder: 'UNKNOWN' }, 'INVALID_SOURCE_METADATA'],
    ['SELL with positive quantity', { buySell: 'SELL', quantity: '10' }, 'QUANTITY_SIDE_CONFLICT'],
    ['invalid calendar timestamp', { dateTime: '20260230;093015' }, 'INVALID_TIMESTAMP'],
    ['missing broker identity', { execId: '', tradeId: '' }, 'INVALID_EXECUTION_ID'],
    ['blank account ID', { clientAccountId: '   ' }, 'INVALID_EXECUTION_ID'],
    ['blank symbol', { symbol: '   ' }, 'INVALID_INSTRUMENT'],
    ['blank quantity', { quantity: '   ' }, 'INVALID_QUANTITY'],
    ['blank price', { price: '   ' }, 'INVALID_PRICE'],
  ])('diagnoses %s without emitting partial canonical records', (_label, override, code) => {
    const result = normalize(override);

    expect(result.execution).toBeUndefined();
    expect(result.activity).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code, sourceIndexes: [0] });
  });
});
