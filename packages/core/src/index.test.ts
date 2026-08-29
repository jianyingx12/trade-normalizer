import { describe, expectTypeOf, it } from 'vitest';

import { reconstructEquityPositions, type BrokerAdapterDescriptor } from './index.js';

describe('@trade-normalizer/core', () => {
  it('publishes the adapter package boundary', () => {
    expectTypeOf<BrokerAdapterDescriptor>().toHaveProperty('broker');
    expectTypeOf<BrokerAdapterDescriptor>().toHaveProperty('packageName');
  });

  it('publishes the high-level equity reconstruction API', () => {
    expectTypeOf(reconstructEquityPositions).toBeFunction();
    expectTypeOf<ReturnType<typeof reconstructEquityPositions>>().toHaveProperty('positions');
    expectTypeOf<ReturnType<typeof reconstructEquityPositions>>().toHaveProperty('openLots');
    expectTypeOf<ReturnType<typeof reconstructEquityPositions>>().toHaveProperty('matches');
    expectTypeOf<ReturnType<typeof reconstructEquityPositions>>().toHaveProperty('lifecycles');
    expectTypeOf<ReturnType<typeof reconstructEquityPositions>>().toHaveProperty('diagnostics');
  });
});
