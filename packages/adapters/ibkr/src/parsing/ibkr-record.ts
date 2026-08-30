export interface IbkrTradeConfirmationExecutionRecord {
  readonly clientAccountId: string;
  readonly currencyPrimary: string;
  readonly assetClass: string;
  readonly symbol: string;
  readonly description: string;
  readonly conid: string;
  readonly underlyingSymbol: string;
  readonly multiplier: string;
  readonly strike: string;
  readonly expiry: string;
  readonly putCall: string;
  readonly dateTime: string;
  readonly exchange: string;
  readonly buySell: string;
  readonly quantity: string;
  readonly price: string;
  readonly tradeId: string;
  readonly execId: string;
  readonly origTradeId: string;
  readonly orderId: string;
  readonly orderReference: string;
  readonly isApiOrder: string;
  readonly commission: string;
  readonly commissionCurrency: string;
  readonly sourceIndex: number;
}
