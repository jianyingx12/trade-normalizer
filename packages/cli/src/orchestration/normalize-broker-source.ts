import { basename } from 'node:path';

import type { Diagnostic } from '@trade-normalizer/core';

import { getBrokerAdapter } from '../brokers/registry.js';
import { BrokerAdapterError, BrokerInputError } from '../errors/operational-error.js';
import { readUtf8File } from '../io/read-utf8-file.js';
import type { NormalizationEnvelope } from '../output/types.js';
import { normalizeBrokerActivities } from './normalize-broker-activities.js';

const fatalAdapterCodes = new Set(['MALFORMED_CSV', 'INVALID_CSV_HEADERS']);

export interface NormalizeBrokerSourceInput {
  readonly source: string;
  readonly sourceFile: string;
  readonly broker: string;
}

export interface NormalizeBrokerFileInput {
  readonly filePath: string;
  readonly broker: string;
}

function fatalDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error' && fatalAdapterCodes.has(diagnostic.code),
  );
}

/** Adapts in-memory broker text before invoking the broker-independent normalization pipeline. */
export function normalizeBrokerSource(input: NormalizeBrokerSourceInput): NormalizationEnvelope {
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

  return normalizeBrokerActivities({
    broker: adapter.broker,
    sourceFile: displayFile,
    sourceRecordCount: adapted.records.length,
    activities: adapted.activities,
    diagnostics: adapted.diagnostics,
  });
}

/** Reads one local UTF-8 file; the input path itself never appears in the output envelope. */
export async function normalizeBrokerFile(
  input: NormalizeBrokerFileInput,
): Promise<NormalizationEnvelope> {
  const source = await readUtf8File(input.filePath);
  return normalizeBrokerSource({ source, sourceFile: input.filePath, broker: input.broker });
}
