import { Decimal } from 'decimal.js';

import type { OptionLotMatch } from '../option-reconstruction/types.js';

export interface AttributedOptionMatch {
  readonly matchId: string;
  readonly closingActivityId: string;
  readonly closedOn: string;
  readonly closedAt?: string;
  readonly closingTimestampPrecision: OptionLotMatch['closingTimestampPrecision'];
  readonly closingSourceIndex: number;
  readonly quantity: Decimal;
  readonly grossRealizedPnl: Decimal;
  readonly fees?: Decimal;
  readonly netRealizedPnl?: Decimal;
}

function proportional(value: Decimal, quantity: Decimal, totalQuantity: Decimal): Decimal {
  return value.times(quantity).dividedBy(totalQuantity);
}

function remainingValue(
  value: Decimal,
  skippedQuantity: Decimal,
  attributedQuantity: Decimal,
  totalQuantity: Decimal,
): Decimal {
  const skippedValue = proportional(value, skippedQuantity, totalQuantity);
  const availableQuantity = totalQuantity.minus(skippedQuantity);
  return attributedQuantity.equals(availableQuantity)
    ? value.minus(skippedValue)
    : proportional(value, attributedQuantity, totalQuantity);
}

/** Attributes the FIFO match segment after a spread-owned opening-quantity prefix. */
export function attributeUngroupedOptionMatches(
  matches: readonly OptionLotMatch[],
  ownedQuantity: Decimal,
  spreadOwnedPrefix: Decimal,
): readonly AttributedOptionMatch[] {
  let quantityToSkip = spreadOwnedPrefix;
  let quantityToAttribute = ownedQuantity;
  const attributed: AttributedOptionMatch[] = [];

  for (const match of matches) {
    if (quantityToAttribute.isZero()) break;
    const skippedQuantity = Decimal.min(quantityToSkip, match.matchedQuantity);
    quantityToSkip = quantityToSkip.minus(skippedQuantity);
    const availableQuantity = match.matchedQuantity.minus(skippedQuantity);
    if (availableQuantity.isZero()) continue;

    const quantity = Decimal.min(quantityToAttribute, availableQuantity);
    const grossRealizedPnl = remainingValue(
      match.grossRealizedPnl,
      skippedQuantity,
      quantity,
      match.matchedQuantity,
    );
    const fees =
      match.openingFees === undefined || match.closingFees === undefined
        ? undefined
        : remainingValue(
            match.openingFees.plus(match.closingFees),
            skippedQuantity,
            quantity,
            match.matchedQuantity,
          );
    const netRealizedPnl =
      match.netRealizedPnl === undefined || fees === undefined
        ? undefined
        : grossRealizedPnl.minus(fees);

    attributed.push({
      matchId: match.id,
      closingActivityId: match.closingActivityId,
      closedOn: match.closedOn,
      ...(match.closedAt === undefined ? {} : { closedAt: match.closedAt }),
      closingTimestampPrecision: match.closingTimestampPrecision,
      closingSourceIndex: match.closingSourceIndex,
      quantity,
      grossRealizedPnl,
      ...(fees === undefined ? {} : { fees }),
      ...(netRealizedPnl === undefined ? {} : { netRealizedPnl }),
    });
    quantityToAttribute = quantityToAttribute.minus(quantity);
  }

  return attributed;
}
