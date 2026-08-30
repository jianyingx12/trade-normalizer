import type { Diagnostic } from '@trade-normalizer/core';

import type { SupportedBroker } from '../brokers/registry.js';
import type { ActivityCounts } from '../summaries/activity-counts.js';

export interface InspectionReport extends ActivityCounts {
  readonly broker: SupportedBroker;
  readonly file: string;
  readonly sourceRecords: number;
  readonly activities: number;
  readonly supportedRecords: number;
  readonly unsupportedRecords: number;
  readonly dateRange?: {
    readonly first: string;
    readonly last: string;
  };
  readonly diagnostics: readonly Diagnostic[];
}
