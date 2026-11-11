/**
 * A vehicle's own `price` is its *asking* price. What it actually fetched lives
 * on the sale, so the sold figure is derived from the sales rows — never stored
 * a second time on the vehicle.
 */

export type SoldInfo = { price: number; date: string | null; saleId: string | null };

type SaleLike = {
  id?: string;
  vehicle_id?: string | null;
  sale_price?: number | string | null;
  sale_date?: string | null;
  created_at?: string | null;
  sale_vehicles?: { vehicle_id?: string | null; price?: number | string | null }[] | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * vehicle id → { price, date, saleId } for every vehicle that appears on a sale.
 *
 *  - a sale with `sale_vehicles` rows prices each car from its own row when that
 *    is greater than zero, and otherwise splits the sale total evenly
 *  - a legacy single-vehicle sale prices `sale.vehicle_id` at the sale total
 *  - when a vehicle appears on more than one sale, the most recent one wins
 */
export function buildSoldPriceMap(sales: SaleLike[]): Map<string, SoldInfo> {
  const map = new Map<string, SoldInfo>();

  const consider = (vehicleId: string | null | undefined, info: SoldInfo) => {
    if (!vehicleId) return;
    const existing = map.get(vehicleId);
    if (!existing) { map.set(vehicleId, info); return; }
    const a = info.date ? new Date(info.date).getTime() : 0;
    const b = existing.date ? new Date(existing.date).getTime() : 0;
    if (a >= b) map.set(vehicleId, info);
  };

  for (const sale of sales) {
    const date = sale.sale_date || sale.created_at || null;
    const saleId = sale.id ?? null;
    const links = sale.sale_vehicles ?? [];

    if (links.length > 0) {
      const total = num(sale.sale_price);
      const evenShare = links.length ? total / links.length : total;
      for (const link of links) {
        const own = num(link.price);
        consider(link.vehicle_id, { price: own > 0 ? own : evenShare, date, saleId });
      }
    } else if (sale.vehicle_id) {
      consider(sale.vehicle_id, { price: num(sale.sale_price), date, saleId });
    }
  }

  return map;
}

/**
 * What to show for a vehicle on the Sold tab. A vehicle marked Sold with no sale
 * record falls back to its asking price, so a figure never reads ₦0, and the
 * asking-price comparison is suppressed when there is nothing to compare.
 */
export function soldFigure(
  vehicle: { id: string; price?: number | string | null },
  soldMap: Map<string, SoldInfo>
): { amount: number; date: string | null; asking: number; diff: number | null; derived: boolean } {
  const asking = num(vehicle.price);
  const info = soldMap.get(vehicle.id);
  const amount = info ? info.price : asking;
  return {
    amount,
    date: info?.date ?? null,
    asking,
    diff: asking > 0 && info ? amount - asking : null,
    derived: !!info,
  };
}

/** Totals for the Sold tab tiles: revenue is the derived figure, not the asking price. */
export function soldTotals(
  vehicles: { id: string; price?: number | string | null; cost_price?: number | string | null }[],
  soldMap: Map<string, SoldInfo>
) {
  let revenue = 0;
  let cost = 0;
  for (const v of vehicles) {
    revenue += soldFigure(v, soldMap).amount;
    cost += num(v.cost_price);
  }
  return { units: vehicles.length, revenue, cost, profit: revenue - cost };
}
