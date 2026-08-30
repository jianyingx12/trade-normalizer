import { describe, expect, it } from 'vitest';

import { classifyVerticalStructure } from './classify-vertical.js';

describe('classifyVerticalStructure', () => {
  it.each([
    ['call', 'long', 'short', 'bull_call_spread'],
    ['call', 'short', 'long', 'bear_call_spread'],
    ['put', 'long', 'short', 'bull_put_spread'],
    ['put', 'short', 'long', 'bear_put_spread'],
  ] as const)(
    'classifies %s lower=%s higher=%s as %s',
    (optionType, lowerDirection, higherDirection, strategy) => {
      expect(classifyVerticalStructure(optionType, lowerDirection, higherDirection)).toBe(strategy);
    },
  );

  it.each([
    ['call', 'long', 'long'],
    ['put', 'short', 'short'],
  ] as const)('does not classify same-direction %s legs', (optionType, lower, higher) => {
    expect(classifyVerticalStructure(optionType, lower, higher)).toBeUndefined();
  });
});
