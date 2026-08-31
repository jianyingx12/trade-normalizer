import type {
  BrokerActivity,
  BrokerActivityType,
  BrokerId,
  Diagnostic,
  Trade,
} from '@trade-normalizer/core';

export const NORMALIZATION_SCHEMA_VERSION = '2' as const;

export interface NormalizationSource {
  readonly broker: BrokerId;
  /** Caller-controlled display path; orchestration never resolves it to a machine-specific path. */
  readonly file: string;
}

export interface NormalizationSummary {
  readonly sourceRecords: number;
  readonly executions: number;
  readonly activities: number;
  readonly trades: number;
  readonly diagnostics: number;
  readonly activityTypes: Readonly<Record<BrokerActivityType, number>>;
  readonly assetTypes: Readonly<Record<'equity' | 'option' | 'unspecified', number>>;
}

export interface NormalizationEnvelope {
  readonly schemaVersion: typeof NORMALIZATION_SCHEMA_VERSION;
  readonly source: NormalizationSource;
  readonly summary: NormalizationSummary;
  readonly trades: readonly Trade[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface NormalizeBrokerActivitiesInput {
  readonly broker: BrokerId;
  readonly sourceFile: string;
  readonly sourceRecordCount: number;
  /** Confirmed execution evidence retained by an execution-capable source adapter. */
  readonly executionCount?: number;
  readonly activities: readonly BrokerActivity[];
  readonly diagnostics?: readonly Diagnostic[];
}
