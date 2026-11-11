/**
 * Finding the customer who is already on file.
 *
 * Nigerian numbers get typed every which way — 0801 234 5678, +234 801 234 5678,
 * 234-801-234-5678 — so a plain string comparison misses most duplicates. These
 * helpers compare the subscriber digits instead.
 */

export type CustomerLike = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

/**
 * The last 10 digits of a phone number, which is what identifies a Nigerian
 * subscriber whatever the prefix. Returns "" when there is nothing to compare.
 */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.slice(-10);
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return !!left && left === right;
}

/** Case- and spacing-insensitive name key. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type CustomerMatch = {
  customer: CustomerLike;
  /** `phone` is near-certain; `name` is worth a glance but not conclusive. */
  reason: "phone" | "name";
};

/**
 * Customers who look like the one being typed. A matching phone number is
 * reported first and on its own — if the number is already on file it is almost
 * certainly the same person, and showing name matches as well would only add noise.
 */
export function findCustomerMatches(
  customers: CustomerLike[],
  input: { name?: string | null; phone?: string | null },
  options: { excludeId?: string | null; limit?: number } = {}
): CustomerMatch[] {
  const { excludeId = null, limit = 3 } = options;
  const pool = customers.filter((c) => c.id !== excludeId);

  const phoneKey = normalizePhone(input.phone);
  if (phoneKey) {
    const byPhone = pool
      .filter((c) => normalizePhone(c.phone) === phoneKey)
      .map((customer): CustomerMatch => ({ customer, reason: "phone" }));
    if (byPhone.length > 0) return byPhone.slice(0, limit);
  }

  // Only suggest on name once there is enough of it to mean something
  const nameKey = normalizeName(input.name);
  if (nameKey.length >= 3) {
    return pool
      .filter((c) => {
        const candidate = normalizeName(c.name);
        return candidate === nameKey || candidate.includes(nameKey) || nameKey.includes(candidate);
      })
      .map((customer): CustomerMatch => ({ customer, reason: "name" }))
      .slice(0, limit);
  }

  return [];
}
