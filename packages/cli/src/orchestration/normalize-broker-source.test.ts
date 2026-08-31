import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BrokerInputError,
  InputFileError,
  UnsupportedBrokerError,
} from '../errors/operational-error.js';
import { normalizeBrokerFile, normalizeBrokerSource } from './normalize-broker-source.js';

const fixturePath = resolve('fixtures/robinhood/robinhood-equities-synthetic.csv');
const ibkrFixturePath = resolve('fixtures/ibkr/ibkr-equities-executions-synthetic.csv');
const identicalDuplicatePath = resolve('fixtures/ibkr/ibkr-identical-duplicate-synthetic.csv');
const conflictingDuplicatePath = resolve('fixtures/ibkr/ibkr-conflicting-duplicate-synthetic.csv');

describe('normalizeBrokerFile', () => {
  it('adapts the Robinhood fixture through canonical Trade production', async () => {
    const result = await normalizeBrokerFile({ filePath: fixturePath, broker: 'robinhood' });
    const pnlByUnderlying = Object.fromEntries(
      result.trades.map((trade) => [trade.underlying, trade.grossRealizedPnl.toString()]),
    );

    expect(result.source).toEqual({
      broker: 'robinhood',
      file: 'robinhood-equities-synthetic.csv',
    });
    expect(result.summary).toMatchObject({
      sourceRecords: 17,
      executions: 0,
      activities: 17,
      trades: 4,
      activityTypes: { trade: 13, dividend: 1, deposit: 1, fee: 1, split: 1 },
    });
    expect(result.trades.map((trade) => [trade.underlying, trade.status]).sort()).toEqual([
      ['AAPL', 'closed'],
      ['MSFT', 'closed'],
      ['NVDA', 'closed'],
      ['VOO', 'partially_closed'],
    ]);
    expect(pnlByUnderlying).toEqual({ AAPL: '163.7', MSFT: '43.45', NVDA: '73.95', VOO: '2.85' });
    expect(result.trades.every((trade) => trade.netRealizedPnl === undefined)).toBe(true);
    expect(result.trades.every((trade) => trade.opened.precision === 'date')).toBe(true);
    expect(result.trades.every((trade) => trade.opened.timestamp === undefined)).toBe(true);
  });

  it('keeps IDs and complete output deterministic', async () => {
    const first = await normalizeBrokerFile({ filePath: fixturePath, broker: 'robinhood' });
    const second = await normalizeBrokerFile({ filePath: fixturePath, broker: 'robinhood' });

    expect(second).toEqual(first);
    expect(second.trades.map((trade) => trade.id)).toEqual(first.trades.map((trade) => trade.id));
  });

  it('reports a missing file as an operational input error', async () => {
    await expect(
      normalizeBrokerFile({ filePath: resolve('fixtures/missing.csv'), broker: 'robinhood' }),
    ).rejects.toBeInstanceOf(InputFileError);
  });
});

describe('normalizeBrokerSource', () => {
  it('rejects unsupported brokers with the supported broker list', () => {
    expect(() =>
      normalizeBrokerSource({ source: '', sourceFile: 'input.csv', broker: 'webull' }),
    ).toThrow(UnsupportedBrokerError);
    expect(() =>
      normalizeBrokerSource({ source: '', sourceFile: 'input.csv', broker: 'webull' }),
    ).toThrow('Unsupported broker: webull. Supported brokers: robinhood, ibkr');
  });

  it('normalizes the registered IBKR fixture through the activity reconstruction path', async () => {
    const result = await normalizeBrokerFile({ filePath: ibkrFixturePath, broker: 'ibkr' });

    expect(result.source).toEqual({
      broker: 'ibkr',
      file: 'ibkr-equities-executions-synthetic.csv',
    });
    expect(result.summary).toMatchObject({
      sourceRecords: 4,
      executions: 4,
      activities: 4,
      trades: 2,
    });
    expect(
      result.trades
        .map((trade) => [trade.underlying, trade.status])
        .sort((left, right) => left[0]!.localeCompare(right[0]!)),
    ).toEqual([
      ['AAPL', 'partially_closed'],
      ['MSFT', 'open'],
    ]);
  });

  it.each([
    ['identical', identicalDuplicatePath, 'warning'],
    ['conflicting', conflictingDuplicatePath, 'error'],
  ] as const)(
    'normalizes one retained Trade from %s IBKR duplicate evidence',
    async (_kind, filePath, severity) => {
      const result = await normalizeBrokerFile({ filePath, broker: 'ibkr' });

      expect(result.summary).toMatchObject({
        sourceRecords: 2,
        executions: 1,
        activities: 1,
        trades: 1,
        diagnostics: 1,
      });
      expect(result.diagnostics).toMatchObject([{ severity, code: 'DUPLICATE_EXECUTION' }]);
      expect(result.trades[0]).toMatchObject({ underlying: 'AAPL', status: 'open' });
    },
  );

  it.each([
    ['invalid headers', 'Wrong,Headers\nvalue,value'],
    [
      'malformed CSV',
      'Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n"unterminated',
    ],
  ])('rejects fatal %s diagnostics without returning partial output', (_name, source) => {
    expect(() =>
      normalizeBrokerSource({ source, sourceFile: 'input.csv', broker: 'robinhood' }),
    ).toThrow(BrokerInputError);
  });

  it('uses only the display filename in machine-readable output', async () => {
    const result = await normalizeBrokerFile({ filePath: fixturePath, broker: 'robinhood' });

    expect(result.source.file).not.toContain(resolve('.'));
    expect(result.source.file).toBe('robinhood-equities-synthetic.csv');
  });
});
