import { parse } from 'csv-parse/sync';

import type { AdapterParseResult } from '@trade-normalizer/core';

import { createIbkrAdapterError } from '../diagnostics/create-diagnostic.js';
import {
  hasExactIbkrTradeConfirmationExecutionHeaders,
  IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS,
} from '../detection/headers.js';
import type { IbkrTradeConfirmationExecutionRecord } from './ibkr-record.js';

function cell(row: readonly string[], index: number): string {
  return row[index] ?? '';
}

export function parseIbkrTradeConfirmationExecutionCsv(
  source: string,
): AdapterParseResult<IbkrTradeConfirmationExecutionRecord> {
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
        createIbkrAdapterError({
          code: 'MALFORMED_CSV',
          message: 'IBKR Trade Confirmation CSV could not be parsed.',
          details: {
            reason: error instanceof Error ? error.message : 'Unknown CSV parser error',
          },
        }),
      ],
    };
  }

  const headers = rows[0] ?? [];
  if (!hasExactIbkrTradeConfirmationExecutionHeaders(headers)) {
    const expected = IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS as readonly string[];
    const missing = expected.filter((header) => !headers.includes(header));
    const unexpected = headers.filter((header) => !expected.includes(header));

    return {
      records: [],
      diagnostics: [
        createIbkrAdapterError({
          code: 'INVALID_CSV_HEADERS',
          message:
            'IBKR Trade Confirmation CSV headers do not match the required UTN execution profile.',
          details: {
            expected: [...expected],
            actual: headers,
            missing,
            unexpected,
          },
        }),
      ],
    };
  }

  const records = rows.slice(1).map((row, sourceIndex): IbkrTradeConfirmationExecutionRecord => ({
    clientAccountId: cell(row, 0),
    currencyPrimary: cell(row, 1),
    assetClass: cell(row, 2),
    symbol: cell(row, 3),
    description: cell(row, 4),
    conid: cell(row, 5),
    underlyingSymbol: cell(row, 6),
    multiplier: cell(row, 7),
    strike: cell(row, 8),
    expiry: cell(row, 9),
    putCall: cell(row, 10),
    dateTime: cell(row, 11),
    exchange: cell(row, 12),
    buySell: cell(row, 13),
    quantity: cell(row, 14),
    price: cell(row, 15),
    tradeId: cell(row, 16),
    execId: cell(row, 17),
    origTradeId: cell(row, 18),
    orderId: cell(row, 19),
    orderReference: cell(row, 20),
    isApiOrder: cell(row, 21),
    commission: cell(row, 22),
    commissionCurrency: cell(row, 23),
    sourceIndex,
  }));

  return { records, diagnostics: [] };
}
