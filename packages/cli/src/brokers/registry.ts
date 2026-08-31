import { ibkrAdapter } from '@trade-normalizer/adapter-ibkr';
import { robinhoodAdapter } from '@trade-normalizer/adapter-robinhood';
import type { AdapterSourceContext, BrokerAdapterResult, Execution } from '@trade-normalizer/core';

import { UnsupportedBrokerError } from '../errors/operational-error.js';

export const SUPPORTED_BROKERS = ['robinhood', 'ibkr'] as const;
export type SupportedBroker = (typeof SUPPORTED_BROKERS)[number];

export interface RegisteredBrokerAdapterResult extends BrokerAdapterResult<unknown> {
  readonly executions?: readonly Execution[];
}

export interface RegisteredBrokerAdapter {
  readonly broker: SupportedBroker;
  detect(source: string): boolean;
  adapt(source: string, context: AdapterSourceContext): RegisteredBrokerAdapterResult;
}

const registry: Readonly<Record<SupportedBroker, RegisteredBrokerAdapter>> = {
  robinhood: {
    broker: 'robinhood',
    detect: (source) => robinhoodAdapter.detect(source),
    adapt: (source, context) => robinhoodAdapter.adapt(source, context),
  },
  ibkr: {
    broker: 'ibkr',
    detect: (source) => ibkrAdapter.detect(source),
    adapt: (source, context) => ibkrAdapter.adapt(source, context),
  },
};

export function isSupportedBroker(broker: string): broker is SupportedBroker {
  return (SUPPORTED_BROKERS as readonly string[]).includes(broker);
}

export function getBrokerAdapter(broker: string): RegisteredBrokerAdapter {
  if (!isSupportedBroker(broker)) throw new UnsupportedBrokerError(broker, SUPPORTED_BROKERS);
  return registry[broker];
}
