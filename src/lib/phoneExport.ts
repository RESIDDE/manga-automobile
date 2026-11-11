import { supabase } from "@/integrations/supabase/client";
import { exportToCSV } from "@/lib/exportHelpers";
import { groupSources, type SourceVehicle } from "@/lib/sources";

export interface PhoneRow {
  Name: string;
  Phone: string;
  Type: "Customer" | "Source" | "Source rep";
  Company: string;
}

/** Digits only, so "0803 123 4567" and "08031234567" count as one number. */
const digits = (p: string) => p.replace(/\D/g, "");

/**
 * One row per phone number: every customer, every source company and every
 * source representative. A number that appears twice is listed once, under
 * the first name it was found with (customers first).
 */
export function buildPhoneList(
  customers: { name: string; phone: string | null }[],
  vehicles: SourceVehicle[],
): PhoneRow[] {
  const rows: PhoneRow[] = [];
  const seen = new Set<string>();
  const add = (row: PhoneRow) => {
    const key = digits(row.Phone);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, Phone: row.Phone.trim() });
  };
  for (const c of customers) {
    if (c.phone) add({ Name: c.name, Phone: c.phone, Type: "Customer", Company: "" });
  }
  for (const s of groupSources(vehicles)) {
    if (s.phone) add({ Name: s.name, Phone: s.phone, Type: "Source", Company: s.name });
    if (s.repPhone) add({ Name: s.repName || s.name, Phone: s.repPhone, Type: "Source rep", Company: s.name });
  }
  return rows;
}

/**
 * Downloads the phone list as a CSV that opens in Excel. Numbers are written
 * as ="0803…" so Excel keeps the leading zero instead of turning them into
 * 8031234567.
 */
export async function exportPhoneNumbers(): Promise<number> {
  const [{ data: customers, error: e1 }, { data: vehicles, error: e2 }] = await Promise.all([
    supabase.from("customers").select("name, phone"),
    supabase.from("vehicles").select("*"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const rows = buildPhoneList(customers ?? [], (vehicles ?? []) as unknown as SourceVehicle[]);
  exportToCSV(
    rows.map((r) => ({ ...r, Phone: `="${r.Phone.replace(/"/g, "")}"` })),
    `phone_numbers_${new Date().toISOString().slice(0, 10)}`,
  );
  return rows.length;
}
