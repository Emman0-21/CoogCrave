/**
 * Order pricing (PRD §6, rule 1). Pure integer-cent arithmetic: no floating point touches money.
 *
 *   subtotal    = Σ (unit price + Σ option deltas) × quantity
 *   service fee = clamp(roundHalfUp(subtotal × serviceFeeBps / 10 000), min, max)
 *   tax         = roundHalfUp((subtotal + service fee) × taxRateBps / 10 000)   (sample rate)
 *   total       = subtotal + delivery fee + service fee + tax + tip
 *
 * Rounding happens once per amount, at the line it applies to, so the parts always add up to the total
 * (the database checks that too).
 */

export interface PricingConfig {
  deliveryFeeCents: number;
  serviceFeeBps: number;
  serviceFeeMinCents: number;
  serviceFeeMaxCents: number;
  taxRateBps: number;
  minSubtotalCents: number;
  maxTipCents: number;
}

export interface LineInput {
  unitPriceCents: number;
  optionDeltasCents: readonly number[];
  quantity: number;
}

export interface LinePrice {
  unitPriceCents: number;
  optionsTotalCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface PriceBreakdown {
  subtotalCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 20;
const BPS_DENOMINATOR = 10_000;

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of cents (got ${value}).`);
  }
}

/**
 * Rounds numerator / denominator to the nearest integer, halves rounding up. Both inputs are
 * non-negative integers, so integer arithmetic is exact: floor((2n + d) / 2d).
 */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  assertCents(numerator, "numerator");
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive integer (got ${denominator}).`);
  }
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Basis points of an amount, rounded half up: 825 bps of 2 203 cents is 181.7475 → 182. */
export function applyBps(amountCents: number, bps: number): number {
  assertCents(bps, "bps");
  return divideRoundHalfUp(amountCents * bps, BPS_DENOMINATOR);
}

export function priceLine(line: LineInput): LinePrice {
  assertCents(line.unitPriceCents, "unitPriceCents");
  line.optionDeltasCents.forEach((delta) => assertCents(delta, "option delta"));
  if (!Number.isInteger(line.quantity) || line.quantity < QUANTITY_MIN || line.quantity > QUANTITY_MAX) {
    throw new RangeError(`quantity must be ${QUANTITY_MIN}–${QUANTITY_MAX} (got ${line.quantity}).`);
  }
  const optionsTotalCents = line.optionDeltasCents.reduce((sum, delta) => sum + delta, 0);
  return {
    unitPriceCents: line.unitPriceCents,
    optionsTotalCents,
    quantity: line.quantity,
    lineTotalCents: (line.unitPriceCents + optionsTotalCents) * line.quantity,
  };
}

export function subtotalOf(lines: readonly LinePrice[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
}

export function serviceFeeFor(subtotalCents: number, config: PricingConfig): number {
  const raw = applyBps(subtotalCents, config.serviceFeeBps);
  return Math.min(config.serviceFeeMaxCents, Math.max(config.serviceFeeMinCents, raw));
}

export function isValidTip(tipCents: number, config: PricingConfig): boolean {
  return Number.isSafeInteger(tipCents) && tipCents >= 0 && tipCents <= config.maxTipCents;
}

export function meetsMinimumSubtotal(subtotalCents: number, config: PricingConfig): boolean {
  return subtotalCents >= config.minSubtotalCents;
}

/**
 * Full breakdown for a non-empty order. Callers check the minimum subtotal and tip range first and
 * report those as business errors; this function refuses invalid input outright.
 */
export function priceOrder(
  lines: readonly LinePrice[],
  tipCents: number,
  config: PricingConfig,
): PriceBreakdown {
  if (lines.length === 0) throw new RangeError("An order needs at least one line.");
  if (!isValidTip(tipCents, config)) throw new RangeError(`tip out of range (got ${tipCents}).`);
  const subtotalCents = subtotalOf(lines);
  const serviceFeeCents = serviceFeeFor(subtotalCents, config);
  const taxCents = applyBps(subtotalCents + serviceFeeCents, config.taxRateBps);
  const deliveryFeeCents = config.deliveryFeeCents;
  return {
    subtotalCents,
    deliveryFeeCents,
    serviceFeeCents,
    taxCents,
    tipCents,
    totalCents: subtotalCents + deliveryFeeCents + serviceFeeCents + taxCents + tipCents,
  };
}
