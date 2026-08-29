/** Brokers represented by the initial workspace adapter packages. */
export const SUPPORTED_BROKERS = ['robinhood', 'ibkr', 'webull'] as const;

export type BrokerId = (typeof SUPPORTED_BROKERS)[number];
