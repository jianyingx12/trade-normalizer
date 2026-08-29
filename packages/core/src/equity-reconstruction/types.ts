import type {
  BrokerActivity,
  Diagnostic,
  EquityInstrument,
  ExecutionSide,
} from '@trade-normalizer/schemas';

/** A canonical activity with every fact required by long-equity reconstruction. */
export interface EligibleEquityTradeActivity extends BrokerActivity {
  readonly activityType: 'trade';
  readonly instrument: EquityInstrument;
  readonly side: ExecutionSide;
  readonly quantity: NonNullable<BrokerActivity['quantity']>;
  readonly price: NonNullable<BrokerActivity['price']>;
}

export interface PreparedEquityActivities {
  readonly activities: readonly EligibleEquityTradeActivity[];
  readonly diagnostics: readonly Diagnostic[];
}
