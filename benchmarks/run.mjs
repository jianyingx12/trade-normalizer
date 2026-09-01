import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';

import { parseIbkrTradeConfirmationExecutionCsv } from '../packages/adapters/ibkr/dist/index.js';
import { parseRobinhoodActivityCsv } from '../packages/adapters/robinhood/dist/index.js';
import {
  brokerActivitySchema,
  buildCanonicalTrades,
  reconstructEquityPositions,
  reconstructOptionPositions,
  reconstructVerticalSpreads,
} from '../packages/core/dist/index.js';
import { normalizeBrokerSource } from '../packages/cli/dist/api.js';

const robinhoodSource = readFileSync(
  new URL('../fixtures/robinhood/robinhood-equities-synthetic.csv', import.meta.url),
  'utf8',
);
const ibkrSource = readFileSync(
  new URL('../fixtures/ibkr/ibkr-equities-executions-synthetic.csv', import.meta.url),
  'utf8',
);

function equityActivities(size) {
  const cycle = [
    ['buy', '10'],
    ['buy', '5'],
    ['sell', '6'],
    ['sell', '9'],
  ];
  return Array.from({ length: size }, (_, sourceIndex) => {
    const positionIndex = sourceIndex % 20;
    const step = Math.floor(sourceIndex / 20);
    const [side, quantity] = cycle[step % cycle.length];
    return brokerActivitySchema.parse({
      id: `benchmark-equity-${sourceIndex}`,
      broker: 'benchmark',
      accountId: `account-${Math.floor(positionIndex / 5)}`,
      activityType: 'trade',
      instrument: { assetType: 'equity', symbol: `SYM${positionIndex % 5}` },
      activityDate: '2026-08-03',
      timestampPrecision: 'date',
      side,
      quantity,
      price: (100 + (step % 10)).toString(),
      provenance: { sourceIndex },
    });
  });
}

function optionActivities(size) {
  const cycle = [
    ['buy', '10'],
    ['buy', '5'],
    ['sell', '6'],
    ['sell', '9'],
  ];
  return Array.from({ length: size }, (_, sourceIndex) => {
    const contractIndex = sourceIndex % 20;
    const step = Math.floor(sourceIndex / 20);
    const [side, quantity] = cycle[step % cycle.length];
    return brokerActivitySchema.parse({
      id: `benchmark-option-${sourceIndex}`,
      broker: 'benchmark',
      accountId: 'option-account',
      activityType: 'trade',
      instrument: {
        assetType: 'option',
        underlying: 'AAPL',
        expiration: '2026-09-18',
        strike: (100 + contractIndex).toString(),
        optionType: 'call',
        multiplier: 100,
      },
      activityDate: '2026-08-03',
      timestampPrecision: 'date',
      side,
      quantity,
      price: '4.25',
      provenance: { sourceIndex },
    });
  });
}

function verticalActivities(lotCount) {
  return Array.from({ length: lotCount }, (_, sourceIndex) =>
    brokerActivitySchema.parse({
      id: `benchmark-vertical-${sourceIndex}`,
      broker: 'benchmark',
      accountId: 'vertical-account',
      activityType: 'trade',
      instrument: {
        assetType: 'option',
        underlying: 'NVDA',
        expiration: '2026-09-18',
        strike: (100 + sourceIndex).toString(),
        optionType: 'call',
        multiplier: 100,
      },
      activityDate: '2026-08-03',
      timestamp: '2026-08-03T14:30:00.000Z',
      timestampPrecision: 'datetime',
      side: sourceIndex % 2 === 0 ? 'buy' : 'sell',
      quantity: '1',
      price: '4.25',
      provenance: { sourceIndex },
    }),
  );
}

const equityHistory = equityActivities(10_000);
const optionHistory = optionActivities(2_000);
const verticalOptionResult = reconstructOptionPositions(verticalActivities(100));
const equityResult = reconstructEquityPositions(equityHistory);
const emptyOptionResult = {
  positions: [],
  openLots: [],
  matches: [],
  lifecycles: [],
  diagnostics: [],
};
const emptyVerticalResult = { spreads: [], ungrouped: [], diagnostics: [] };

let sink;

function benchmark(name, operation, operationsPerSample = 1) {
  for (let index = 0; index < 2; index += 1) sink = operation();
  const samples = [];
  for (let sample = 0; sample < 7; sample += 1) {
    const started = performance.now();
    for (let index = 0; index < operationsPerSample; index += 1) sink = operation();
    samples.push((performance.now() - started) / operationsPerSample);
  }
  samples.sort((left, right) => left - right);
  const median = samples[Math.floor(samples.length / 2)];
  console.log(`${name.padEnd(58)} ${median.toFixed(3).padStart(10)} ms/op`);
}

console.log('Universal Trade Normalizer benchmark');
console.log(`Node ${process.version} | ${process.platform} ${process.arch}`);
console.log(`CPU: ${cpus()[0]?.model ?? 'unknown'} | samples: 7 median | no timing thresholds`);
console.log('');

benchmark('Robinhood parsing (17 records)', () => parseRobinhoodActivityCsv(robinhoodSource), 250);
benchmark(
  'IBKR parsing (4 records)',
  () => parseIbkrTradeConfirmationExecutionCsv(ibkrSource),
  250,
);
benchmark('Equity reconstruction (10,000 activities)', () =>
  reconstructEquityPositions(equityHistory),
);
benchmark('Option reconstruction (2,000 activities)', () =>
  reconstructOptionPositions(optionHistory),
);
benchmark('Vertical reconstruction (100 lots / 2,500 pairs)', () =>
  reconstructVerticalSpreads(verticalOptionResult),
);
benchmark('Canonical Trade production (10,000 equity activities)', () =>
  buildCanonicalTrades({
    equityReconstruction: equityResult,
    optionReconstruction: emptyOptionResult,
    verticalSpreadReconstruction: emptyVerticalResult,
  }),
);
benchmark(
  'Full Robinhood normalization (17 records)',
  () =>
    normalizeBrokerSource({
      source: robinhoodSource,
      sourceFile: 'robinhood-equities-synthetic.csv',
      broker: 'robinhood',
    }),
  25,
);
benchmark(
  'Full IBKR normalization (4 records)',
  () =>
    normalizeBrokerSource({
      source: ibkrSource,
      sourceFile: 'ibkr-equities-executions-synthetic.csv',
      broker: 'ibkr',
    }),
  25,
);

void sink;
