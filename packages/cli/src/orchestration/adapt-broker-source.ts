import { basename } from 'node:path';

import type { BrokerActivity, Diagnostic, Execution } from '@trade-normalizer/core';

import { getBrokerAdapter, type SupportedBroker } from '../brokers/registry.js';
import { BrokerAdapterError, BrokerInputError } from '../errors/operational-error.js';
import { readUtf8File } from '../io/read-utf8-file.js';

const fatalAdapterCodes = new Set(['MALFORMED_CSV', 'INVALID_CSV_HEADERS']);

export interface AdaptBrokerSourceInput {
  readonly source: string;
  readonly sourceFile: string;
  readonly broker: string;
}

export interface AdaptBrokerFileInput {
  readonly filePath: string;
  readonly broker: string;
}

export interface AdaptedBrokerSource {
  readonly broker: SupportedBroker;
  readonly sourceFile: string;
  readonly sourceRecordCount: number;
  /** Empty for activity-only adapters; populated by execution-capable adapters. */
  readonly executions: readonly Execution[];
  readonly activities: readonly BrokerActivity[];
  readonly diagnostics: readonly Diagnostic[];
}

function fatalDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error' && fatalAdapterCodes.has(diagnostic.code),
  );
}

/** Parses and normalizes source text without reconstructing positions or logical Trades. */
export function adaptBrokerSource(input: AdaptBrokerSourceInput): AdaptedBrokerSource {
  const adapter = getBrokerAdapter(input.broker);
  const displayFile = basename(input.sourceFile);
  let adapted: ReturnType<typeof adapter.adapt>;

  try {
    adapted = adapter.adapt(input.source, {
      sourceId: `${adapter.broker}:${displayFile}`,
      sourceFile: displayFile,
    });
  } catch (error) {
    throw new BrokerAdapterError(adapter.broker, error);
  }

  const fatal = fatalDiagnostics(adapted.diagnostics);
  if (fatal.length > 0) throw new BrokerInputError(fatal);
  return {
    broker: adapter.broker,
    sourceFile: displayFile,
    sourceRecordCount: adapted.records.length,
    executions: adapted.executions ?? [],
    activities: adapted.activities,
    diagnostics: adapted.diagnostics,
  };
}

export async function adaptBrokerFile(input: AdaptBrokerFileInput): Promise<AdaptedBrokerSource> {
  const source = await readUtf8File(input.filePath);
  return adaptBrokerSource({ source, sourceFile: input.filePath, broker: input.broker });
}
