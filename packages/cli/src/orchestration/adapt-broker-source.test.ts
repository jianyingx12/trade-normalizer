import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_BROKERS } from '../brokers/registry.js';
import { adaptBrokerSource } from './adapt-broker-source.js';

function fixture(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

describe('registered broker adaptation', () => {
  it('registers Robinhood and the fixed-profile IBKR adapter', () => {
    expect(SUPPORTED_BROKERS).toEqual(['robinhood', 'ibkr']);
  });

  it('represents Robinhood as activity-only without changing its adapter', () => {
    const adapted = adaptBrokerSource({
      source: fixture('fixtures/robinhood/robinhood-equities-synthetic.csv'),
      sourceFile: 'robinhood-equities-synthetic.csv',
      broker: 'robinhood',
    });

    expect(adapted.sourceRecordCount).toBe(17);
    expect(adapted.executions).toEqual([]);
    expect(adapted.activities).toHaveLength(17);
  });

  it('retains IBKR execution evidence alongside linked activities', () => {
    const adapted = adaptBrokerSource({
      source: fixture('fixtures/ibkr/ibkr-equities-executions-synthetic.csv'),
      sourceFile: 'ibkr-equities-executions-synthetic.csv',
      broker: 'ibkr',
    });

    expect(adapted.sourceRecordCount).toBe(4);
    expect(adapted.executions).toHaveLength(4);
    expect(adapted.activities).toHaveLength(4);
    expect(adapted.activities.map((activity) => activity.executionId)).toEqual(
      adapted.executions.map((execution) => execution.id),
    );
  });
});
