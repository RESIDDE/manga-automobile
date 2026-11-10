/**
 * Where a car physically is, and whether it is ours.
 *
 * `public.vehicles.inventory_type` is a three-way split:
 *   - `main`     — on our stand, ours to sell
 *   - `service`  — in the workshop, never offered for sale
 *   - `external` — snapped outside the stand; someone else's car that we broker
 *
 * **Always test positively.** A database that has not had the migration applied
 * returns rows with no `inventory_type` at all (the `select("*")` fallback), and
 * a "not main" test would then classify the entire fleet as brokered and relabel
 * its prices. Hence `isExternal` matches the value itself, and the one negative
 * test — `isSellableInventory` — excludes only the workshop.
 */

export const INVENTORY_MAIN = "main";
export const INVENTORY_SERVICE = "service";
export const INVENTORY_EXTERNAL = "external";

export type InventoryType = "main" | "service" | "external";

type HasInventoryType = { inventory_type?: string | null };

/** Anything unreadable or unknown reads as stand stock — the safe default. */
export function inventoryTypeOf(vehicle: HasInventoryType): InventoryType {
  const value = vehicle?.inventory_type;
  if (value === INVENTORY_SERVICE) return INVENTORY_SERVICE;
  if (value === INVENTORY_EXTERNAL) return INVENTORY_EXTERNAL;
  return INVENTORY_MAIN;
}

/** On our stand. */
export const isStand = (vehicle: HasInventoryType): boolean =>
  inventoryTypeOf(vehicle) === INVENTORY_MAIN;

/** Snapped outside the stand — brokered, priced actual + office. */
export const isExternal = (vehicle: HasInventoryType): boolean =>
  inventoryTypeOf(vehicle) === INVENTORY_EXTERNAL;

/** Workshop only. */
export const isWorkshop = (vehicle: HasInventoryType): boolean =>
  inventoryTypeOf(vehicle) === INVENTORY_SERVICE;

/**
 * May be put on a sale or a quote: everything except the workshop. An outside
 * car qualifies — the dealership brokers it at the office price without ever
 * moving it onto the stand.
 */
export const isSellableInventory = (vehicle: HasInventoryType): boolean =>
  !isWorkshop(vehicle);

/** What to call it on screen. */
export function inventoryLabel(vehicle: HasInventoryType): string {
  switch (inventoryTypeOf(vehicle)) {
    case INVENTORY_SERVICE: return "Workshop";
    case INVENTORY_EXTERNAL: return "Outside";
    default: return "Stand";
  }
}
