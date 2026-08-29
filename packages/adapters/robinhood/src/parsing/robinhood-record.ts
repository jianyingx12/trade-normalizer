export interface RobinhoodActivityRecord {
  readonly activityDate: string;
  readonly processDate: string;
  readonly settleDate: string;
  readonly instrument: string;
  readonly description: string;
  readonly transactionCode: string;
  readonly quantity: string;
  readonly price: string;
  readonly amount: string;
  readonly sourceIndex: number;
}
