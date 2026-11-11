/**
 * Sources are the companies and people vehicles are bought from. They are not
 * a table of their own: a source is every vehicle that names it in
 * `source_company`, grouped here. Adding a vehicle with a new name is all it
 * takes to add a source, which keeps the list in step with the records.
 */

export interface SourceVehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  status: string | null;
  cost_price: number | null;
  date_arrived: string | null;
  created_at: string | null;
  inventory_type?: string | null;
  source_company: string | null;
  source_company_phone?: string | null;
  source_rep_name?: string | null;
  source_rep_phone?: string | null;
}

export interface Source {
  name: string;
  phone: string | null;
  repName: string | null;
  repPhone: string | null;
  vehicles: SourceVehicle[];
  totalCost: number;
  /** Most recent arrival (or record date), for sorting and "last supplied". */
  lastDate: string | null;
}

/** Spacing and case differences shouldn't split one source in two. */
export const sourceKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

const dateOf = (v: SourceVehicle) => v.date_arrived || v.created_at || null;

/** Groups vehicles by source, newest supplier first. Vehicles without a source are left out. */
export function groupSources(vehicles: SourceVehicle[]): Source[] {
  const byKey = new Map<string, Source>();
  for (const v of vehicles) {
    const name = v.source_company?.trim();
    if (!name) continue;
    const key = sourceKey(name);
    let s = byKey.get(key);
    if (!s) {
      s = { name, phone: null, repName: null, repPhone: null, vehicles: [], totalCost: 0, lastDate: null };
      byKey.set(key, s);
    }
    s.vehicles.push(v);
    s.totalCost += Number(v.cost_price || 0);
    const d = dateOf(v);
    // Contact details: the most recent record that has them wins
    const newest = !s.lastDate || (d && d > s.lastDate);
    if (newest) s.lastDate = d;
    if (v.source_company_phone && (newest || !s.phone)) s.phone = v.source_company_phone;
    if (v.source_rep_name && (newest || !s.repName)) s.repName = v.source_rep_name;
    if (v.source_rep_phone && (newest || !s.repPhone)) s.repPhone = v.source_rep_phone;
  }
  const list = [...byKey.values()];
  list.forEach((s) => s.vehicles.sort((a, b) => (dateOf(b) ?? "").localeCompare(dateOf(a) ?? "")));
  return list.sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? ""));
}

/** Matches a source on its name, contacts, or any vehicle it supplied (make, model, year, VIN). */
export function sourceMatches(s: Source, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const own = [s.name, s.phone, s.repName, s.repPhone].some((x) => x?.toLowerCase().includes(q));
  return own || s.vehicles.some((v) => vehicleMatches(v, q));
}

export function vehicleMatches(v: SourceVehicle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [v.make, v.model, v.vin, v.year?.toString(), `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`]
    .some((x) => x?.toLowerCase().includes(q));
}
