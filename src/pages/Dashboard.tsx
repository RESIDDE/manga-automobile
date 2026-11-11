import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Car, PlusCircle } from "lucide-react";
import { FinanceBento, type FinanceBentoData } from "@/components/ui/finance-bento";

/* The bento was built for fiat / stocks / crypto. The three bands map onto the
   dealership as cash collected, stock on the lot and money still owed, so every
   figure below comes from vehicles / sales / customers — nothing is invented. */
const LABELS = {
  netWorth: "Business value", fiat: "Cash", stocks: "Inventory", crypto: "Receivables", total: "Total",
  allocation: "Where value sits", invested: "tied up",
  return: "Stock growth", returnCaption: "Inventory + receivables",
  freeCash: "Cash collected", runway: "Cover", months: "mo", runwayMax: "12 mo",
  payments: "Awaiting payment", goals: "Targets", goalsActive: "active",
  cashflow: "Cash flow", cashflowNetPrefix: "Net", cashflowNetSuffix: "a month",
  income: "Sales", spending: "Purchases", saved: "Margin",
  cryptoTitle: "Owed by make", cryptoPeriod: "unpaid", cryptoChangeSuffix: "of sales", cryptoRowSuffix: "trend",
  stocksTitle: "This week", stocksChangeSuffix: "vs last week", stocksTooltip: "sales", bought: "Sold", sold: "Sold",
};

const CURRENCIES = [{ code: "NGN", symbol: "₦", rate: 1 }];

const PAID = new Set(["paid", "completed", "complete", "settled", ""]);
const isPaid = (s: string | null) => PAID.has((s ?? "").toLowerCase());

const monthEnd = (back: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - back + 1, 0, 23, 59, 59);
};

type Vehicle = { id: string; make: string; model: string; year: number; price: number | null; cost_price: number | null; status: string; created_at: string };
type Sale = { id: string; vehicle_id: string | null; sale_price: number; sale_date: string; created_at: string; payment_status: string | null; vehicles?: { make: string; model: string; cost_price: number | null } | null };

/** Builds the whole bento payload from the three tables. */
function buildBento(vehicles: Vehicle[], sales: Sale[]): FinanceBentoData {
  const soldAt = new Map<string, Date>();
  sales.forEach((s) => { if (s.vehicle_id) soldAt.set(s.vehicle_id, new Date(s.sale_date || s.created_at)); });

  // ── 24 month-ends of cash / inventory / receivables ──────────────────────
  const history = Array.from({ length: 24 }, (_, i) => {
    const end = monthEnd(23 - i);
    const inventory = vehicles
      .filter((v) => new Date(v.created_at) <= end && !(soldAt.get(v.id) && soldAt.get(v.id)! <= end))
      .reduce((sum, v) => sum + Number(v.price || 0), 0);
    let cash = 0;
    let receivables = 0;
    sales.forEach((s) => {
      if (new Date(s.sale_date || s.created_at) > end) return;
      if (isPaid(s.payment_status)) cash += Number(s.sale_price || 0);
      else receivables += Number(s.sale_price || 0);
    });
    return { date: end.toISOString(), fiat: cash, stocks: inventory, crypto: receivables };
  });

  // ── Awaiting payment ─────────────────────────────────────────────────────
  const outstanding = sales.filter((s) => !isPaid(s.payment_status));
  const payments = outstanding
    .sort((a, b) => new Date(b.sale_date || b.created_at).getTime() - new Date(a.sale_date || a.created_at).getTime())
    .slice(0, 3)
    .map((s) => ({
      name: s.vehicles ? `${s.vehicles.make} ${s.vehicles.model}` : "Sale",
      date: new Date(s.sale_date || s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      amount: Number(s.sale_price || 0),
    }));

  // ── Targets: clearing the lot, and this month against the best month ─────
  const soldCount = vehicles.filter((v) => soldAt.has(v.id)).length;
  const monthRevenue = (back: number) => {
    const end = monthEnd(back);
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return sales.filter((s) => { const d = new Date(s.sale_date || s.created_at); return d >= start && d <= end; })
      .reduce((sum, s) => sum + Number(s.sale_price || 0), 0);
  };
  const months12 = Array.from({ length: 12 }, (_, i) => monthRevenue(11 - i));
  const best = Math.max(...months12, 1);
  const goals = [
    { name: "Lot cleared", progress: vehicles.length ? soldCount / vehicles.length : 0, target: vehicles.length },
    { name: "Best month", progress: Math.min(1, months12[11] / best), target: best },
  ];

  // ── Cash flow: sales in, vehicle purchases out, in ₦ thousands ───────────
  const flowMonths = Array.from({ length: 6 }, (_, i) => monthEnd(5 - i));
  const purchases = (back: number) => {
    const end = monthEnd(back);
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return vehicles.filter((v) => { const d = new Date(v.created_at); return d >= start && d <= end; })
      .reduce((sum, v) => sum + Number(v.cost_price || 0), 0);
  };
  const row = (yearBack: number, fn: (back: number) => number) =>
    Array.from({ length: 6 }, (_, i) => fn(5 - i + yearBack * 12) / 1000);
  const cashflow = {
    months: flowMonths.map((d) => d.toLocaleDateString("en-US", { month: "short" })),
    income: [row(0, monthRevenue), row(1, monthRevenue), row(2, monthRevenue)],
    spending: [row(0, purchases), row(1, purchases), row(2, purchases)],
  };

  // ── Owed by make: top three makes behind the receivables ─────────────────
  const byMake = new Map<string, number>();
  outstanding.forEach((s) => {
    const make = s.vehicles?.make || "Other";
    byMake.set(make, (byMake.get(make) || 0) + Number(s.sale_price || 0));
  });
  if (byMake.size === 0) {
    sales.forEach((s) => {
      const make = s.vehicles?.make || "Other";
      byMake.set(make, (byMake.get(make) || 0) + Number(s.sale_price || 0));
    });
  }
  const top = [...byMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topTotal = top.reduce((sum, [, v]) => sum + v, 0) || 1;
  const makeTrend = (make: string) =>
    Array.from({ length: 7 }, (_, i) => {
      const end = monthEnd(6 - i);
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      const v = sales
        .filter((s) => (s.vehicles?.make || "Other") === make)
        .filter((s) => { const d = new Date(s.sale_date || s.created_at); return d >= start && d <= end; })
        .reduce((sum, s) => sum + Number(s.sale_price || 0), 0);
      return [v, v, v, v];
    });
  const crypto = top.map(([make, amount]) => {
    const share = amount / topTotal;
    return {
      name: make,
      symbol: make.slice(0, 4).toUpperCase(),
      share,
      change: `${Math.round(share * 100)}%`,
      ohlc: makeTrend(make),
    };
  });

  // ── This week: revenue per weekday, in ₦ thousands ───────────────────────
  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const dayRevenue = (offset: number, from: Date) => {
    const d0 = new Date(from); d0.setDate(d0.getDate() + offset);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    return sales.filter((s) => { const d = new Date(s.sale_date || s.created_at); return d >= d0 && d < d1; })
      .reduce((sum, s) => sum + Number(s.sale_price || 0), 0);
  };
  const lastWeek = new Date(startOfWeek); lastWeek.setDate(lastWeek.getDate() - 7);
  const thisWeekValues = Array.from({ length: 5 }, (_, i) => dayRevenue(i, startOfWeek) / 1000);
  const thisWeekTotal = thisWeekValues.reduce((a, b) => a + b, 0);
  const lastWeekTotal = Array.from({ length: 5 }, (_, i) => dayRevenue(i, lastWeek) / 1000).reduce((a, b) => a + b, 0);
  const weekChange = lastWeekTotal ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100 : 0;

  // ── Headline figures that the cards would otherwise hard-code ────────────
  const cashNow = history[history.length - 1].fiat;
  const avgPurchase = [0, 1, 2, 3, 4, 5].reduce((sum, b) => sum + purchases(b), 0) / 6;
  const netPerMonth = (months12.reduce((a, b) => a + b, 0) - [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reduce((s, b) => s + purchases(b), 0)) / 12;
  const receivablesNow = history[history.length - 1].crypto;
  const salesTotal = sales.reduce((sum, s) => sum + Number(s.sale_price || 0), 0) || 1;

  return {
    history, payments, goals, cashflow, crypto,
    stocks: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], values: thisWeekValues },
    freeCash: { amount: cashNow, months: avgPurchase ? cashNow / avgPurchase : 12, maxMonths: 12 },
    cryptoChange: `${Math.round((receivablesNow / salesTotal) * 100)}%`,
    stocksChange: `${weekChange >= 0 ? "↑" : "↓"} ${Math.abs(weekChange).toFixed(1)}%`,
    cashflowNet: `${netPerMonth >= 0 ? "+" : "−"}₦${Math.abs(Math.round(netPerMonth)).toLocaleString()}`,
    allocationTarget: `${vehicles.length} vehicles`,
  };
}

export default function Dashboard() {
  const { data: vehicles = [], isLoading: loadingV } = useQuery({
    queryKey: ["dash-vehicles"],
    queryFn: async () => {
      // The bento only needs these columns; select("*") dragged along the
      // description, image URL and two signature data URLs per vehicle.
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, make, model, year, price, cost_price, status, created_at");
      if (error) throw error;
      return data as unknown as Vehicle[];
    },
  });

  const { data: sales = [], isLoading: loadingS } = useQuery({
    queryKey: ["dash-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, vehicle_id, sale_price, sale_date, created_at, payment_status, vehicles(make, model, cost_price)");
      if (error) throw error;
      return data as unknown as Sale[];
    },
  });

  const bento = useMemo(() => buildBento(vehicles, sales), [vehicles, sales]);
  const loading = loadingV || loadingS;
  const empty = !loading && vehicles.length === 0 && sales.length === 0;

  const today = new Date().toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="max-w-[1320px] mx-auto pb-10 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-3xl font-heading font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live from your inventory, sales and payments.</p>
        </div>
        <Button asChild size="lg" className="rounded-2xl shadow-lg shadow-primary/25 group shrink-0 h-12 px-6">
          <Link to="/vehicles/new">
            <PlusCircle className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform duration-300" />
            Add Vehicle
          </Link>
        </Button>
      </div>

      <div>
        {loading ? (
          <div className="h-[920px] rounded-[28px] bg-foreground/[0.04] animate-pulse" />
        ) : empty ? (
          <div className="h-[420px] rounded-[28px] grid place-items-center text-center px-6">
            <div>
              <Car className="w-10 h-10 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-foreground font-bold text-lg">No data yet</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                Add your first vehicle and record a sale — the dashboard fills in from there.
              </p>
            </div>
          </div>
        ) : (
          <FinanceBento
            data={bento}
            labels={LABELS}
            currencies={CURRENCIES}
            credit={false}
            title="Overview"
            subtitle={`Updated ${today}`}
          />
        )}
      </div>
    </div>
  );
}
