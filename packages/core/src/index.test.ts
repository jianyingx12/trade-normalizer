import { describe, expectTypeOf, it } from 'vitest';

import type { BrokerAdapterDescriptor } from './index.js';

describe('@trade-normalizer/core', () => {
  it('publishes the adapter package boundary', () => {
    expectTypeOf<BrokerAdapterDescriptor>().toHaveProperty('broker');
    expectTypeOf<BrokerAdapterDescriptor>().toHaveProperty('packageName');
  });
});
