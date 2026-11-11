import { describe, it, expect } from "vitest";
import { buildSoldPriceMap, soldFigure, soldTotals } from "@/lib/soldPrice";

describe("buildSoldPriceMap", () => {
  it("uses a sale_vehicles row's own price when it is set", () => {
    const map = buildSoldPriceMap([
      {
        id: "s1", sale_price: 9_000_000, sale_date: "2026-11-01",
        sale_vehicles: [
          { vehicle_id: "v1", price: 5_000_000 },
          { vehicle_id: "v2", price: 4_000_000 },
        ],
      },
    ]);
    expect(map.get("v1")?.price).toBe(5_000_000);
    expect(map.get("v2")?.price).toBe(4_000_000);
  });

  it("splits the sale total evenly when a line has no price", () => {
    const map = buildSoldPriceMap([
      {
        id: "s1", sale_price: 9_000_000, sale_date: "2026-11-01",
        sale_vehicles: [{ vehicle_id: "v1", price: 0 }, { vehicle_id: "v2", price: null }],
      },
    ]);
    expect(map.get("v1")?.price).toBe(4_500_000);
    expect(map.get("v2")?.price).toBe(4_500_000);
  });

  it("handles a legacy single-vehicle sale", () => {
    const map = buildSoldPriceMap([
      { id: "s1", vehicle_id: "v9", sale_price: "3,500,000", sale_date: "2026-10-02", sale_vehicles: [] },
    ]);
    expect(map.get("v9")?.price).toBe(3_500_000);
  });

  it("keeps the most recent sale when a vehicle appears twice", () => {
    const map = buildSoldPriceMap([
      { id: "old", vehicle_id: "v1", sale_price: 1_000_000, sale_date: "2026-01-01" },
      { id: "new", vehicle_id: "v1", sale_price: 2_000_000, sale_date: "2026-06-01" },
    ]);
    expect(map.get("v1")?.price).toBe(2_000_000);
    expect(map.get("v1")?.saleId).toBe("new");
  });
});

describe("soldFigure", () => {
  const map = buildSoldPriceMap([
    { id: "s1", vehicle_id: "v1", sale_price: 5_500_000, sale_date: "2026-11-01" },
  ]);

  it("reports the sold figure and how it compares with the asking price", () => {
    const f = soldFigure({ id: "v1", price: 5_000_000 }, map);
    expect(f.amount).toBe(5_500_000);
    expect(f.diff).toBe(500_000);
    expect(f.derived).toBe(true);
  });

  it("falls back to the asking price when a sold vehicle has no sale record", () => {
    const f = soldFigure({ id: "ghost", price: 4_000_000 }, map);
    expect(f.amount).toBe(4_000_000);
    expect(f.derived).toBe(false);
    expect(f.diff).toBeNull();
  });

  it("suppresses the comparison when there is no asking price", () => {
    const f = soldFigure({ id: "v1", price: 0 }, map);
    expect(f.amount).toBe(5_500_000);
    expect(f.diff).toBeNull();
  });
});

describe("soldTotals", () => {
  it("sums the derived revenue and the profit against cost", () => {
    const map = buildSoldPriceMap([
      { id: "s1", vehicle_id: "v1", sale_price: 5_500_000, sale_date: "2026-11-01" },
      { id: "s2", vehicle_id: "v2", sale_price: 3_000_000, sale_date: "2026-11-02" },
    ]);
    const totals = soldTotals(
      [
        { id: "v1", price: 5_000_000, cost_price: 4_000_000 },
        { id: "v2", price: 3_200_000, cost_price: 2_500_000 },
      ],
      map
    );
    expect(totals.units).toBe(2);
    expect(totals.revenue).toBe(8_500_000);
    expect(totals.cost).toBe(6_500_000);
    expect(totals.profit).toBe(2_000_000);
  });
});
