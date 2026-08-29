import { decimalSchema } from '@trade-normalizer/core';

const CURRENCY_PATTERN = /^\$(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/;

export function parseRobinhoodCurrency(value: string, allowParentheses: boolean) {
  const trimmed = value.trim();
  const startsWithParenthesis = trimmed.startsWith('(');
  const endsWithParenthesis = trimmed.endsWith(')');

  if (startsWithParenthesis !== endsWithParenthesis) {
    return { success: false as const };
  }

  if (startsWithParenthesis && !allowParentheses) {
    return { success: false as const };
  }

  const unsigned = startsWithParenthesis ? trimmed.slice(1, -1) : trimmed;
  if (!CURRENCY_PATTERN.test(unsigned)) {
    return { success: false as const };
  }

  const decimal = decimalSchema.parse(unsigned.slice(1).replaceAll(',', ''));
  return {
    success: true as const,
    value: startsWithParenthesis ? decimal.negated() : decimal,
  };
}
