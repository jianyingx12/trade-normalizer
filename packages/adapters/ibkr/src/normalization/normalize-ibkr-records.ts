import type {
  AdapterSourceContext,
  ExecutionAdapterNormalizationResult,
} from '@trade-normalizer/core';

import {
  createIbkrAdapterError,
  createIbkrAdapterWarning,
} from '../diagnostics/create-diagnostic.js';
import type { IbkrTradeConfirmationExecutionRecord } from '../parsing/ibkr-record.js';
import { normalizeIbkrExecutionRecord } from './normalize-ibkr-record.js';

function comparableRecord(record: IbkrTradeConfirmationExecutionRecord) {
  return {
    clientAccountId: record.clientAccountId,
    currencyPrimary: record.currencyPrimary,
    assetClass: record.assetClass,
    symbol: record.symbol,
    description: record.description,
    conid: record.conid,
    underlyingSymbol: record.underlyingSymbol,
    multiplier: record.multiplier,
    strike: record.strike,
    expiry: record.expiry,
    putCall: record.putCall,
    dateTime: record.dateTime,
    exchange: record.exchange,
    buySell: record.buySell,
    quantity: record.quantity,
    price: record.price,
    tradeId: record.tradeId,
    execId: record.execId,
    origTradeId: record.origTradeId,
    orderId: record.orderId,
    orderReference: record.orderReference,
    isApiOrder: record.isApiOrder,
    commission: record.commission,
    commissionCurrency: record.commissionCurrency,
  };
}

function differingFields(
  left: IbkrTradeConfirmationExecutionRecord,
  right: IbkrTradeConfirmationExecutionRecord,
): readonly string[] {
  const leftComparable = comparableRecord(left);
  const rightComparable = comparableRecord(right);
  return Object.keys(leftComparable).filter(
    (key) =>
      leftComparable[key as keyof typeof leftComparable] !==
      rightComparable[key as keyof typeof rightComparable],
  );
}

interface SeenExecution {
  readonly record: IbkrTradeConfirmationExecutionRecord;
  readonly executionId: string;
}

export function normalizeIbkrExecutionRecords(
  records: readonly IbkrTradeConfirmationExecutionRecord[],
  context: AdapterSourceContext,
): ExecutionAdapterNormalizationResult {
  const executions: ExecutionAdapterNormalizationResult['executions'][number][] = [];
  const activities: ExecutionAdapterNormalizationResult['activities'][number][] = [];
  const diagnostics: ExecutionAdapterNormalizationResult['diagnostics'][number][] = [];
  const seenByExecutionId = new Map<string, SeenExecution>();

  for (const record of records) {
    const normalized = normalizeIbkrExecutionRecord(record, context);
    diagnostics.push(...normalized.diagnostics);
    if (normalized.execution === undefined || normalized.activity === undefined) continue;

    const executionId = normalized.execution.id;
    const seen = seenByExecutionId.get(executionId);
    if (seen !== undefined) {
      const changedFields = differingFields(seen.record, record);
      const diagnosticOptions = {
        code: 'DUPLICATE_EXECUTION' as const,
        sourceIndexes: [seen.record.sourceIndex, record.sourceIndex],
        executionIds: [executionId],
        details: {
          executionId,
          firstSourceIndex: seen.record.sourceIndex,
          duplicateSourceIndex: record.sourceIndex,
          differingFields: changedFields,
        },
      };
      diagnostics.push(
        changedFields.length === 0
          ? createIbkrAdapterWarning({
              ...diagnosticOptions,
              message: 'Identical IBKR execution identity was repeated and emitted once.',
            })
          : createIbkrAdapterError({
              ...diagnosticOptions,
              message: 'Conflicting IBKR rows share one stable execution identity.',
            }),
      );
      continue;
    }

    seenByExecutionId.set(executionId, { record, executionId });
    executions.push(normalized.execution);
    activities.push(normalized.activity);
  }

  return { executions, activities, diagnostics };
}
