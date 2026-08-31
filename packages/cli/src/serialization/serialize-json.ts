import { Decimal } from 'decimal.js';
import { decimalToString } from '@trade-normalizer/core';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function convert(value: unknown, ancestors: WeakSet<object>): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Cannot serialize a non-finite number');
    return value;
  }
  if (Decimal.isDecimal(value)) return decimalToString(value);
  if (typeof value !== 'object') {
    throw new TypeError(`Cannot serialize value of type ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError('Cannot serialize a circular value');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => convert(item, ancestors) ?? null);
    }
    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const converted = convert(item, ancestors);
      if (converted !== undefined) result[key] = converted;
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** Converts Decimal values centrally and returns stable, newline-terminated JSON. */
export function serializeJson(value: unknown): string {
  const converted = convert(value, new WeakSet());
  if (converted === undefined) throw new TypeError('Cannot serialize undefined as a JSON document');
  return `${JSON.stringify(converted, null, 2)}\n`;
}
