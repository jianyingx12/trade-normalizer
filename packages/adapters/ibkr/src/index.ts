import type { BrokerAdapterDescriptor } from '@trade-normalizer/core';

export {
  IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS,
  hasExactIbkrTradeConfirmationExecutionHeaders,
} from './detection/headers.js';
export { detectIbkrTradeConfirmationExecutionCsv } from './detection/detect-ibkr.js';
export { parseIbkrTradeConfirmationExecutionCsv } from './parsing/parse-ibkr-csv.js';
export type { IbkrTradeConfirmationExecutionRecord } from './parsing/ibkr-record.js';

export const ibkrAdapter: BrokerAdapterDescriptor = {
  broker: 'ibkr',
  packageName: '@trade-normalizer/adapter-ibkr',
};
