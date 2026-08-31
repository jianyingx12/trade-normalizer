import {
  brokerActivitySchema,
  warningSchema,
  type BrokerActivity,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/core';
import { describe, expect, it } from 'vitest';

import { normalizeBrokerActivities } from './normalize-broker-activities.js';

const option: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function activity(
  id: string,
  override: Partial<BrokerActivityInput>,
  sourceIndex: number,
): BrokerActivity {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    activityType: 'trade',
    instrument: { assetType: 'equity', symbol: 'AAPL' },
    activityDate: '2026-08-01',
    timestampPrecision: 'date',
    side: 'buy',
    quantity: '1',
    price: '10',
    provenance: { sourceIndex },
    ...override,
  });
}

describe('normalizeBrokerActivities', () => {
  it('builds a versioned envelope and counts non-trade activity without creating a Trade', () => {
    const activities = [
      activity('buy', {}, 0),
      activity('sell', { side: 'sell', price: '12', activityDate: '2026-08-02' }, 1),
      activity(
        'dividend',
        {
          activityType: 'dividend',
          side: undefined,
          quantity: undefined,
          price: undefined,
          grossAmount: '3.5',
        },
        2,
      ),
    ];
    const diagnostic = warningSchema.parse({
      severity: 'warning',
      code: 'UNSUPPORTED_EVENT',
      message: 'Preserved source event.',
    });

    const result = normalizeBrokerActivities({
      broker: 'test-broker',
      sourceFile: 'input.csv',
      sourceRecordCount: 3,
      activities,
      diagnostics: [diagnostic],
    });

    expect(result.schemaVersion).toBe('2');
    expect(result.source).toEqual({ broker: 'test-broker', file: 'input.csv' });
    expect(result.summary).toMatchObject({
      sourceRecords: 3,
      executions: 0,
      activities: 3,
      trades: 1,
      diagnostics: 1,
      activityTypes: { trade: 2, dividend: 1 },
      assetTypes: { equity: 3, option: 0, unspecified: 0 },
    });
    expect(result.trades[0]).toMatchObject({
      underlying: 'AAPL',
      strategy: 'equity_long',
      status: 'closed',
      opened: { date: '2026-08-01', precision: 'date' },
    });
    expect(result.trades[0]?.opened.timestamp).toBeUndefined();
  });

  it('routes canonical option activities through option and vertical reconstruction', () => {
    const timestamp = '2026-08-03T14:30:00.000Z';
    const result = normalizeBrokerActivities({
      broker: 'test-broker',
      sourceFile: 'options.csv',
      sourceRecordCount: 2,
      activities: [
        activity(
          'lower',
          { instrument: option, timestamp, timestampPrecision: 'datetime', price: '4' },
          0,
        ),
        activity(
          'higher',
          {
            instrument: { ...option, strike: '185' },
            timestamp,
            timestampPrecision: 'datetime',
            side: 'sell',
            price: '2',
          },
          1,
        ),
      ],
    });

    expect(result.summary.assetTypes).toEqual({ equity: 0, option: 2, unspecified: 0 });
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.strategy).toBe('bull_call_spread');
    expect(result.trades[0]?.legs).toHaveLength(2);
  });

  it('produces deterministic output for identical canonical input', () => {
    const input = {
      broker: 'test-broker',
      sourceFile: 'input.csv',
      sourceRecordCount: 1,
      activities: [activity('buy', {}, 0)],
    } as const;

    expect(normalizeBrokerActivities(input)).toEqual(normalizeBrokerActivities(input));
  });
});
