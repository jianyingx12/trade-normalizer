import type { OptionType } from '@trade-normalizer/schemas';

import type { OptionPositionDirection } from '../option-reconstruction/types.js';
import type { VerticalSpreadStrategy } from './types.js';

export function classifyVerticalStructure(
  optionType: OptionType,
  lowerStrikeDirection: OptionPositionDirection,
  higherStrikeDirection: OptionPositionDirection,
): VerticalSpreadStrategy | undefined {
  if (lowerStrikeDirection === higherStrikeDirection) {
    return undefined;
  }

  if (optionType === 'call') {
    return lowerStrikeDirection === 'long' ? 'bull_call_spread' : 'bear_call_spread';
  }

  return lowerStrikeDirection === 'long' ? 'bull_put_spread' : 'bear_put_spread';
}
