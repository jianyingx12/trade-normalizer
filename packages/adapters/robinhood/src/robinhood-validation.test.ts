import { describe, expect, it } from 'vitest';

import {
  ROBINHOOD_ACTIVITY_HEADERS,
  adaptRobinhoodActivityCsv,
  parseRobinhoodActivityCsv,
} from './index.js';

const baseRow: readonly string[] = [
  '8/3/2026',
  '8/3/2026',
  '8/5/2026',
  'AAPL',
  'Apple\nCUSIP: 037833100\nMarket Buy',
  'Buy',
  '10',
  '$205.12',
  '($2,051.20)',
];

function csvLine(values: readonly string[]): string {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}

function csvWithRows(...rows: readonly string[][]): string {
  return [csvLine(ROBINHOOD_ACTIVITY_HEADERS), ...rows.map(csvLine)].join('\n');
}

function adaptRow(override: Readonly<Record<number, string>>) {
  const row = [...baseRow];
  for (const [index, value] of Object.entries(override)) {
    row[Number(index)] = value;
  }

  return adaptRobinhoodActivityCsv(csvWithRows(row), {
    sourceId: 'inline-test',
    sourceFile: 'inline.csv',
  });
}

describe('Robinhood CSV validation', () => {
  it('parses BOM, CRLF, commas, semicolons, and escaped quotes without changing source order', () => {
    const description = 'Broker said "filled", route; synthetic';
    const row = [...baseRow];
    row[4] = description;
    const source = `\uFEFF${csvLine(ROBINHOOD_ACTIVITY_HEADERS)}\r\n${csvLine(row)}\r\n`;
    const result = parseRobinhoodActivityCsv(source);

    expect(result.diagnostics).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ description, sourceIndex: 0 });
  });

  it('fails clearly when an exact required header is missing', () => {
    const headersWithoutAmount = ROBINHOOD_ACTIVITY_HEADERS.slice(0, -1);
    const result = parseRobinhoodActivityCsv(csvLine(headersWithoutAmount));

    expect(result.records).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('error');
    expect(result.diagnostics[0]?.code).toBe('INVALID_CSV_HEADERS');
    expect(result.diagnostics[0]?.details).toMatchObject({ missing: ['Amount'] });
  });

  it('maps an unknown transaction code to unknown activity with a warning', () => {
    const result = adaptRow({ 5: 'MYSTERY' });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.activityType).toBe('unknown');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('warning');
    expect(result.diagnostics[0]?.code).toBe('UNKNOWN_TRANSACTION_TYPE');
  });

  it('rejects an invalid trade quantity with a structured error', () => {
    const result = adaptRow({ 6: 'ten' });

    expect(result.activities).toEqual([]);
    expect(result.diagnostics.some((item) => item.code === 'INVALID_QUANTITY')).toBe(true);
  });

  it('rejects an invalid trade price with a structured error', () => {
    const result = adaptRow({ 7: '205.12' });

    expect(result.activities).toEqual([]);
    expect(result.diagnostics.some((item) => item.code === 'INVALID_PRICE')).toBe(true);
  });

  it.each([
    ['blank instrument', { 3: '   ' }, 'INVALID_INSTRUMENT'],
    ['blank quantity', { 6: '   ' }, 'INVALID_QUANTITY'],
    ['negative-formatted price', { 7: '($205.12)' }, 'INVALID_PRICE'],
    ['malformed amount', { 8: '$2,051.2' }, 'INVALID_AMOUNT'],
    ['impossible activity date', { 0: '2/30/2026' }, 'INVALID_ACTIVITY_DATE'],
  ])('rejects %s without emitting a trade activity', (_label, override, code) => {
    const result = adaptRow(override);

    expect(result.activities).toEqual([]);
    expect(result.diagnostics).toMatchObject([{ severity: 'error', code }]);
  });

  it('preserves an explicitly reported zero trade price and amount', () => {
    const result = adaptRow({ 7: '$0.00', 8: '($0.00)' });

    expect(result.diagnostics).toEqual([]);
    expect(result.activities[0]?.price?.isZero()).toBe(true);
    expect(result.activities[0]?.grossAmount?.isZero()).toBe(true);
  });

  it('preserves safe activity and warns when amount reconciliation fails', () => {
    const result = adaptRow({ 8: '($2,050.00)' });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]?.grossAmount?.equals('-2050')).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('warning');
    expect(result.diagnostics[0]?.code).toBe('AMOUNT_RECONCILIATION_MISMATCH');
    expect(result.diagnostics[0]?.details).toMatchObject({
      actualAbsoluteGrossAmount: '2050',
      expectedAbsoluteGrossAmount: '2051.2',
    });
  });

  it('assigns sourceIndex by logical record rather than multiline physical lines', () => {
    const secondRow = [...baseRow];
    secondRow[3] = 'MSFT';
    secondRow[4] = 'Microsoft\nCUSIP: 594918104\nMarket Buy';
    secondRow[6] = '4';
    secondRow[7] = '$521.35';
    secondRow[8] = '($2,085.40)';

    const result = adaptRobinhoodActivityCsv(csvWithRows([...baseRow], secondRow), {
      sourceId: 'multiline-order-test',
    });

    expect(result.records.map((record) => record.sourceIndex)).toEqual([0, 1]);
    expect(result.activities.map((activity) => activity.provenance.sourceIndex)).toEqual([0, 1]);
  });
});
