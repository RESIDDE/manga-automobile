/**
 * Cars leaving and returning to the stand.
 *
 * Every sign-out and sign-in is a row in `public.vehicle_movements`. Whether a
 * car is currently out is **derived from the latest row**, never stored as a
 * flag on the vehicle — the same rule `soldPrice.ts` and `receipts.ts` follow.
 * A stored flag drifts the moment one write succeeds and the other fails; a
 * derived answer cannot.
 */

export type MovementDirection = "out" | "in";

export type MovementRow = {
  id: string;
  vehicle_id: string;
  direction: MovementDirection | string;
  person_name?: string | null;
  person_phone?: string | null;
  reason?: string | null;
  destination?: string | null;
  expected_return?: string | null;
  notes?: string | null;
  recorded_by_name?: string | null;
  moved_at?: string | null;
  created_at?: string | null;
};

export type MovementState = {
  isOut: boolean;
  /** Who has it (when out), or who brought it back (when in). */
  person: string | null;
  reason: string | null;
  /** When the latest movement happened. */
  since: string | null;
  expectedReturn: string | null;
  /** Out, and past the time it was expected back. */
  overdue: boolean;
};

export const ON_STAND: MovementState = {
  isOut: false,
  person: null,
  reason: null,
  since: null,
  expectedReturn: null,
  overdue: false,
};

const timeOf = (row: MovementRow): number => {
  const raw = row.moved_at || row.created_at;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** Movements for one vehicle, newest first. */
export function movementsFor(rows: MovementRow[], vehicleId: string): MovementRow[] {
  return rows
    .filter((r) => r.vehicle_id === vehicleId)
    .sort((a, b) => timeOf(b) - timeOf(a));
}

function stateFrom(latest: MovementRow, now: number): MovementState {
  const isOut = latest.direction === "out";
  const expectedReturn = latest.expected_return ?? null;
  const expected = expectedReturn ? new Date(expectedReturn).getTime() : NaN;

  return {
    isOut,
    person: latest.person_name ?? null,
    reason: latest.reason ?? null,
    since: latest.moved_at || latest.created_at || null,
    expectedReturn,
    overdue: isOut && !Number.isNaN(expected) && expected < now,
  };
}

/**
 * vehicle id → current state. A vehicle with no movements is on the stand, so
 * it is simply absent from the map and callers fall back to `ON_STAND`.
 */
export function buildMovementMap(
  rows: MovementRow[],
  now: number = Date.now()
): Map<string, MovementState> {
  const latest = new Map<string, MovementRow>();

  for (const row of rows) {
    if (!row.vehicle_id) continue;
    const held = latest.get(row.vehicle_id);
    // Ties go to the row that arrives later, which matches insertion order
    if (!held || timeOf(row) >= timeOf(held)) latest.set(row.vehicle_id, row);
  }

  const map = new Map<string, MovementState>();
  for (const [vehicleId, row] of latest) map.set(vehicleId, stateFrom(row, now));
  return map;
}

/** The state of one vehicle, defaulting to on-stand. */
export function movementStateOf(
  vehicleId: string,
  map: Map<string, MovementState>
): MovementState {
  return map.get(vehicleId) ?? ON_STAND;
}

/**
 * How many of these vehicles are physically on the stand right now, and how
 * many are signed out. This is the count the stand page shows.
 */
export function standCount(
  vehicles: { id: string }[],
  map: Map<string, MovementState>
): { total: number; onStand: number; signedOut: number } {
  let signedOut = 0;
  for (const v of vehicles) {
    if (movementStateOf(v.id, map).isOut) signedOut += 1;
  }
  return { total: vehicles.length, onStand: vehicles.length - signedOut, signedOut };
}

/** "Out · Musa Ibrahim" / "On stand" — the pill caption. */
export function movementLabel(state: MovementState): string {
  if (!state.isOut) return "On stand";
  return state.person ? `Out · ${state.person}` : "Out";
}
