import { describe, expect, it } from 'vitest';

import { SUPPORTED_BROKERS } from './index.js';

describe('@trade-normalizer/schemas', () => {
  it('exposes the initial broker identifiers in stable order', () => {
    expect(SUPPORTED_BROKERS).toEqual(['robinhood', 'ibkr', 'webull']);
  });
});
