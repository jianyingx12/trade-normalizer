import { parse } from 'csv-parse/sync';

import type { AdapterParseResult } from '@trade-normalizer/core';

import { createAdapterError } from '../diagnostics/create-diagnostic.js';
import {
  ROBINHOOD_ACTIVITY_HEADERS,
  hasExactRobinhoodActivityHeaders,
} from '../detection/headers.js';
import type { RobinhoodActivityRecord } from './robinhood-record.js';

function cell(row: readonly string[], index: number): string {
  return row[index] ?? '';
}

export function parseRobinhoodActivityCsv(
  source: string,
): AdapterParseResult<RobinhoodActivityRecord> {
  let rows: string[][];

  try {
    rows = parse(source, {
      bom: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch (error) {
    return {
      records: [],
      diagnostics: [
        createAdapterError({
          code: 'MALFORMED_CSV',
          message: 'Robinhood activity CSV could not be parsed.',
          details: {
            reason: error instanceof Error ? error.message : 'Unknown CSV parser error',
          },
        }),
      ],
    };
  }

  const headers = rows[0] ?? [];
  if (!hasExactRobinhoodActivityHeaders(headers)) {
    const missing = ROBINHOOD_ACTIVITY_HEADERS.filter((header) => !headers.includes(header));
    const unexpected = headers.filter(
      (header) => !(ROBINHOOD_ACTIVITY_HEADERS as readonly string[]).includes(header),
    );

    return {
      records: [],
      diagnostics: [
        createAdapterError({
          code: 'INVALID_CSV_HEADERS',
          message: 'Robinhood activity CSV headers do not match the required observed format.',
          details: {
            expected: [...ROBINHOOD_ACTIVITY_HEADERS],
            actual: headers,
            missing,
            unexpected,
          },
        }),
      ],
    };
  }

  const records = rows.slice(1).map((row, sourceIndex): RobinhoodActivityRecord => ({
    activityDate: cell(row, 0),
    processDate: cell(row, 1),
    settleDate: cell(row, 2),
    instrument: cell(row, 3),
    description: cell(row, 4),
    transactionCode: cell(row, 5),
    quantity: cell(row, 6),
    price: cell(row, 7),
    amount: cell(row, 8),
    sourceIndex,
  }));

  return { records, diagnostics: [] };
}
