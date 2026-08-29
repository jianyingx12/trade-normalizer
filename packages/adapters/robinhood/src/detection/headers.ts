export const ROBINHOOD_ACTIVITY_HEADERS = [
  'Activity Date',
  'Process Date',
  'Settle Date',
  'Instrument',
  'Description',
  'Trans Code',
  'Quantity',
  'Price',
  'Amount',
] as const;

export function hasExactRobinhoodActivityHeaders(headers: readonly string[]): boolean {
  return (
    headers.length === ROBINHOOD_ACTIVITY_HEADERS.length &&
    headers.every((header, index) => header === ROBINHOOD_ACTIVITY_HEADERS[index])
  );
}
