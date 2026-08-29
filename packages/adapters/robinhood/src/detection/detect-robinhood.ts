import { parse } from 'csv-parse/sync';

import { hasExactRobinhoodActivityHeaders } from './headers.js';

export function detectRobinhoodActivityCsv(source: string): boolean {
  try {
    const rows = parse(source, {
      bom: true,
      skip_empty_lines: true,
      to: 1,
    }) as string[][];

    const headers = rows[0];
    return headers !== undefined && hasExactRobinhoodActivityHeaders(headers);
  } catch {
    return false;
  }
}
