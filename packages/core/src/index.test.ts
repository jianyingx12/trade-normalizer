import { describe, expectTypeOf, it } from 'vitest';

import {
  createOptionInstrumentKey,
  parseOccOptionSymbol,
  reconstructEquityPositions,
  reconstructOptionPositions,
  reconstructVerticalSpreads,
  sameOptionInstrument,
  type BrokerAdapterDescriptor,
  type OptionInstrumentKey,
  type VerticalSpreadReconstructionResult,
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

  it('publishes the high-level option reconstruction API', () => {
    expectTypeOf(reconstructOptionPositions).toBeFunction();
    expectTypeOf<ReturnType<typeof reconstructOptionPositions>>().toHaveProperty('positions');
    expectTypeOf<ReturnType<typeof reconstructOptionPositions>>().toHaveProperty('openLots');
    expectTypeOf<ReturnType<typeof reconstructOptionPositions>>().toHaveProperty('matches');
    expectTypeOf<ReturnType<typeof reconstructOptionPositions>>().toHaveProperty('lifecycles');
    expectTypeOf<ReturnType<typeof reconstructOptionPositions>>().toHaveProperty('diagnostics');
  });

  it('publishes the high-level vertical spread reconstruction API', () => {
    expectTypeOf(reconstructVerticalSpreads).toBeFunction();
    expectTypeOf<
      ReturnType<typeof reconstructVerticalSpreads>
    >().toEqualTypeOf<VerticalSpreadReconstructionResult>();
    expectTypeOf<ReturnType<typeof reconstructVerticalSpreads>>().toHaveProperty('spreads');
    expectTypeOf<ReturnType<typeof reconstructVerticalSpreads>>().toHaveProperty('ungrouped');
    expectTypeOf<ReturnType<typeof reconstructVerticalSpreads>>().toHaveProperty('diagnostics');
  });
});
