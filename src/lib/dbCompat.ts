/**
 * Tolerance for a database that is a migration behind the code.
 *
 * PostgREST rejects a whole statement when it mentions a column or table that
 * does not exist, so one unapplied migration can empty an entire page. These
 * helpers let a query ask for the new shape, notice that specific failure, and
 * fall back to the shape the database actually has.
 */

/** Postgres / PostgREST codes for "that column or table isn't there". */
const MISSING_SCHEMA_CODES = new Set([
  "42703", // undefined_column
  "42P01", // undefined_table
  "PGRST200", // could not find a relationship (a missing embedded table)
  "PGRST204", // column not found in the schema cache (writes)
]);

/** True when an error is specifically about missing schema, not about data. */
export function isMissingSchema(error: any, names: string[] = []): boolean {
  if (!error) return false;
  if (MISSING_SCHEMA_CODES.has(String(error.code))) return true;

  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (!message) return false;

  const schemaish =
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("relationship");
  if (!schemaish) return false;

  // When column names are supplied, insist the message mentions one of them, so
  // an unrelated "does not exist" is never swallowed.
  if (names.length === 0) return true;
  return names.some((name) => message.includes(name.toLowerCase()));
}

type Result<T> = { data: T; error: any };

/**
 * Runs `primary`; if it fails only because the database is missing the given
 * columns or tables, runs `fallback` instead. Any other error is rethrown, so a
 * real failure is never hidden.
 *
 * `onFallback` fires once per fallback, for a console note or a toast.
 */
export async function withSchemaFallback<T>(
  primary: () => PromiseLike<Result<T>>,
  fallback: () => PromiseLike<Result<T>>,
  names: string[] = [],
  onFallback?: (error: any) => void
): Promise<T> {
  const first = await primary();
  if (!first.error) return first.data;

  if (!isMissingSchema(first.error, names)) throw first.error;

  onFallback?.(first.error);
  const second = await fallback();
  if (second.error) throw second.error;
  return second.data;
}

/**
 * Tries each read in turn and returns the first that is not rejected for missing
 * schema. Attempts run newest-shape first, and the **last attempt must be one
 * that always works** (typically `select("*")`): a page showing heavier rows is
 * infinitely better than a page showing nothing.
 *
 * `onFallback` fires once, with the index actually used, when it is not the first.
 */
export async function firstWorkingSelect<T>(
  attempts: Array<() => PromiseLike<Result<T>>>,
  names: string[] = [],
  onFallback?: (usedIndex: number, error: any) => void
): Promise<T> {
  let lastError: any = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const { data, error } = await attempts[i]();
    if (!error) {
      if (i > 0) onFallback?.(i, lastError);
      return data;
    }
    // Anything that is not a schema gap is a real failure — surface it at once
    if (!isMissingSchema(error, names)) throw error;
    lastError = error;
  }

  throw lastError ?? new Error("No usable query shape");
}

/**
 * A copy of `payload` without the given keys, for a retry after PGRST204. The
 * return type keeps the original shape because the dropped keys are always the
 * not-yet-migrated ones, never required columns.
 */
export function omitKeys<T extends Record<string, any>>(payload: T, keys: string[]): T {
  const copy: Record<string, any> = { ...payload };
  for (const key of keys) delete copy[key];
  return copy as T;
}

/** One warning per missing-schema key per session, so a toast cannot spam. */
const warned = new Set<string>();

export function warnOnce(key: string, warn: () => void) {
  if (warned.has(key)) return;
  warned.add(key);
  warn();
}
