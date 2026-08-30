import type { Decimal } from 'decimal.js';

export function calculateOptionPremium(
  price: Decimal,
  quantity: Decimal,
  multiplier: number,
): Decimal {
  return price.times(quantity).times(multiplier);
}
