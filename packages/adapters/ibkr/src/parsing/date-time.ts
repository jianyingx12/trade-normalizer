import { isoLocalDateTimeSchema } from '@trade-normalizer/core';

export interface ParsedIbkrDateTime {
  readonly activityDate: string;
  readonly localDateTime: string;
}

const IBKR_DATE_TIME_PATTERN = /^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/;

export function parseIbkrDateTime(value: string): ParsedIbkrDateTime | undefined {
  const match = IBKR_DATE_TIME_PATTERN.exec(value);
  if (match === null) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  const activityDate = `${year}-${month}-${day}`;
  const localDateTime = `${activityDate}T${hour}:${minute}:${second}`;
  if (!isoLocalDateTimeSchema.safeParse(localDateTime).success) return undefined;

  return { activityDate, localDateTime };
}
