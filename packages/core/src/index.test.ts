import { describe, expectTypeOf, it } from 'vitest';

import {
  createOptionInstrumentKey,
  parseOccOptionSymbol,
  reconstructEquityPositions,
  sameOptionInstrument,
  type BrokerAdapterDescriptor,
  type OptionInstrumentKey,
} from './index.js';

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

  it('publishes canonical option identity utilities', () => {
    expectTypeOf(createOptionInstrumentKey).toBeFunction();
    expectTypeOf(createOptionInstrumentKey).returns.toEqualTypeOf<OptionInstrumentKey>();
    expectTypeOf(sameOptionInstrument).toBeFunction();
    expectTypeOf(sameOptionInstrument).returns.toBeBoolean();
  });

  it('publishes the OCC option symbol parser', () => {
    expectTypeOf(parseOccOptionSymbol).toBeFunction();
    expectTypeOf<ReturnType<typeof parseOccOptionSymbol>>().toHaveProperty('success');
  });
});
