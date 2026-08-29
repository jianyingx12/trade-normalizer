import type { BrokerId } from '@trade-normalizer/schemas';

export type { BrokerId } from '@trade-normalizer/schemas';

/** Contract implemented by broker adapter package descriptors. */
export interface BrokerAdapterDescriptor {
  readonly broker: BrokerId;
  readonly packageName: string;
}
