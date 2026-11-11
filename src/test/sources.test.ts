import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { groupSources, sourceMatches, vehicleMatches, type SourceVehicle } from "@/lib/sources";
import { buildPhoneList } from "@/lib/phoneExport";

const v = (over: Partial<SourceVehicle>): SourceVehicle => ({
  id: Math.random().toString(36), make: "Toyota", model: "Camry", year: 2018, vin: null, status: "Available",
  cost_price: 0, date_arrived: null, created_at: "2026-01-01", source_company: "Ade Motors", ...over,
});

describe("groupSources", () => {
  const vehicles = [
    v({ id: "a", source_company: "Ade Motors", date_arrived: "2026-03-01", cost_price: 5_000_000,
        source_company_phone: "0801 000 0001", vin: "JTDBE32K1" }),
    v({ id: "b", source_company: "  ade   motors ", date_arrived: "2026-05-01", cost_price: 7_000_000,
        source_company_phone: "0801 000 0002", source_rep_name: "Tunde", source_rep_phone: "0902 222 2222",
        make: "Lexus", model: "RX 350" }),
    v({ id: "c", source_company: "Bola Autos", date_arrived: "2026-02-01" }),
    v({ id: "d", source_company: null }),
  ];
  const sources = groupSources(vehicles);

  it("groups by name ignoring case and spacing, and leaves out cars with no source", () => {
    expect(sources.map((s) => s.name)).toEqual(["Ade Motors", "Bola Autos"]);
    expect(sources[0].vehicles.map((x) => x.id)).toEqual(["b", "a"]); // newest first
    expect(sources[0].totalCost).toBe(12_000_000);
  });

  it("takes contact details from the most recent record", () => {
    expect(sources[0]).toMatchObject({ phone: "0801 000 0002", repName: "Tunde", repPhone: "0902 222 2222" });
  });

  it("searches sources by name, phone, or a car they supplied", () => {
    expect(sourceMatches(sources[0], "lexus")).toBe(true);
    expect(sourceMatches(sources[0], "JTDBE")).toBe(true);
    expect(sourceMatches(sources[0], "0902")).toBe(true);
    expect(sourceMatches(sources[1], "lexus")).toBe(false);
    expect(vehicleMatches(vehicles[1], "2018 lexus")).toBe(true);
  });
});

describe("buildPhoneList", () => {
  it("lists customers then sources and reps, once per number", () => {
    const rows = buildPhoneList(
      [{ name: "Chidi", phone: "0803 123 4567" }, { name: "No phone", phone: null }],
      [
        v({ source_company: "Ade Motors", source_company_phone: "08031234567", source_rep_name: "Tunde", source_rep_phone: "0902 222 2222" }),
        v({ source_company: "Bola Autos", source_company_phone: "0705 555 5555" }),
      ],
    );
    expect(rows).toEqual([
      { Name: "Chidi", Phone: "0803 123 4567", Type: "Customer", Company: "" },
      { Name: "Tunde", Phone: "0902 222 2222", Type: "Source rep", Company: "Ade Motors" },
      { Name: "Bola Autos", Phone: "0705 555 5555", Type: "Source", Company: "Bola Autos" },
    ]);
  });
});
