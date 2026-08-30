import type {
  BrokerActivity,
  Diagnostic,
  ExecutionSide,
  OptionInstrument,
} from '@trade-normalizer/schemas';

/** A canonical activity with every fact required by option position reconstruction. */
export interface EligibleOptionTradeActivity extends BrokerActivity {
  readonly activityType: 'trade';
  readonly instrument: OptionInstrument;
  readonly side: ExecutionSide;
  readonly quantity: NonNullable<BrokerActivity['quantity']>;
  readonly price: NonNullable<BrokerActivity['price']>;
}

export interface PreparedOptionActivities {
  readonly activities: readonly EligibleOptionTradeActivity[];
  readonly diagnostics: readonly Diagnostic[];
}
