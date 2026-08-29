import {
  brokerActivitySchema,
  decimalToString,
  equityInstrumentSchema,
  positiveDecimalSchema,
  type AdapterSourceContext,
  type BrokerActivity,
  type BrokerActivityType,
  type Diagnostic,
  type EquityInstrument,
} from '@trade-normalizer/core';

import { createAdapterError, createAdapterWarning } from '../diagnostics/create-diagnostic.js';
import { parseRobinhoodCurrency } from '../parsing/currency.js';
import { parseRobinhoodActivityDate } from '../parsing/date.js';
import type { RobinhoodActivityRecord } from '../parsing/robinhood-record.js';

interface NormalizedRecordResult {
  readonly activity?: BrokerActivity;
  readonly diagnostics: readonly Diagnostic[];
}

const NON_TRADE_ACTIVITY_TYPES: Readonly<Record<string, BrokerActivityType>> = {
  CDIV: 'dividend',
  ACH: 'deposit',
  GOLD: 'fee',
  SPL: 'split',
};

function createActivityId(context: AdapterSourceContext, sourceIndex: number): string {
  return `robinhood:activity:${encodeURIComponent(context.sourceId)}:${sourceIndex}`;
}

function createProvenance(context: AdapterSourceContext, sourceIndex: number) {
  return {
    sourceIndex,
    ...(context.sourceFile === undefined ? {} : { sourceFile: context.sourceFile }),
  };
}

function parseInstrument(
  record: RobinhoodActivityRecord,
  required: boolean,
  diagnostics: Diagnostic[],
): EquityInstrument | undefined {
  const symbol = record.instrument.trim();
  if (symbol.length === 0) {
    if (required) {
      diagnostics.push(
        createAdapterError({
          code: 'INVALID_INSTRUMENT',
          message: 'Robinhood trade activity requires an equity instrument symbol.',
          sourceIndex: record.sourceIndex,
        }),
      );
    }
    return undefined;
  }

  const result = equityInstrumentSchema.safeParse({
    assetType: 'equity',
    symbol,
  });

  if (!result.success) {
    diagnostics.push(
      createAdapterError({
        code: 'INVALID_INSTRUMENT',
        message: `Robinhood instrument "${record.instrument}" is not a canonical equity symbol.`,
        sourceIndex: record.sourceIndex,
      }),
    );
    return undefined;
  }

  return result.data;
}

function normalizeTradeRecord(
  record: RobinhoodActivityRecord,
  context: AdapterSourceContext,
  activityDate: string,
): NormalizedRecordResult {
  const diagnostics: Diagnostic[] = [];
  const instrument = parseInstrument(record, true, diagnostics);
  const quantity = positiveDecimalSchema.safeParse(record.quantity.trim());
  const price = parseRobinhoodCurrency(record.price, false);
  const grossAmount = parseRobinhoodCurrency(record.amount, true);

  if (!quantity.success) {
    diagnostics.push(
      createAdapterError({
        code: 'INVALID_QUANTITY',
        message: `Robinhood trade quantity "${record.quantity}" is invalid.`,
        sourceIndex: record.sourceIndex,
      }),
    );
  }

  if (!price.success) {
    diagnostics.push(
      createAdapterError({
        code: 'INVALID_PRICE',
        message: `Robinhood trade price "${record.price}" is invalid.`,
        sourceIndex: record.sourceIndex,
      }),
    );
  }

  if (!grossAmount.success) {
    diagnostics.push(
      createAdapterError({
        code: 'INVALID_AMOUNT',
        message: `Robinhood trade amount "${record.amount}" is invalid.`,
        sourceIndex: record.sourceIndex,
      }),
    );
  }

  if (instrument === undefined || !quantity.success || !price.success || !grossAmount.success) {
    return { diagnostics };
  }

  const expectedGrossAmount = quantity.data.times(price.value);
  if (!grossAmount.value.abs().equals(expectedGrossAmount)) {
    diagnostics.push(
      createAdapterWarning({
        code: 'AMOUNT_RECONCILIATION_MISMATCH',
        message: 'Robinhood trade gross amount does not equal quantity multiplied by price.',
        sourceIndex: record.sourceIndex,
        details: {
          actualAbsoluteGrossAmount: decimalToString(grossAmount.value.abs()),
          expectedAbsoluteGrossAmount: decimalToString(expectedGrossAmount),
          quantity: decimalToString(quantity.data),
          price: decimalToString(price.value),
        },
      }),
    );
  }

  const activity = brokerActivitySchema.parse({
    id: createActivityId(context, record.sourceIndex),
    broker: 'robinhood',
    activityType: 'trade',
    instrument,
    activityDate,
    timestampPrecision: 'date',
    side: record.transactionCode === 'Buy' ? 'buy' : 'sell',
    quantity: quantity.data,
    price: price.value,
    grossAmount: grossAmount.value,
    provenance: createProvenance(context, record.sourceIndex),
  });

  return { activity, diagnostics };
}

function normalizeNonTradeRecord(
  record: RobinhoodActivityRecord,
  context: AdapterSourceContext,
  activityDate: string,
): NormalizedRecordResult {
  const diagnostics: Diagnostic[] = [];
  const mappedType = NON_TRADE_ACTIVITY_TYPES[record.transactionCode];
  const activityType = mappedType ?? 'unknown';

  if (mappedType === undefined) {
    diagnostics.push(
      createAdapterWarning({
        code: 'UNKNOWN_TRANSACTION_TYPE',
        message: `Robinhood transaction code "${record.transactionCode}" is not supported.`,
        sourceIndex: record.sourceIndex,
        details: { transactionCode: record.transactionCode },
      }),
    );
  }

  const instrument = parseInstrument(record, false, diagnostics);
  const grossAmount =
    record.amount.trim().length === 0 ? undefined : parseRobinhoodCurrency(record.amount, true);

  if (grossAmount !== undefined && !grossAmount.success) {
    diagnostics.push(
      createAdapterError({
        code: 'INVALID_AMOUNT',
        message: `Robinhood activity amount "${record.amount}" is invalid.`,
        sourceIndex: record.sourceIndex,
      }),
    );
  }

  const activity = brokerActivitySchema.parse({
    id: createActivityId(context, record.sourceIndex),
    broker: 'robinhood',
    activityType,
    activityDate,
    timestampPrecision: 'date',
    provenance: createProvenance(context, record.sourceIndex),
    ...(instrument === undefined ? {} : { instrument }),
    ...(grossAmount === undefined || !grossAmount.success
      ? {}
      : { grossAmount: grossAmount.value }),
  });

  return { activity, diagnostics };
}

export function normalizeRobinhoodRecord(
  record: RobinhoodActivityRecord,
  context: AdapterSourceContext,
): NormalizedRecordResult {
  const activityDate = parseRobinhoodActivityDate(record.activityDate);
  if (activityDate === undefined) {
    return {
      diagnostics: [
        createAdapterError({
          code: 'INVALID_ACTIVITY_DATE',
          message: `Robinhood activity date "${record.activityDate}" is invalid.`,
          sourceIndex: record.sourceIndex,
        }),
      ],
    };
  }

  if (record.transactionCode === 'Buy' || record.transactionCode === 'Sell') {
    return normalizeTradeRecord(record, context, activityDate);
  }

  return normalizeNonTradeRecord(record, context, activityDate);
}
