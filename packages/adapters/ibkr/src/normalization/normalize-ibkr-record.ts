import {
  brokerActivitySchema,
  canonicalIdSchema,
  currencyCodeSchema,
  decimalSchema,
  equityInstrumentSchema,
  executionSchema,
  type AdapterSourceContext,
  type BrokerActivity,
  type Diagnostic,
  type Execution,
  type ExecutionSide,
  type SourceProvenanceInput,
} from '@trade-normalizer/core';

import { createIbkrAdapterError } from '../diagnostics/create-diagnostic.js';
import { parseIbkrDateTime } from '../parsing/date-time.js';
import type { IbkrTradeConfirmationExecutionRecord } from '../parsing/ibkr-record.js';

export interface IbkrRecordNormalizationResult {
  readonly execution?: Execution;
  readonly activity?: BrokerActivity;
  readonly diagnostics: readonly Diagnostic[];
}

function error(
  record: IbkrTradeConfirmationExecutionRecord,
  code: Parameters<typeof createIbkrAdapterError>[0]['code'],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): IbkrRecordNormalizationResult {
  return {
    diagnostics: [
      createIbkrAdapterError({
        code,
        message,
        sourceIndex: record.sourceIndex,
        ...(details === undefined ? {} : { details }),
      }),
    ],
  };
}

function nonBlank(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function sourceIdentity(record: IbkrTradeConfirmationExecutionRecord) {
  const execId = nonBlank(record.execId);
  const tradeId = nonBlank(record.tradeId);
  if (execId !== undefined) return { kind: 'execution', value: execId } as const;
  if (tradeId !== undefined) return { kind: 'trade', value: tradeId } as const;
  return undefined;
}

function brokerReferences(record: IbkrTradeConfirmationExecutionRecord) {
  const entries = {
    executionId: nonBlank(record.execId),
    tradeId: nonBlank(record.tradeId),
    originalTradeId: nonBlank(record.origTradeId),
    orderId: nonBlank(record.orderId),
    orderReference: nonBlank(record.orderReference),
    instrumentId: nonBlank(record.conid),
  };

  return Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function canonicalIds(accountId: string, kind: 'execution' | 'trade', brokerId: string) {
  const suffix = `${encodeURIComponent(accountId)}:${kind}:${encodeURIComponent(brokerId)}`;
  return {
    executionId: `ibkr:execution:${suffix}`,
    activityId: `ibkr:activity:${suffix}`,
  };
}

export function normalizeIbkrExecutionRecord(
  record: IbkrTradeConfirmationExecutionRecord,
  context: AdapterSourceContext,
): IbkrRecordNormalizationResult {
  if (record.assetClass.trim() !== 'STK') {
    return error(record, 'UNSUPPORTED_ASSET_TYPE', 'IBKR V1 supports only STK execution rows.', {
      assetClass: record.assetClass,
    });
  }

  const accountId = nonBlank(record.clientAccountId);
  if (accountId === undefined || accountId.length > 256) {
    return error(record, 'INVALID_EXECUTION_ID', 'IBKR execution has an invalid account ID.');
  }

  const identity = sourceIdentity(record);
  if (identity === undefined) {
    return error(
      record,
      'INVALID_EXECUTION_ID',
      'IBKR execution requires ExecID or TradeID identity.',
    );
  }

  const ids = canonicalIds(accountId, identity.kind, identity.value);
  if (
    !canonicalIdSchema.safeParse(ids.executionId).success ||
    !canonicalIdSchema.safeParse(ids.activityId).success
  ) {
    return error(record, 'INVALID_EXECUTION_ID', 'IBKR execution identity is too long.');
  }

  const instrumentResult = equityInstrumentSchema.safeParse({
    assetType: 'equity',
    symbol: record.symbol.trim(),
  });
  if (!instrumentResult.success) {
    return error(record, 'INVALID_INSTRUMENT', 'IBKR equity symbol is invalid.', {
      symbol: record.symbol,
    });
  }

  const sideText = record.buySell.trim();
  const side: ExecutionSide | undefined =
    sideText === 'BUY' ? 'buy' : sideText === 'SELL' ? 'sell' : undefined;
  if (side === undefined) {
    return error(record, 'INVALID_EXECUTION_SIDE', 'IBKR Buy/Sell must be BUY or SELL.', {
      buySell: record.buySell,
    });
  }

  const quantityResult = decimalSchema.safeParse(record.quantity.trim());
  if (!quantityResult.success || quantityResult.data.isZero()) {
    return error(record, 'INVALID_QUANTITY', 'IBKR execution quantity must be a nonzero decimal.', {
      quantity: record.quantity,
    });
  }
  const expectedQuantitySign = side === 'buy' ? 'positive' : 'negative';
  const quantitySignMatches =
    (side === 'buy' && quantityResult.data.gt(0)) || (side === 'sell' && quantityResult.data.lt(0));
  if (!quantitySignMatches) {
    return error(record, 'QUANTITY_SIDE_CONFLICT', 'IBKR quantity sign conflicts with Buy/Sell.', {
      buySell: sideText,
      quantity: record.quantity,
      expectedQuantitySign,
    });
  }

  const priceResult = decimalSchema.safeParse(record.price.trim());
  if (!priceResult.success || !priceResult.data.gt(0)) {
    return error(record, 'INVALID_PRICE', 'IBKR execution price must be a positive decimal.', {
      price: record.price,
    });
  }

  const time = parseIbkrDateTime(record.dateTime.trim());
  if (time === undefined) {
    return error(
      record,
      'INVALID_TIMESTAMP',
      'IBKR Date/Time must use a valid yyyyMMdd;HHmmss local datetime.',
      { dateTime: record.dateTime },
    );
  }

  const currency = record.currencyPrimary.trim();
  if (!currencyCodeSchema.safeParse(currency).success) {
    return error(record, 'INVALID_CURRENCY', 'IBKR primary currency is invalid.', {
      currency: record.currencyPrimary,
    });
  }

  const commissionText = record.commission.trim();
  let reportedCommission;
  if (commissionText !== '') {
    const commissionResult = decimalSchema.safeParse(commissionText);
    if (!commissionResult.success) {
      return error(record, 'INVALID_COMMISSION', 'IBKR commission must be a decimal string.', {
        commission: record.commission,
      });
    }
    const commissionCurrency = record.commissionCurrency.trim();
    if (!currencyCodeSchema.safeParse(commissionCurrency).success) {
      return error(record, 'INVALID_CURRENCY', 'IBKR commission currency is invalid.', {
        commissionCurrency: record.commissionCurrency,
      });
    }
    reportedCommission = {
      amount: commissionResult.data,
      currency: commissionCurrency,
      effect: commissionResult.data.lt(0)
        ? ('charge' as const)
        : commissionResult.data.gt(0)
          ? ('rebate' as const)
          : ('zero' as const),
    };
  }

  const isApiOrderText = record.isApiOrder.trim();
  if (isApiOrderText !== 'Y' && isApiOrderText !== 'N') {
    return error(record, 'INVALID_SOURCE_METADATA', 'IBKR IsAPIOrder must be Y or N.', {
      isApiOrder: record.isApiOrder,
    });
  }

  const references = brokerReferences(record);
  const provenance: SourceProvenanceInput = {
    brokerTransactionId: identity.value,
    ...(Object.keys(references).length === 0 ? {} : { brokerReferences: references }),
    brokerMetadata: {
      assetClass: record.assetClass.trim(),
      exchange: record.exchange.trim(),
      isApiOrder: isApiOrderText === 'Y' ? 'true' : 'false',
    },
    ...(context.sourceFile === undefined ? {} : { sourceFile: context.sourceFile }),
    sourceIndex: record.sourceIndex,
    rawReference: `${context.sourceId}:record:${record.sourceIndex}`,
  };
  const quantity = quantityResult.data.abs();

  const execution = executionSchema.parse({
    id: ids.executionId,
    broker: 'ibkr',
    accountId,
    instrument: instrumentResult.data,
    side,
    quantity,
    price: priceResult.data,
    currency,
    ...(reportedCommission === undefined ? {} : { reportedCommission }),
    executionTime: {
      precision: 'local_datetime',
      localDateTime: time.localDateTime,
    },
    provenance,
  });
  const activity = brokerActivitySchema.parse({
    id: ids.activityId,
    executionId: execution.id,
    broker: execution.broker,
    accountId: execution.accountId,
    activityType: 'trade',
    instrument: execution.instrument,
    activityDate: time.activityDate,
    localDateTime: time.localDateTime,
    timestampPrecision: 'local_datetime',
    side: execution.side,
    quantity: execution.quantity,
    price: execution.price,
    currency: execution.currency,
    ...(execution.reportedCommission === undefined
      ? {}
      : { reportedCommission: execution.reportedCommission }),
    provenance: execution.provenance,
  });

  return { execution, activity, diagnostics: [] };
}
