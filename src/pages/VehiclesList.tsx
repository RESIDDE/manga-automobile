import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Car, ChevronDown, Download, Eye, FileText, LayoutGrid, Pencil,
  PlusCircle, Printer, Rows3, Search, Trash2,
} from "lucide-react";
import {
  Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { exportToCSV, exportToJSON, printTable, downloadTableAsPDF } from "@/lib/exportHelpers";
import { CustomPagination } from "@/components/CustomPagination";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit, isUnrestricted } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { buildSoldPriceMap, soldFigure, soldTotals } from "@/lib/soldPrice";
import { firstWorkingSelect } from "@/lib/dbCompat";
import { formatNaira } from "@/lib/numberToWords";
import {
  ALL_TIME, ALL_WEEKS, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

const CHART_COLORS = [
  "hsl(199 89% 48%)", "hsl(142 76% 36%)", "hsl(38 92% 50%)",
  "hsl(262 83% 58%)", "hsl(0 84% 60%)", "hsl(220 9% 46%)",
];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel p-3 border border-white/20 shadow-2xl rounded-xl z-50">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((entry: any, i: number) => {
        const money = /value|price|revenue|cost|profit/i.test(String(entry.name));
        return (
          <p key={i} className="text-sm font-medium flex justify-between gap-4"
             style={{ color: entry.color || entry.fill }}>
            <span>{entry.name}:</span>
            <span>{money ? formatNaira(entry.value) : entry.value}</span>
          </p>
        );
      })}
    </div>
  );
};

const StatTile = ({ label, value, tone = "text-foreground" }: {
  label: string; value: string | number; tone?: string;
}) => (
  <div className="bento-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
  </div>
);

export default function VehiclesList() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, "vehicles", permissions);
  const hasEdit = canEdit(role, "vehicles", permissions);
  const hasDelete = canDelete(role, "vehicles", permissions);

  // The tab lives in the URL, so it survives a refresh and can be linked
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "sold" ? "sold" : "active";
  const setTab = (next: "active" | "sold") => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
    setPage(0);
  };

  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [month, setMonth] = useState(ALL_TIME);
  const [week, setWeek] = useState(ALL_WEEKS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const queryClient = useQueryClient();
  const months = useMemo(() => monthOptions(), []);

  // Stock only: 'service' rows are workshop-only cars, never part of inventory
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      // Only the columns the list, the tiles and the exports use: the signature
      // and description columns are large text and belong to the detail page.
      // Some of these arrive with migrations, so the read steps down and ends on
      // select("*"), which always works — a heavier page beats an empty one.
      const BASE_COLUMNS =
        "id, make, model, year, trim, color, vin, price, cost_price, status, condition, " +
        "num_keys, source_company, date_arrived, date_stored, created_at";
      const ADDED_COLUMNS = "inventory_type, source_company_phone";

      const data = await firstWorkingSelect<any[]>(
        [
          () => supabase
            .from("vehicles")
            .select(`${BASE_COLUMNS}, ${ADDED_COLUMNS}`)
            .order("created_at", { ascending: false }) as any,
          () => supabase
            .from("vehicles")
            .select(BASE_COLUMNS)
            .order("created_at", { ascending: false }) as any,
          () => supabase
            .from("vehicles")
            .select("*")
            .order("created_at", { ascending: false }) as any,
        ]
      );
      return (data as any[]).filter(
        (v) => (v.inventory_type ?? "main") === "main" && v.status !== "Customer Car"
      );
    },
  });

  // Sales supply the sold figures; a vehicle's own price is only its asking price
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "for-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, vehicle_id, sale_price, sale_date, created_at, sale_vehicles(vehicle_id, price)")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const soldMap = useMemo(() => buildSoldPriceMap(sales), [sales]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => v.source_company && set.add(v.source_company));
    return [...set].sort();
  }, [vehicles]);

  const inTab = useMemo(
    () => vehicles.filter((v) =>
      tab === "sold" ? v.status === "Sold" : v.status !== "Sold"
    ),
    [vehicles, tab]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inTab.filter((v) => {
      const matchesSearch = !q
        || (v.make || "").toLowerCase().includes(q)
        || (v.model || "").toLowerCase().includes(q)
        || (v.trim || "").toLowerCase().includes(q)
        || (v.vin || "").toLowerCase().includes(q);
      const matchesCondition = conditionFilter === "all" || v.condition === conditionFilter;
      const matchesStatus = tab === "sold" || statusFilter === "all" || v.status === statusFilter;
      const matchesSource = sourceFilter === "all" || v.source_company === sourceFilter;
      // On the Sold tab the period applies to the sale date, otherwise to arrival
      const periodDate = tab === "sold"
        ? (soldMap.get(v.id)?.date ?? v.date_arrived ?? v.created_at)
        : (v.date_arrived ?? v.created_at);
      return matchesSearch && matchesCondition && matchesStatus && matchesSource
        && matchesPeriod(periodDate, month, week);
    });
  }, [inTab, search, conditionFilter, statusFilter, sourceFilter, month, week, tab, soldMap]);

  const stats = useMemo(() => {
    if (tab === "sold") {
      const t = soldTotals(filtered, soldMap);
      return { kind: "sold" as const, ...t };
    }
    const cost = filtered.reduce((sum, v) => sum + Number(v.cost_price || 0), 0);
    const asking = filtered.reduce((sum, v) => sum + Number(v.price || 0), 0);
    return { kind: "active" as const, units: filtered.length, cost, asking };
  }, [filtered, soldMap, tab]);

  const charts = useMemo(() => {
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const count = filtered.filter((v) => {
        const raw = tab === "sold"
          ? (soldMap.get(v.id)?.date ?? v.created_at)
          : (v.date_arrived ?? v.created_at);
        const when = raw ? new Date(raw) : null;
        return when && !Number.isNaN(when.getTime()) && isWithinInterval(when, { start, end });
      }).length;
      return { name: format(d, "MMM"), [tab === "sold" ? "Sales" : "Arrivals"]: count };
    });

    const makeCounts = filtered.reduce<Record<string, number>>((acc, v) => {
      const key = v.make || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const makes = Object.entries(makeCounts)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { monthly, makes };
  }, [filtered, soldMap, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", "Vehicle", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete the vehicle"),
  });

  const soldIds = useMemo(
    () => vehicles.filter((v) => v.status === "Sold").map((v) => v.id),
    [vehicles]
  );

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      if (soldIds.length === 0) throw new Error("There are no sold vehicles to delete");
      const { error } = await supabase.from("vehicles").delete().in("id", soldIds);
      if (error) throw error;
      await logAction("DELETE", "Vehicle", null, { bulk: "sold", count: soldIds.length });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(`Deleted ${soldIds.length} sold vehicle${soldIds.length === 1 ? "" : "s"}`);
      setBulkDeleteOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Bulk delete failed"),
  });

  // ── Exports: every one carries the derived sold figure ─────────────────────
  const exportRows = () =>
    filtered.map((v) => {
      const f = soldFigure(v, soldMap);
      return {
        Make: v.make, Model: v.model, Trim: v.trim || "", Year: v.year,
        VIN: v.vin || "", Colour: v.color || "",
        "Asking Price": Number(v.price || 0),
        "Cost Price": Number(v.cost_price || 0),
        "Sold Price": v.status === "Sold" ? f.amount : "",
        "Sold Date": v.status === "Sold" && f.date ? shortDate(f.date) : "",
        Status: v.status, Condition: v.condition || "",
        "Source Company": v.source_company || "",
        "Date Arrived": v.date_arrived || "",
      };
    });

  const priceColumnLabel = tab === "sold" ? "Sold Price" : "Price";

  const tableRows = () =>
    filtered.map((v) => {
      const f = soldFigure(v, soldMap);
      return {
        vehicle: `${v.year} ${v.make} ${v.model}`.trim(),
        vin: v.vin || "—",
        price: formatNaira(tab === "sold" ? f.amount : v.price),
        date: tab === "sold" ? shortDate(f.date) : shortDate(v.date_arrived),
        status: v.status,
        condition: v.condition || "—",
      };
    });

  const tableColumns = [
    { key: "vehicle", label: "Vehicle" },
    { key: "vin", label: "VIN" },
    { key: "price", label: priceColumnLabel },
    { key: "date", label: tab === "sold" ? "Sold Date" : "Arrived" },
    { key: "status", label: "Status" },
    { key: "condition", label: "Condition" },
  ];

  const handleExportCSV = () => {
    exportToCSV(exportRows(), `vehicles_${tab}`);
    logAction("EXPORT", "Vehicle", null, { format: "csv", tab, rows: filtered.length });
  };
  const handleExportJSON = () => {
    exportToJSON(exportRows(), `vehicles_${tab}`);
    logAction("EXPORT", "Vehicle", null, { format: "json", tab, rows: filtered.length });
  };
  const handlePrint = () => {
    printTable(
      `Vehicles — ${tab === "sold" ? "Sold" : "Active"} — Manga Automobiles`,
      tableRows(), tableColumns
    );
    logAction("PRINT", "Vehicle", null, { tab, rows: filtered.length });
  };
  const handlePDF = async () => {
    await downloadTableAsPDF(
      `Vehicles — ${tab === "sold" ? "Sold" : "Active"}`, tableRows(), tableColumns
    );
    logAction("EXPORT", "Vehicle", null, { format: "pdf", tab, rows: filtered.length });
  };

  const resetFilters = () => {
    setSearch(""); setConditionFilter("all"); setStatusFilter("all");
    setSourceFilter("all"); setMonth(ALL_TIME); setWeek(ALL_WEEKS); setPage(0);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-sky-500/10 shrink-0">
            <Car className="h-6 w-6 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Vehicles</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Stock on the lot, and everything that has been sold.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowAnalytics((s) => !s)}
            className="rounded-xl border-white/10 hover:bg-white/5">
            <BarChart3 className="h-4 w-4 mr-2" /> Analytics
            <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showAnalytics ? "rotate-180" : ""}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl border-white/10 hover:bg-white/5">
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel border-white/10 rounded-xl">
              <DropdownMenuItem onClick={handleExportCSV} className="rounded-lg cursor-pointer">
                <FileText className="h-4 w-4 mr-2" /> Excel / CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON} className="rounded-lg cursor-pointer">
                <FileText className="h-4 w-4 mr-2" /> JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePDF} className="rounded-lg cursor-pointer">
                <Download className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint} className="rounded-lg cursor-pointer">
                <Printer className="h-4 w-4 mr-2" /> Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {tab === "sold" && isUnrestricted(role) && soldIds.length > 0 && (
            <Button variant="outline" onClick={() => setBulkDeleteOpen(true)}
              className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" /> Delete All Sold
            </Button>
          )}
          {hasCreate && (
            <Button asChild
              className="rounded-xl bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-lg shadow-sky-500/20">
              <Link to="/vehicles/new"><PlusCircle className="h-4 w-4 mr-2" /> Add Vehicle</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1.5 bg-foreground/5 rounded-2xl gap-1 w-fit">
        {([["active", "Active"], ["sold", "Sold"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`px-5 h-9 rounded-xl text-sm font-semibold transition-colors ${
              tab === key ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className="ml-2 text-[11px] opacity-60">
              {vehicles.filter((v) => (key === "sold" ? v.status === "Sold" : v.status !== "Sold")).length}
            </span>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.kind === "active" ? (
          <>
            <StatTile label="Units in stock" value={stats.units} />
            <StatTile label="Total cost value" value={formatNaira(stats.cost)} />
            <StatTile label="Total asking value" value={formatNaira(stats.asking)} tone="text-sky-500" />
            <StatTile
              label="Average asking"
              value={formatNaira(stats.units ? stats.asking / stats.units : 0)}
            />
          </>
        ) : (
          <>
            <StatTile label="Units sold" value={stats.units} />
            <StatTile label="Revenue" value={formatNaira(stats.revenue)} tone="text-blue-500" />
            <StatTile label="Cost" value={formatNaira(stats.cost)} />
            <StatTile
              label="Profit"
              value={formatNaira(stats.profit)}
              tone={stats.profit >= 0 ? "text-emerald-500" : "text-rose-500"}
            />
          </>
        )}
      </div>

      {/* Analytics */}
      {showAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
          <div className="bento-card p-5">
            <p className="text-sm font-bold mb-3">
              {tab === "sold" ? "Sales per month" : "Arrivals per month"}
            </p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.monthly}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey={tab === "sold" ? "Sales" : "Arrivals"}
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bento-card p-5">
            <p className="text-sm font-bold mb-3">Top makes</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={charts.makes} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {charts.makes.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass-panel rounded-2xl border border-white/5 p-4 flex flex-col xl:flex-row gap-3 xl:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model or VIN..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="h-10 pl-9 rounded-xl bg-background/50 border-white/10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={conditionFilter} onValueChange={(v) => { setConditionFilter(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[130px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              <SelectItem value="all" className="text-sm">All conditions</SelectItem>
              {["New", "Used", "Damaged"].map((c) => (
                <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {tab === "active" && (
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="h-10 w-[130px] rounded-xl bg-background/50 border-white/10 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="glass-panel border-white/10 rounded-xl">
                <SelectItem value="all" className="text-sm">All statuses</SelectItem>
                {["Available", "Reserved", "Under Repair"].map((s) => (
                  <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl max-h-[260px]">
              <SelectItem value="all" className="text-sm">All sources</SelectItem>
              {sources.map((srcName) => (
                <SelectItem key={srcName} value={srcName} className="text-sm">{srcName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={month} onValueChange={(v) => { setMonth(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[140px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={week} onValueChange={(v) => { setWeek(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[120px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              {WEEK_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={w.value} className="text-sm">{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-xl border border-white/10 bg-background/50 p-1">
            <Button variant="ghost" size="icon" aria-label="Cards view" onClick={() => setView("cards")}
              className={`h-8 w-8 rounded-lg ${view === "cards" ? "bg-sky-500/15 text-sky-500" : ""}`}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Table view" onClick={() => setView("table")}
              className={`h-8 w-8 rounded-lg ${view === "table" ? "bg-sky-500/15 text-sky-500" : ""}`}>
              <Rows3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center text-center">
          <div className="bg-sky-500/10 p-5 rounded-full mb-4">
            <Car className="h-9 w-9 text-sky-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">No vehicles found</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            Nothing matches the current filters on the {tab === "sold" ? "Sold" : "Active"} tab.
          </p>
          <Button variant="outline" onClick={resetFilters} className="rounded-xl border-white/10">
            Clear filters
          </Button>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((v) => {
            const f = soldFigure(v, soldMap);
            const isSold = v.status === "Sold";
            const headline = isSold ? f.amount : Number(v.price || 0);
            const statusTone = v.status === "Available"
              ? "bg-emerald-500/15 text-emerald-600"
              : isSold ? "bg-blue-500/15 text-blue-600" : "bg-amber-500/15 text-amber-600";

            return (
              <div key={v.id} className="bento-card overflow-hidden flex flex-col">
                {/* Dark reference rail */}
                <div className="bg-neutral-900 text-white p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">
                    {v.vin ? `VIN: ${v.vin}` : `REF-${String(v.id).slice(0, 8)}`}
                  </p>
                  <p className="text-base font-bold mt-1 leading-tight">
                    {v.year} {v.make} {v.model}
                  </p>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    {[v.trim, v.color].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {v.source_company && (
                    <Link
                      to={`/source-company/${encodeURIComponent(v.source_company)}`}
                      className="inline-block mt-2 text-[11px] font-semibold text-sky-300 hover:underline"
                    >
                      {v.source_company}
                    </Link>
                  )}
                </div>

                {/* Light detail panel */}
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {v.condition || "Unknown"} ·{" "}
                    {isSold
                      ? `Sold ${f.date ? shortDate(f.date) : "—"}`
                      : `Arrived ${shortDate(v.date_arrived)}`}
                  </p>

                  <div>
                    <p className={`text-2xl font-bold ${isSold ? "text-blue-500" : "text-foreground"}`}>
                      {formatNaira(headline)}
                    </p>
                    {isSold && f.diff !== null && (
                      <p className={`text-[11px] font-semibold ${f.diff >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                        Listed at {formatNaira(f.asking)} ({f.diff >= 0 ? "+" : "−"}
                        {formatNaira(Math.abs(f.diff)).replace("₦", "₦")})
                      </p>
                    )}
                    {isSold && !f.derived && (
                      <p className="text-[11px] text-muted-foreground italic">
                        No sale record — showing the asking price
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${statusTone}`}>
                      {v.status || "Unknown"}
                    </span>
                    {v.num_keys ? (
                      <span className="text-[10px] text-muted-foreground">{v.num_keys} key(s)</span>
                    ) : null}
                  </div>

                  <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
                    <div
                      className={`h-full ${isSold ? "bg-blue-500" : "bg-emerald-500"}`}
                      style={{ width: isSold ? "100%" : v.status === "Reserved" ? "60%" : "25%" }}
                    />
                  </div>

                  <div className="flex gap-1.5 pt-2 border-t border-white/5 mt-auto">
                    <Button variant="outline" size="sm" asChild className="h-8 text-xs rounded-lg border-white/10">
                      <Link to={`/vehicles/${v.id}`}><Eye className="h-3.5 w-3.5 mr-1.5" /> Details</Link>
                    </Button>
                    {hasEdit && (
                      <Button variant="outline" size="sm" asChild className="h-8 text-xs rounded-lg border-white/10">
                        <Link to={`/vehicles/${v.id}/edit`}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Link>
                      </Button>
                    )}
                    {hasDelete && (
                      <Button variant="ghost" size="icon" aria-label="Delete vehicle"
                        onClick={() => setDeleteId(v.id)}
                        className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-foreground/5">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="px-6 font-semibold">Vehicle</TableHead>
                  <TableHead className="font-semibold">Chassis (VIN)</TableHead>
                  <TableHead className="font-semibold">Condition</TableHead>
                  <TableHead className="font-semibold">Source</TableHead>
                  <TableHead className="font-semibold">{tab === "sold" ? "Sold Date" : "Arrived"}</TableHead>
                  <TableHead className="font-semibold">{priceColumnLabel}</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right px-6 font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((v) => {
                  const f = soldFigure(v, soldMap);
                  const isSold = v.status === "Sold";
                  return (
                    <TableRow key={v.id} className="border-border/10 hover:bg-white/5 group">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-foreground/5 group-hover:bg-sky-500/10">
                            <Car className="h-4 w-4 text-sky-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{v.year} {v.make} {v.model}</p>
                            {v.trim && <p className="text-[11px] text-muted-foreground">{v.trim}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {v.vin
                          ? <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-md">{v.vin}</span>
                          : <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{v.condition || "—"}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm" title={v.source_company || ""}>
                        {v.source_company
                          ? <Link to={`/source-company/${encodeURIComponent(v.source_company)}`}
                                  className="hover:underline text-sky-500">{v.source_company}</Link>
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {isSold ? shortDate(f.date) : shortDate(v.date_arrived)}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-bold ${isSold ? "text-blue-500" : ""}`}>
                          {formatNaira(isSold ? f.amount : v.price)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          v.status === "Available" ? "bg-emerald-500/10 text-emerald-500"
                            : isSold ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
                        }`}>
                          {v.status || "Unknown"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild aria-label="View vehicle"
                            className="h-8 w-8 rounded-lg hover:bg-sky-500/10 hover:text-sky-500">
                            <Link to={`/vehicles/${v.id}`}><Eye className="h-4 w-4" /></Link>
                          </Button>
                          {hasEdit && (
                            <Button variant="ghost" size="icon" asChild aria-label="Edit vehicle"
                              className="h-8 w-8 rounded-lg hover:bg-foreground/10">
                              <Link to={`/vehicles/${v.id}/edit`}><Pencil className="h-4 w-4" /></Link>
                            </Button>
                          )}
                          {hasDelete && (
                            <Button variant="ghost" size="icon" aria-label="Delete vehicle"
                              onClick={() => setDeleteId(v.id)}
                              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <CustomPagination
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
        sizes={[20, 50, 100]}
      />

      {/* Delete one */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              The vehicle and its images will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="rounded-xl bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all sold */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete all {soldIds.length} sold vehicle{soldIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every stock vehicle marked Sold will be removed, along with its images. The sales
              themselves are kept, but their vehicle links are cleared. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate()}
              className="rounded-xl bg-destructive hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${soldIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
