import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  detectIbkrTradeConfirmationExecutionCsv,
  IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS,
  parseIbkrTradeConfirmationExecutionCsv,
} from './index.js';

const fixture = readFileSync(
  new URL('../../../../fixtures/ibkr/ibkr-equities-executions-synthetic.csv', import.meta.url),
  'utf8',
);

function csvLine(values: readonly string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}

describe('IBKR Trade Confirmation execution CSV parser', () => {
  it('parses BOM, CRLF, commas, semicolons, and escaped quotes as one logical record', () => {
    const row = [
      'DU-SYNTHETIC-001',
      'USD',
      'STK',
      'AAPL',
      'Broker said "filled", route; synthetic',
      '100001',
      '',
      '',
      '',
      '',
      '',
      '20260803;093015',
      'NASDAQ',
      'BUY',
      '10',
      '205.12',
      'T-1001',
      'E-1001',
      '',
      'O-5001',
      '',
      'Y',
      '-1.00',
      'USD',
    ];
    const source = `\uFEFF${csvLine(IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS)}\r\n${csvLine(row)}\r\n`;
    const result = parseIbkrTradeConfirmationExecutionCsv(source);

    expect(result.diagnostics).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ description: row[4], sourceIndex: 0 });
  });

  it('detects only the exact fixed-profile header', () => {
    expect(detectIbkrTradeConfirmationExecutionCsv(fixture)).toBe(true);

    const reordered = [...IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(detectIbkrTradeConfirmationExecutionCsv(csvLine(reordered))).toBe(false);
  });

  it('parses the complete synthetic fixture without diagnostics', () => {
    const result = parseIbkrTradeConfirmationExecutionCsv(fixture);

    expect(result.diagnostics).toEqual([]);
    expect(result.records).toHaveLength(4);
    expect(result.records.map((record) => record.sourceIndex)).toEqual([0, 1, 2, 3]);
  });

  it('preserves source execution, order, account, and commission cells verbatim', () => {
    const result = parseIbkrTradeConfirmationExecutionCsv(fixture);
    const sell = result.records[3];

    expect(sell).toMatchObject({
      clientAccountId: 'DU-SYNTHETIC-001',
      currencyPrimary: 'USD',
      assetClass: 'STK',
      symbol: 'AAPL',
      conid: '100001',
      dateTime: '20260810;145930',
      buySell: 'SELL',
      quantity: '-4',
      price: '216.25',
      tradeId: 'T-1004',
      execId: 'E-1004',
      origTradeId: 'T-0999',
      orderId: 'O-5003',
      orderReference: 'partial-exit',
      isApiOrder: 'Y',
      commission: '-0.75',
      commissionCurrency: 'USD',
      sourceIndex: 3,
    });
  });

  it('keeps partial fills under one order as separate parsed records', () => {
    const records = parseIbkrTradeConfirmationExecutionCsv(fixture).records;
    const partialFills = records.filter((record) => record.orderId === 'O-5002');

    expect(partialFills).toHaveLength(2);
    expect(partialFills.map((record) => record.execId)).toEqual(['E-1002', 'E-1003']);
  });

  it('reports missing fixed-profile headers', () => {
    const headers = IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS.filter(
      (header) => header !== 'ExecID',
    );
    const result = parseIbkrTradeConfirmationExecutionCsv(csvLine(headers));

    expect(result.records).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'INVALID_CSV_HEADERS',
      details: { missing: ['ExecID'] },
    });
  });

  it('reports malformed CSV', () => {
    const result = parseIbkrTradeConfirmationExecutionCsv('"unterminated');

    expect(result.records).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'MALFORMED_CSV',
    });
  });

  it('indexes logical records when a quoted description spans physical lines', () => {
    const first = [
      'DU-SYNTHETIC-001',
      'USD',
      'STK',
      'AAPL',
      'APPLE INC\nSynthetic multiline description',
      '100001',
      '',
      '',
      '',
      '',
      '',
      '20260803;093015',
      'NASDAQ',
      'BUY',
      '10',
      '205.12',
      'T-1001',
      'E-1001',
      '',
      'O-5001',
      '',
      'Y',
      '-1.00',
      'USD',
    ];
    const second = [...first];
    second[3] = 'MSFT';
    second[17] = 'E-1002';

    const csv = [
      csvLine(IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS),
      csvLine(first),
      csvLine(second),
    ].join('\n');
    const result = parseIbkrTradeConfirmationExecutionCsv(csv);

    expect(result.diagnostics).toEqual([]);
    expect(result.records.map((record) => record.sourceIndex)).toEqual([0, 1]);
    expect(result.records[0]?.description).toContain('\n');
  });
});
