import {
  brokerActivitySchema,
  type BrokerActivityInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import {
  DEFAULT_DATETIME_GROUPING_WINDOW_MS,
  generateVerticalSpreadCandidates,
} from './generate-candidates.js';

const lowerCall: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function option(override: Partial<OptionInstrumentInput> = {}): OptionInstrumentInput {
  return { ...lowerCall, ...override };
}

function activity(
  id: string,
  instrument: OptionInstrumentInput,
  side: 'buy' | 'sell',
  override: Partial<BrokerActivityInput> = {},
) {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    accountId: 'account-1',
    activityType: 'trade',
    instrument,
    activityDate: '2026-08-03',
    timestamp: '2026-08-03T14:30:00.000Z',
    timestampPrecision: 'datetime',
    side,
    quantity: '1',
    price: '4',
    provenance: { sourceIndex: 0 },
    ...override,
  });
}

function candidates(activities: readonly ReturnType<typeof activity>[], windowMs?: number) {
  return generateVerticalSpreadCandidates(
    reconstructOptionPositions(activities),
    windowMs === undefined ? {} : { datetimeGroupingWindowMs: windowMs },
  );
}

describe('generateVerticalSpreadCandidates', () => {
  it('generates a strong exact-timestamp candidate with partial maximum quantity', () => {
    const result = candidates([
      activity('long-lower', option(), 'buy', { quantity: '4' }),
      activity('short-higher', option({ strike: '185' }), 'sell', {
        quantity: '2',
        provenance: { sourceIndex: 1 },
      }),
    ]);

    expect(DEFAULT_DATETIME_GROUPING_WINDOW_MS).toBe(0);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      strategy: 'bull_call_spread',
      evidence: {
        evidenceLevel: 'strong',
        correlation: 'datetime',
        openingTimeDistanceMs: 0,
      },
    });
    expect(result[0]?.lowerStrikeLeg.availableQuantity.toString()).toBe('4');
    expect(result[0]?.higherStrikeLeg.availableQuantity.toString()).toBe('2');
    expect(result[0]?.maximumQuantity.toString()).toBe('2');
  });

  it.each([
    [
      'underlying',
      option({ underlying: 'AAPL', strike: '185' }),
      {} as Partial<BrokerActivityInput>,
    ],
    ['expiration', option({ expiration: '2026-10-16', strike: '185' }), {}],
    ['option type', option({ optionType: 'put', strike: '185' }), {}],
    ['multiplier', option({ multiplier: 10, strike: '185' }), {}],
    ['account', option({ strike: '185' }), { accountId: 'account-2' }],
  ])('does not pair a different %s', (_field, secondInstrument, secondOverride) => {
    expect(
      candidates([
        activity('first', option(), 'buy'),
        activity('second', secondInstrument, 'sell', {
          provenance: { sourceIndex: 1 },
          ...secondOverride,
        }),
      ]),
    ).toEqual([]);
  });

  it('does not pair same-direction legs', () => {
    expect(
      candidates([
        activity('lower', option(), 'buy'),
        activity('higher', option({ strike: '185' }), 'buy', {
          provenance: { sourceIndex: 1 },
        }),
      ]),
    ).toEqual([]);
  });

  it('uses a configurable confirmed-datetime window', () => {
    const input = [
      activity('lower', option(), 'buy'),
      activity('higher', option({ strike: '185' }), 'sell', {
        timestamp: '2026-08-03T14:30:00.250Z',
        provenance: { sourceIndex: 1 },
      }),
    ];

    expect(candidates(input)).toEqual([]);
    expect(candidates(input, 249)).toEqual([]);
    expect(candidates(input, 250)[0]?.evidence.openingTimeDistanceMs).toBe(250);
  });

  it('disables automatic date-only grouping', () => {
    const dateOnly = (id: string, strike: string, side: 'buy' | 'sell', sourceIndex: number) =>
      activity(id, option({ strike }), side, {
        timestamp: undefined,
        timestampPrecision: 'date',
        provenance: { sourceIndex },
      });

    expect(
      candidates([dateOnly('lower', '180', 'buy', 0), dateOnly('higher', '185', 'sell', 1)]),
    ).toEqual([]);
  });

  it('requires lifecycle overlap', () => {
    const reconstruction = reconstructOptionPositions([
      activity('lower-open', option(), 'buy'),
      activity('lower-close', option(), 'sell', {
        timestamp: '2026-08-03T14:31:00.000Z',
        provenance: { sourceIndex: 1 },
      }),
      activity('higher-open', option({ strike: '185' }), 'sell', {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T14:30:00.000Z',
        provenance: { sourceIndex: 2 },
      }),
    ]);

    expect(
      generateVerticalSpreadCandidates(reconstruction, { datetimeGroupingWindowMs: 86_400_000 }),
    ).toEqual([]);
  });

  it('preserves every structural candidate in an ambiguous three-leg case', () => {
    const result = candidates([
      activity('long-180', option(), 'buy', { quantity: '2' }),
      activity('short-185', option({ strike: '185' }), 'sell', {
        provenance: { sourceIndex: 1 },
      }),
      activity('short-190', option({ strike: '190' }), 'sell', {
        provenance: { sourceIndex: 2 },
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(
      result.map((candidate) => candidate.higherStrikeLeg.instrument.strike.toString()),
    ).toEqual(['185', '190']);
  });

  it('produces the same semantic candidates regardless of input ordering', () => {
    const lower = activity('lower', option(), 'buy');
    const higher = activity('higher', option({ strike: '185' }), 'sell', {
      provenance: { sourceIndex: 1 },
    });

    expect(candidates([lower, higher])).toEqual(candidates([higher, lower]));
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid datetime window %s',
    (datetimeGroupingWindowMs) => {
      expect(() =>
        generateVerticalSpreadCandidates(reconstructOptionPositions([]), {
          datetimeGroupingWindowMs,
        }),
      ).toThrow(RangeError);
    },
  );
});
