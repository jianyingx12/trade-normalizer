import { robinhoodAdapter } from '@trade-normalizer/adapter-robinhood';
import type { AdapterSourceContext, BrokerAdapterResult } from '@trade-normalizer/core';

import { UnsupportedBrokerError } from '../errors/operational-error.js';

export const SUPPORTED_BROKERS = ['robinhood'] as const;
export type SupportedBroker = (typeof SUPPORTED_BROKERS)[number];

export interface RegisteredBrokerAdapter {
  readonly broker: SupportedBroker;
  detect(source: string): boolean;
  adapt(source: string, context: AdapterSourceContext): BrokerAdapterResult<unknown>;
}

const registry: Readonly<Record<SupportedBroker, RegisteredBrokerAdapter>> = {
  robinhood: {
    broker: 'robinhood',
    detect: (source) => robinhoodAdapter.detect(source),
    adapt: (source, context) => robinhoodAdapter.adapt(source, context),
  },
};

export function isSupportedBroker(broker: string): broker is SupportedBroker {
  return (SUPPORTED_BROKERS as readonly string[]).includes(broker);
}

export function getBrokerAdapter(broker: string): RegisteredBrokerAdapter {
  if (!isSupportedBroker(broker)) throw new UnsupportedBrokerError(broker, SUPPORTED_BROKERS);
  return registry[broker];
}
