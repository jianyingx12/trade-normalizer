import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { adaptRobinhoodActivityCsv, detectRobinhoodActivityCsv } from './index.js';

const sourceFile = 'robinhood-equities-synthetic.csv';
const fixture = readFileSync(
  new URL(`../../../../fixtures/robinhood/${sourceFile}`, import.meta.url),
  'utf8',
);
const result = adaptRobinhoodActivityCsv(fixture, {
  sourceId: 'fixture:robinhood-equities-synthetic',
  sourceFile,
});

function activityAt(index: number) {
  const activity = result.activities[index];
  expect(activity).toBeDefined();
  if (activity === undefined) {
    throw new Error(`Expected activity at index ${index}`);
  }
  return activity;
}

describe('Robinhood synthetic equities fixture', () => {
  it('detects the observed Robinhood header format', () => {
    expect(detectRobinhoodActivityCsv(fixture)).toBe(true);
  });

  it('parses the complete fixture without diagnostics', () => {
    expect(result.records).toHaveLength(17);
    expect(result.diagnostics).toEqual([]);
  });

  it('creates one BrokerActivity for every logical fixture record', () => {
    expect(result.activities).toHaveLength(17);
    expect(result.activities.every((activity) => activity.timestampPrecision === 'date')).toBe(
      true,
    );
    expect(result.activities.every((activity) => activity.timestamp === undefined)).toBe(true);
  });

  it('maps a Buy row to equity trade activity', () => {
    const activity = activityAt(0);

    expect(activity.activityType).toBe('trade');
    expect(activity.side).toBe('buy');
    expect(activity.activityDate).toBe('2026-08-03');
    expect(activity.instrument).toEqual({ assetType: 'equity', symbol: 'AAPL' });
    expect(activity.quantity?.equals('10')).toBe(true);
    expect(activity.price?.equals('205.12')).toBe(true);
    expect(activity.fees).toBeUndefined();
  });

  it('maps a Sell row to equity trade activity', () => {
    const activity = activityAt(4);

    expect(activity.activityType).toBe('trade');
    expect(activity.side).toBe('sell');
    expect(activity.instrument).toEqual({ assetType: 'equity', symbol: 'AAPL' });
    expect(activity.quantity?.equals('6')).toBe(true);
    expect(activity.price?.equals('216.25')).toBe(true);
  });

  it('preserves fractional quantities as Decimal values', () => {
    expect(activityAt(6).quantity?.equals('1.375')).toBe(true);
    expect(activityAt(13).quantity?.equals('0.500')).toBe(true);
  });

  it('parses a parenthesized Buy amount as negative', () => {
    expect(activityAt(0).grossAmount?.equals('-2051.20')).toBe(true);
  });

  it('keeps a Sell amount positive', () => {
    expect(activityAt(4).grossAmount?.equals('1297.50')).toBe(true);
  });

  it('maps CDIV to dividend activity without execution fields', () => {
    const activity = activityAt(7);

    expect(activity.activityType).toBe('dividend');
    expect(activity.instrument).toEqual({ assetType: 'equity', symbol: 'MSFT' });
    expect(activity.grossAmount?.equals('3.32')).toBe(true);
    expect(activity.side).toBeUndefined();
    expect(activity.quantity).toBeUndefined();
    expect(activity.price).toBeUndefined();
  });

  it('maps ACH to deposit activity', () => {
    const activity = activityAt(14);

    expect(activity.activityType).toBe('deposit');
    expect(activity.instrument).toBeUndefined();
    expect(activity.grossAmount?.equals('1500')).toBe(true);
  });

  it('maps GOLD to fee activity without inventing a fee breakdown', () => {
    const activity = activityAt(15);

    expect(activity.activityType).toBe('fee');
    expect(activity.instrument).toBeUndefined();
    expect(activity.grossAmount?.equals('-5')).toBe(true);
    expect(activity.fees).toBeUndefined();
  });

  it('maps SPL to split activity using only observed fields', () => {
    const activity = activityAt(16);

    expect(activity.activityType).toBe('split');
    expect(activity.instrument).toEqual({ assetType: 'equity', symbol: 'AAPL' });
    expect(activity.grossAmount).toBeUndefined();
    expect(activity.quantity).toBeUndefined();
    expect(activity.price).toBeUndefined();
  });

  it('preserves quoted multiline descriptions in parsed records', () => {
    expect(result.records[0]?.description).toBe('Apple\nCUSIP: 037833100\nMarket Buy');
  });

  it('uses logical data-record order for deterministic sourceIndex values', () => {
    expect(result.records.map((record) => record.sourceIndex)).toEqual(
      Array.from({ length: 17 }, (_, index) => index),
    );
    expect(result.activities.map((activity) => activity.provenance.sourceIndex)).toEqual(
      Array.from({ length: 17 }, (_, index) => index),
    );
  });
});
