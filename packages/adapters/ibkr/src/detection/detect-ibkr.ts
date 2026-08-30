import { parse } from 'csv-parse/sync';

import { hasExactIbkrTradeConfirmationExecutionHeaders } from './headers.js';

export function detectIbkrTradeConfirmationExecutionCsv(source: string): boolean {
  try {
    const rows = parse(source, {
      bom: true,
      skip_empty_lines: true,
      to: 1,
    }) as string[][];

    const headers = rows[0];
    return headers !== undefined && hasExactIbkrTradeConfirmationExecutionHeaders(headers);
  } catch {
    return false;
  }
}
