export const IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS = [
  'ClientAccountID',
  'CurrencyPrimary',
  'AssetClass',
  'Symbol',
  'Description',
  'Conid',
  'UnderlyingSymbol',
  'Multiplier',
  'Strike',
  'Expiry',
  'Put/Call',
  'Date/Time',
  'Exchange',
  'Buy/Sell',
  'Quantity',
  'Price',
  'TradeID',
  'ExecID',
  'OrigTradeID',
  'OrderID',
  'OrderReference',
  'IsAPIOrder',
  'Commission',
  'CommissionCurrency',
] as const;

export function hasExactIbkrTradeConfirmationExecutionHeaders(headers: readonly string[]): boolean {
  return (
    headers.length === IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS.length &&
    headers.every((header, index) => header === IBKR_TRADE_CONFIRMATION_EXECUTION_HEADERS[index])
  );
}
