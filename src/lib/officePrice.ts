/**
 * Pricing for cars snapped outside the stand.
 *
 * The dealership does not own these cars — it brokers them. The owner names an
 * **actual price**, and the office quotes the customer an **office price** 10%
 * higher. That 10% is the dealership's margin.
 *
 * Where the two figures live on `public.vehicles`:
 *   - `cost_price` → the actual (owner's) price
 *   - `price`      → the office price
 *
 * The office price goes in `price` on purpose: the sale picker, the proforma
 * invoice and `soldPrice.ts` all read `price`, so a brokered car sells and
 * quotes at the right figure with no changes to any of them. It also makes the
 * sold-tab maths come out right, since revenue − cost is then office − actual:
 * exactly the margin earned.
 */

/** The house markup: 10% on top of the owner's price. */
export const OFFICE_MARKUP = 0.1;

/** Tolerance when deciding whether a price still matches the standard markup. */
const NAIRA_TOLERANCE = 1;

const num = (value: number | string | null | undefined): number => {
  const n = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The office price for an actual price: actual + 10%, rounded to the naira so
 * that a figure re-typed by hand still compares equal to the suggestion.
 */
export function officePriceFor(actual: number | string | null | undefined): number {
  const base = num(actual);
  if (base <= 0) return 0;
  return Math.round(base * (1 + OFFICE_MARKUP));
}

/** What the office is making on the car, in naira. */
export function marginOf(
  actual: number | string | null | undefined,
  office: number | string | null | undefined
): number {
  return num(office) - num(actual);
}

/**
 * The markup actually applied, as a percentage. Null when there is no actual
 * price to measure against, so callers can hide the badge rather than show 0%.
 */
export function markupPercent(
  actual: number | string | null | undefined,
  office: number | string | null | undefined
): number | null {
  const base = num(actual);
  if (base <= 0) return null;
  return (marginOf(base, office) / base) * 100;
}

/**
 * True when the office price is still the standard +10% — i.e. nobody has
 * negotiated it. The form uses this to decide whether the office price should
 * keep following the actual price, and the lists use it to decide whether the
 * margin badge is muted or flagged.
 */
export function isStandardMarkup(
  actual: number | string | null | undefined,
  office: number | string | null | undefined
): boolean {
  const base = num(actual);
  if (base <= 0) return false;
  return Math.abs(num(office) - officePriceFor(base)) <= NAIRA_TOLERANCE;
}

/**
 * Whether the office price should still be recalculated when the actual price
 * changes.
 *
 * Two cases follow: the office price is still the standard +10% (nobody has
 * negotiated it), or there is no office price yet at all — a blank or zeroed
 * field on a fresh form. The second case is why `isStandardMarkup` cannot carry
 * this on its own: it is false for a brand-new form, which would leave the
 * office price stuck at 0 however the owner's price was typed.
 */
export function officeFollowsActual(
  actual: number | string | null | undefined,
  office: number | string | null | undefined
): boolean {
  if (num(office) <= 0) return true;
  return isStandardMarkup(actual, office);
}

/** "+10%" / "+14%" / "−5%" for the margin badge; null when there is nothing to show. */
export function markupLabel(
  actual: number | string | null | undefined,
  office: number | string | null | undefined
): string | null {
  const percent = markupPercent(actual, office);
  if (percent === null) return null;
  const rounded = Math.round(percent * 10) / 10;
  const sign = rounded < 0 ? "−" : "+";
  return `${sign}${Math.abs(rounded)}%`;
}

/** Totals for the outside-cars stat tiles. */
export function outsideTotals(
  vehicles: { price?: number | string | null; cost_price?: number | string | null }[]
): { units: number; actual: number; office: number; margin: number } {
  let actual = 0;
  let office = 0;
  for (const v of vehicles) {
    actual += num(v.cost_price);
    office += num(v.price);
  }
  return { units: vehicles.length, actual, office, margin: office - actual };
}
