import { brokerActivitySchema, type OptionInstrumentInput } from '@trade-normalizer/schemas';
import { describe, expect, it } from 'vitest';

import { reconstructOptionPositions } from '../option-reconstruction/reconstruct-option-positions.js';
import { reconstructVerticalSpreads } from '../vertical-spreads/reconstruct-vertical-spreads.js';
import { validateOptionTradeOwnership } from './validate-option-ownership.js';

const baseOption: OptionInstrumentInput = {
  assetType: 'option',
  underlying: 'NVDA',
  expiration: '2026-09-18',
  strike: '180',
  optionType: 'call',
  multiplier: 100,
};

function activity(
  id: string,
  strike: string,
  side: 'buy' | 'sell',
  quantity: string,
  index: number,
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
    price: '4',
    provenance: { sourceIndex: index },
  });
}

function reconstruct() {
  const options = reconstructOptionPositions([
    activity('long-180', '180', 'buy', '2', 0),
    activity('short-185', '185', 'sell', '1', 1),
  ]);
  return { options, verticals: reconstructVerticalSpreads(options) };
}

describe('validateOptionTradeOwnership', () => {
  it('accepts an exact spread and ungrouped partition', () => {
    const { options, verticals } = reconstruct();

    expect(validateOptionTradeOwnership(options, verticals)).toEqual({
      valid: true,
      affectedLotIds: [],
      message: '',
    });
  });

  it('rejects a spread reference to a missing reconstructed lot', () => {
    const { options, verticals } = reconstruct();
    const spread = verticals.spreads[0]!;
    const result = validateOptionTradeOwnership(options, {
      ...verticals,
      spreads: [
        {
          ...spread,
          lowerStrikeLeg: { ...spread.lowerStrikeLeg, lotId: 'missing-lot' },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.affectedLotIds).toContain('missing-lot');
    expect(result.message).toContain('Spread references missing lot missing-lot.');
  });

  it('rejects spread evidence that does not match its referenced lot', () => {
    const { options, verticals } = reconstruct();
    const spread = verticals.spreads[0]!;
    const result = validateOptionTradeOwnership(options, {
      ...verticals,
      spreads: [
        {
          ...spread,
          lowerStrikeLeg: { ...spread.lowerStrikeLeg, direction: 'short' },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain(
      `Spread ownership does not match lot ${spread.lowerStrikeLeg.lotId}.`,
    );
  });

  it('rejects ungrouped ownership of a missing reconstructed lot', () => {
    const { options, verticals } = reconstruct();
    const ownership = verticals.ungrouped[0]!;
    const result = validateOptionTradeOwnership(options, {
      ...verticals,
      ungrouped: [{ ...ownership, lotId: 'missing-lot' }],
    });

    expect(result.valid).toBe(false);
    expect(result.affectedLotIds).toContain('missing-lot');
    expect(result.message).toContain('Ungrouped ownership references missing lot missing-lot.');
  });

  it('rejects duplicate mutually exclusive ungrouped ownership', () => {
    const { options, verticals } = reconstruct();
    const ownership = verticals.ungrouped[0]!;
    const result = validateOptionTradeOwnership(options, {
      ...verticals,
      ungrouped: [ownership, ownership],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain(
      `Lot ${ownership.lotId} has duplicate mutually exclusive ownership.`,
    );
  });

  it('rejects an ungrouped allocation that disagrees with spread ownership', () => {
    const { options, verticals } = reconstruct();
    const ownership = verticals.ungrouped[0]!;
    const result = validateOptionTradeOwnership(options, {
      ...verticals,
      ungrouped: [
        {
          ...ownership,
          allocatedQuantity: ownership.allocatedQuantity.plus(1),
          ungroupedQuantity: ownership.ungroupedQuantity.minus(1),
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain(
      `Allocated quantity disagrees with spread ownership for lot ${ownership.lotId}.`,
    );
  });

  it('rejects duplicate reconstructed lot identities', () => {
    const { options, verticals } = reconstruct();
    const lifecycle = options.lifecycles[0]!;
    const result = validateOptionTradeOwnership(
      { lifecycles: [...options.lifecycles, lifecycle] },
      verticals,
    );

    expect(result.valid).toBe(false);
    expect(result.message).toContain(`Duplicate reconstructed lot ${lifecycle.lots[0]!.id}.`);
  });
});
