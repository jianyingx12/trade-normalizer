import type { BrokerActivity, BrokerId, Diagnostic, Execution } from '@trade-normalizer/schemas';

export interface BrokerAdapterDescriptor {
  readonly broker: BrokerId;
  readonly packageName: string;
}

/** Identifies one adapter input within the caller's import operation. */
export interface AdapterSourceContext {
  readonly sourceId: string;
  readonly sourceFile?: string;
}

export interface AdapterParseResult<TParsedRecord> {
  readonly records: readonly TParsedRecord[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface AdapterNormalizationResult {
  readonly activities: readonly BrokerActivity[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface BrokerAdapterResult<TParsedRecord> extends AdapterNormalizationResult {
  readonly records: readonly TParsedRecord[];
}

export interface ExecutionAdapterNormalizationResult extends AdapterNormalizationResult {
  readonly executions: readonly Execution[];
}

export interface ExecutionCapableBrokerAdapterResult<TParsedRecord>
  extends BrokerAdapterResult<TParsedRecord>, ExecutionAdapterNormalizationResult {}

/**
 * Base public contract for adapters that normalize source records into BrokerActivity.
 * Sources that prove fill-level facts may implement ExecutionCapableBrokerAdapter.
 */
export interface BrokerActivityAdapter<TParsedRecord> extends BrokerAdapterDescriptor {
  detect(source: string): boolean;
  parse(source: string): AdapterParseResult<TParsedRecord>;
  normalize(
    records: readonly TParsedRecord[],
    context: AdapterSourceContext,
  ): AdapterNormalizationResult;
  adapt(source: string, context: AdapterSourceContext): BrokerAdapterResult<TParsedRecord>;
}

/** Additive capability for a source that can truthfully produce canonical executions. */
export interface ExecutionCapableBrokerAdapter<
  TParsedRecord,
> extends BrokerActivityAdapter<TParsedRecord> {
  normalize(
    records: readonly TParsedRecord[],
    context: AdapterSourceContext,
  ): ExecutionAdapterNormalizationResult;
  adapt(
    source: string,
    context: AdapterSourceContext,
  ): ExecutionCapableBrokerAdapterResult<TParsedRecord>;
}
