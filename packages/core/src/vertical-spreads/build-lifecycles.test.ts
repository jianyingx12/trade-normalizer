import {
  brokerActivitySchema,
  type BrokerActivityInput,
  type FeeBreakdownInput,
  type OptionInstrumentInput,
} from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { allocateVerticalSpreadOwnership } from './allocate-ownership.js';
import { buildVerticalSpreadLifecycles } from './build-lifecycles.js';
import { generateVerticalSpreadCandidates } from './generate-candidates.js';

const baseOption: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function fees(total: string): FeeBreakdownInput {
  return { commission: total, regulatory: '0', contract: '0', other: '0', total };
}

function activity(
  id: string,
  strike: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  sourceIndex: number,
  override: Partial<BrokerActivityInput> = {},
) {
  return brokerActivitySchema.parse({
    id,
    broker: 'test-broker',
    accountId: 'account-1',
    activityType: 'trade',
    instrument: { ...baseOption, strike },
    activityDate: '2026-08-03',
    timestamp: '2026-08-03T14:30:00.000Z',
    timestampPrecision: 'datetime',
    side,
    quantity,
    price,
    provenance: { sourceIndex },
    ...override,
  });
}

function build(activities: readonly ReturnType<typeof activity>[]) {
  const reconstruction = reconstructOptionPositions(activities);
  const candidates = generateVerticalSpreadCandidates(reconstruction);
  const ownership = allocateVerticalSpreadOwnership(reconstruction, candidates);
  return {
    reconstruction,
    ownership,
    lifecycles: buildVerticalSpreadLifecycles(reconstruction, ownership.allocations),
  };
}

describe('buildVerticalSpreadLifecycles', () => {
  it('builds an open spread with signed opening premium cash flow', () => {
    const result = build([
      activity('long-open', '180', 'buy', '2', '4', 0),
      activity('short-open', '185', 'sell', '2', '2', 1),
    ]);

    expect(result.lifecycles).toHaveLength(1);
    expect(result.lifecycles[0]).toMatchObject({
      strategy: 'bull_call_spread',
      status: 'open',
      openedOn: '2026-08-03',
      openedAt: '2026-08-03T14:30:00.000Z',
    });
    expect(result.lifecycles[0]?.quantity.toString()).toBe('2');
    expect(result.lifecycles[0]?.openQuantity.toString()).toBe('2');
    expect(result.lifecycles[0]?.openingNetCashFlow.toString()).toBe('-400');
  });

  it('builds a partially closed spread from attributed Phase 6 matches', () => {
    const result = build([
      activity('long-open', '180', 'buy', '4', '4', 0),
      activity('short-open', '185', 'sell', '4', '2', 1),
      activity('long-close', '180', 'sell', '2', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
      activity('short-close', '185', 'buy', '2', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
      }),
    ]);

    const spread = result.lifecycles[0]!;
    expect(spread.status).toBe('partially_closed');
    expect(spread.closedQuantity.toString()).toBe('2');
    expect(spread.openQuantity.toString()).toBe('2');
    expect(spread.lastClosedAt).toBe('2026-08-04T15:00:01.000Z');
  });

  it('marks a fully paired closure closed', () => {
    const result = build([
      activity('long-open', '180', 'buy', '1', '4', 0),
      activity('short-open', '185', 'sell', '1', '2', 1),
      activity('long-close', '180', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
      activity('short-close', '185', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
      }),
    ]);

    expect(result.lifecycles[0]?.status).toBe('closed');
    expect(result.lifecycles[0]?.openQuantity.isZero()).toBe(true);
  });

  it('aggregates gross P&L and closing cash flow from leg matches', () => {
    const result = build([
      activity('long-open', '180', 'buy', '1', '4', 0),
      activity('short-open', '185', 'sell', '1', '2', 1),
      activity('long-close', '180', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
      activity('short-close', '185', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
      }),
    ]);

    const spread = result.lifecycles[0]!;
    expect(spread.closingNetCashFlow.toString()).toBe('500');
    expect(spread.grossRealizedPnl.toString()).toBe('300');
    expect(
      spread.lowerStrikeLeg.grossRealizedPnl
        .plus(spread.higherStrikeLeg.grossRealizedPnl)
        .equals(spread.grossRealizedPnl),
    ).toBe(true);
  });

  it('aggregates known fees and net realized P&L', () => {
    const result = build([
      activity('long-open', '180', 'buy', '1', '4', 0, { fees: fees('0.4') }),
      activity('short-open', '185', 'sell', '1', '2', 1, { fees: fees('0.2') }),
      activity('long-close', '180', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
        fees: fees('0.3'),
      }),
      activity('short-close', '185', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
        fees: fees('0.1'),
      }),
    ]);

    expect(result.lifecycles[0]?.realizedFees?.toString()).toBe('1');
    expect(result.lifecycles[0]?.netRealizedPnl?.toString()).toBe('299');
  });

  it('keeps net realized P&L unknown when attributed fees are absent', () => {
    const result = build([
      activity('long-open', '180', 'buy', '1', '4', 0),
      activity('short-open', '185', 'sell', '1', '2', 1),
      activity('long-close', '180', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
      activity('short-close', '185', 'buy', '1', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
      }),
    ]);

    expect(result.lifecycles[0]?.grossRealizedPnl.toString()).toBe('300');
    expect(result.lifecycles[0]?.realizedFees).toBeUndefined();
    expect(result.lifecycles[0]?.netRealizedPnl).toBeUndefined();
  });

  it('proportionally attributes a partial lot match without duplicating Phase 6 P&L', () => {
    const result = build([
      activity('long-open', '180', 'buy', '4', '4', 0),
      activity('short-open', '185', 'sell', '2', '2', 1),
      activity('long-close', '180', 'sell', '4', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
      activity('short-close', '185', 'buy', '2', '1', 3, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:01.000Z',
      }),
    ]);

    const spread = result.lifecycles[0]!;
    expect(spread.quantity.toString()).toBe('2');
    expect(spread.lowerStrikeLeg.matchAllocations[0]?.allocatedQuantity.toString()).toBe('2');
    expect(spread.lowerStrikeLeg.grossRealizedPnl.toString()).toBe('400');
    expect(spread.grossRealizedPnl.toString()).toBe('600');
    expect(result.reconstruction.matches[0]?.grossRealizedPnl.toString()).toBe('800');
  });

  it('reports unilateral leg closure as partial without claiming paired closure', () => {
    const result = build([
      activity('long-open', '180', 'buy', '1', '4', 0),
      activity('short-open', '185', 'sell', '1', '2', 1),
      activity('long-close', '180', 'sell', '1', '6', 2, {
        activityDate: '2026-08-04',
        timestamp: '2026-08-04T15:00:00.000Z',
      }),
    ]);

    const spread = result.lifecycles[0]!;
    expect(spread.status).toBe('partially_closed');
    expect(spread.closedQuantity.isZero()).toBe(true);
    expect(spread.lowerStrikeLeg.closedQuantity.toString()).toBe('1');
    expect(spread.higherStrikeLeg.closedQuantity.isZero()).toBe(true);
  });
});
