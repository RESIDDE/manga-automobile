// ─── Staff accounts ─────────────────────────────────────────────────────────
// Staff have no email. Admin gives each one a username and a password, and the
// login screen turns the username into a fixed internal address that Supabase
// Auth uses behind the scenes. Nobody ever types or sees that address.

export const STAFF_EMAIL_DOMAIN = "staff.manga.local";

/** "John.Doe " → "john.doe". Letters, digits, dot, dash and underscore only. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
}

export function isValidUsername(raw: string): boolean {
  const u = normalizeUsername(raw);
  return u.length >= 3 && u.length <= 32 && /^[a-z0-9]/.test(u);
}

export const staffEmail = (username: string) =>
  `${normalizeUsername(username)}@${STAFF_EMAIL_DOMAIN}`;

export const isStaffEmail = (email?: string | null) =>
  !!email && email.toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`);

/** A suggested username from a full name: "Ada Obi" → "ada.obi". */
export const suggestUsername = (fullName: string) => normalizeUsername(fullName);

/** Basic strength rule for passwords admin hands out. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use both letters and numbers";
  return null;
}
