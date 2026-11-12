import { VEHICLE_CONDITIONS } from "@/lib/conditions";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Download, Eye, FileText, LayoutGrid, MapPinned, Pencil, PlusCircle, Printer,
  Rows3, Search, Trash2, Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { exportToCSV, exportToJSON, printTable, downloadTableAsPDF } from "@/lib/exportHelpers";
import { CustomPagination } from "@/components/CustomPagination";
import { RecordActions } from "@/components/RecordActions";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { firstWorkingSelect } from "@/lib/dbCompat";
import { INVENTORY_MAIN, isExternal } from "@/lib/inventoryType";
import { isStandardMarkup, marginOf, markupLabel, outsideTotals } from "@/lib/officePrice";
import { buildSoldPriceMap, soldFigure, soldTotals } from "@/lib/soldPrice";
import { formatNaira } from "@/lib/numberToWords";
import {
  ALL_TIME, ALL_WEEKS, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

const PAGE_KEY = "outside-vehicles" as const;

const StatTile = ({ label, value, sub, tone = "text-foreground" }: {
  label: string; value: string | number; sub?: string; tone?: string;
}) => (
  <div className="bento-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

/**
 * Cars snapped outside the stand.
 *
 * These belong to other people. The owner's figure is the **actual price**
 * (`cost_price`); what we quote the customer is the **office price** (`price`),
 * normally the actual + 10%. The margin between them is what the dealership
 * earns for brokering the car.
 *
 * Built as a sibling of VehiclesList rather than a shared, prop-driven page —
 * the same call this codebase makes elsewhere when two screens share a shape
 * but diverge on columns, tiles, actions and the meaning of their figures.
 */
export default function OutsideVehicles() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, PAGE_KEY, permissions);
  const hasEdit = canEdit(role, PAGE_KEY, permissions);
  const hasDelete = canDelete(role, PAGE_KEY, permissions);

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
  const [sourceFilter, setSourceFilter] = useState("all");
  const [month, setMonth] = useState(ALL_TIME);
  const [week, setWeek] = useState(ALL_WEEKS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const months = useMemo(() => monthOptions(), []);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles", "outside"],
    queryFn: async () => {
      const BASE_COLUMNS =
        "id, make, model, year, trim, color, vin, price, cost_price, status, condition, " +
        "num_keys, source_company, date_arrived, date_stored, created_at";
      const ADDED_COLUMNS = "inventory_type, source_company_phone";

      const data = await firstWorkingSelect<any[]>([
        () => supabase.from("vehicles")
          .select(`${BASE_COLUMNS}, ${ADDED_COLUMNS}`)
          .order("created_at", { ascending: false }) as any,
        () => supabase.from("vehicles")
          .select(BASE_COLUMNS)
          .order("created_at", { ascending: false }) as any,
        () => supabase.from("vehicles")
          .select("*")
          .order("created_at", { ascending: false }) as any,
      ]);
      // Positive match: on a database without inventory_type this correctly
      // shows nothing rather than relabelling the whole fleet as brokered.
      return (data as any[]).filter(isExternal);
    },
  });

  // Copied verbatim from VehiclesList so all three pages share one cache entry
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
    () => vehicles.filter((v) => (tab === "sold" ? v.status === "Sold" : v.status !== "Sold")),
    [vehicles, tab]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inTab.filter((v) => {
      const matchesSearch = !q
        || (v.make || "").toLowerCase().includes(q)
        || (v.model || "").toLowerCase().includes(q)
        || (v.trim || "").toLowerCase().includes(q)
        || (v.vin || "").toLowerCase().includes(q)
        || (v.source_company || "").toLowerCase().includes(q);
      const matchesCondition = conditionFilter === "all" || v.condition === conditionFilter;
      const matchesSource = sourceFilter === "all" || v.source_company === sourceFilter;
      const periodDate = tab === "sold"
        ? (soldMap.get(v.id)?.date ?? v.date_arrived ?? v.created_at)
        : (v.date_arrived ?? v.created_at);
      return matchesSearch && matchesCondition && matchesSource
        && matchesPeriod(periodDate, month, week);
    });
  }, [inTab, search, conditionFilter, sourceFilter, month, week, tab, soldMap]);

  const stats = useMemo(() => {
    if (tab === "sold") {
      // revenue − cost is office − actual here: exactly the commission earned
      const t = soldTotals(filtered, soldMap);
      return { kind: "sold" as const, ...t };
    }
    return { kind: "active" as const, ...outsideTotals(filtered) };
  }, [filtered, soldMap, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", "Vehicle", id, { inventory_type: "external" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Outside car removed");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to remove the car"),
  });

  /** Brings a brokered car onto the stand: it becomes ordinary stock. */
  const moveToStandMutation = useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().split("T")[0];
      const vehicle = vehicles.find((v) => v.id === id);
      const { error } = await supabase
        .from("vehicles")
        .update({
          inventory_type: INVENTORY_MAIN,
          date_arrived: vehicle?.date_arrived || today,
        })
        .eq("id", id);
      if (error) throw error;
      await logAction("STATUS_CHANGE", "Vehicle", id, { inventory_type: "main", from: "external" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Moved onto the stand — it now appears under Vehicles");
      setMoveId(null);
    },
    onError: () => toast.error("Could not move the car onto the stand"),
  });

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportRows = () =>
    filtered.map((v) => {
      const f = soldFigure(v, soldMap);
      return {
        Make: v.make, Model: v.model, Trim: v.trim || "", Year: v.year,
        VIN: v.vin || "", Colour: v.color || "",
        "Actual Price": Number(v.cost_price || 0),
        "Office Price": Number(v.price || 0),
        Margin: marginOf(v.cost_price, v.price),
        Markup: markupLabel(v.cost_price, v.price) ?? "",
        "Sold Price": v.status === "Sold" ? f.amount : "",
        "Sold Date": v.status === "Sold" && f.date ? shortDate(f.date) : "",
        Status: v.status, Condition: v.condition || "",
        "Owner / Source": v.source_company || "",
        "Date Snapped": v.date_arrived || "",
      };
    });

  const tableRows = () =>
    filtered.map((v) => {
      const f = soldFigure(v, soldMap);
      return {
        vehicle: `${v.year} ${v.make} ${v.model}`.trim(),
        vin: v.vin || "—",
        actual: formatNaira(v.cost_price),
        office: formatNaira(tab === "sold" ? f.amount : v.price),
        margin: formatNaira(marginOf(v.cost_price, v.price)),
        source: v.source_company || "—",
        status: v.status,
      };
    });

  const tableColumns = [
    { key: "vehicle", label: "Vehicle" },
    { key: "vin", label: "VIN" },
    { key: "actual", label: "Actual Price" },
    { key: "office", label: tab === "sold" ? "Sold Price" : "Office Price" },
    { key: "margin", label: "Margin" },
    { key: "source", label: "Owner / Source" },
    { key: "status", label: "Status" },
  ];

  const handleExportCSV = () => {
    exportToCSV(exportRows(), `outside_cars_${tab}`);
    logAction("EXPORT", "Vehicle", null, { format: "csv", scope: "outside", rows: filtered.length });
  };
  const handleExportJSON = () => {
    exportToJSON(exportRows(), `outside_cars_${tab}`);
    logAction("EXPORT", "Vehicle", null, { format: "json", scope: "outside", rows: filtered.length });
  };
  const handlePrint = () => {
    printTable(`Outside Cars — ${tab === "sold" ? "Sold" : "Active"} — Manga Automobiles`,
      tableRows(), tableColumns);
    logAction("PRINT", "Vehicle", null, { scope: "outside", rows: filtered.length });
  };
  const handlePDF = async () => {
    await downloadTableAsPDF(`Outside Cars — ${tab === "sold" ? "Sold" : "Active"}`,
      tableRows(), tableColumns);
    logAction("EXPORT", "Vehicle", null, { format: "pdf", scope: "outside", rows: filtered.length });
  };

  const resetFilters = () => {
    setSearch(""); setConditionFilter("all"); setSourceFilter("all");
    setMonth(ALL_TIME); setWeek(ALL_WEEKS); setPage(0);
  };

  /** The +10% / Edited chip beside an office price. */
  const MarkupChip = ({ v }: { v: any }) => {
    const label = markupLabel(v.cost_price, v.price);
    if (!label) return null;
    const standard = isStandardMarkup(v.cost_price, v.price);
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
        standard ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
      }`}>
        {standard ? "+10%" : `${label} · edited`}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-amber-500/10 shrink-0">
            <MapPinned className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Outside Cars</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cars snapped outside the stand — the owner's price and ours.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {hasCreate && (
            <Button asChild
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-lg shadow-amber-500/20">
              <Link to="/vehicles/new?type=external">
                <PlusCircle className="h-4 w-4 mr-2" /> Add Outside Car
              </Link>
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

      {/* Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.kind === "active" ? (
          <>
            <StatTile label="Cars outside" value={stats.units} />
            <StatTile label="Total actual value" value={formatNaira(stats.actual)}
              sub="What the owners want" />
            <StatTile label="Total office value" value={formatNaira(stats.office)}
              tone="text-amber-500" sub="What we quote" />
            <StatTile label="Our margin" value={formatNaira(stats.margin)}
              tone={stats.margin >= 0 ? "text-emerald-500" : "text-rose-500"} />
          </>
        ) : (
          <>
            <StatTile label="Units sold" value={stats.units} />
            <StatTile label="Revenue" value={formatNaira(stats.revenue)} tone="text-blue-500" />
            <StatTile label="Owners' price" value={formatNaira(stats.cost)} />
            <StatTile label="Our margin" value={formatNaira(stats.profit)}
              tone={stats.profit >= 0 ? "text-emerald-500" : "text-rose-500"} />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl border border-white/5 p-4 flex flex-col xl:flex-row gap-3 xl:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, VIN or owner..."
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
              {VEHICLE_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl max-h-[260px]">
              <SelectItem value="all" className="text-sm">All owners</SelectItem>
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
              className={`h-8 w-8 rounded-lg ${view === "cards" ? "bg-amber-500/15 text-amber-500" : ""}`}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Table view" onClick={() => setView("table")}
              className={`h-8 w-8 rounded-lg ${view === "table" ? "bg-amber-500/15 text-amber-500" : ""}`}>
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
          <div className="bg-amber-500/10 p-5 rounded-full mb-4">
            <MapPinned className="h-9 w-9 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">No outside cars here</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            Cars you snap outside the stand appear here, with the owner's price and the
            office price side by side.
          </p>
          {hasCreate && (
            <Button asChild className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-0">
              <Link to="/vehicles/new?type=external">Add the first one</Link>
            </Button>
          )}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((v) => {
            const f = soldFigure(v, soldMap);
            const isSold = v.status === "Sold";
            return (
              <div key={v.id} className="bento-card overflow-hidden flex flex-col">
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
                      className="inline-block mt-2 text-[11px] font-semibold text-amber-300 hover:underline"
                    >
                      {v.source_company}
                    </Link>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {v.condition || "Unknown"} ·{" "}
                    {isSold ? `Sold ${f.date ? shortDate(f.date) : "—"}` : `Snapped ${shortDate(v.date_arrived)}`}
                  </p>

                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      Actual {formatNaira(v.cost_price)}
                    </p>
                    <p className={`text-2xl font-bold ${isSold ? "text-blue-500" : "text-amber-500"}`}>
                      {formatNaira(isSold ? f.amount : v.price)}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <MarkupChip v={v} />
                      <span className="text-[11px] text-muted-foreground">
                        margin {formatNaira(marginOf(v.cost_price, v.price))}
                      </span>
                    </div>
                  </div>

                  <RecordActions
                    menuLabel={`More actions for ${v.make} ${v.model}`}
                    primary={[
                      { label: "Details", icon: Eye, to: `/vehicles/${v.id}` },
                      {
                        label: "To stand", icon: Warehouse,
                        onClick: () => setMoveId(v.id), show: hasEdit && !isSold,
                      },
                    ]}
                    menu={[
                      { label: "Edit car", icon: Pencil, to: `/vehicles/${v.id}/edit`, show: hasEdit },
                      {
                        label: "Remove outside car", icon: Trash2,
                        onClick: () => setDeleteId(v.id), destructive: true, show: hasDelete,
                      },
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader className="bg-foreground/5">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="px-6 font-semibold">Vehicle</TableHead>
                  <TableHead className="font-semibold">Chassis (VIN)</TableHead>
                  <TableHead className="font-semibold">Owner / Source</TableHead>
                  <TableHead className="font-semibold">Actual price</TableHead>
                  <TableHead className="font-semibold">{tab === "sold" ? "Sold price" : "Office price"}</TableHead>
                  <TableHead className="font-semibold">Margin</TableHead>
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
                          <div className="p-2 rounded-lg bg-foreground/5 group-hover:bg-amber-500/10">
                            <MapPinned className="h-4 w-4 text-amber-500" />
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
                      <TableCell className="max-w-[140px] truncate text-sm" title={v.source_company || ""}>
                        {v.source_company
                          ? <Link to={`/source-company/${encodeURIComponent(v.source_company)}`}
                                  className="hover:underline text-amber-500">{v.source_company}</Link>
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{formatNaira(v.cost_price)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className={`text-sm font-bold ${isSold ? "text-blue-500" : "text-amber-500"}`}>
                            {formatNaira(isSold ? f.amount : v.price)}
                          </span>
                          <MarkupChip v={v} />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {formatNaira(marginOf(v.cost_price, v.price))}
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
                        <RecordActions
                          inline
                          menuLabel={`More actions for ${v.make} ${v.model}`}
                          primary={[{ label: "Details", icon: Eye, to: `/vehicles/${v.id}` }]}
                          menu={[
                            {
                              label: "Move onto the stand", icon: Warehouse,
                              onClick: () => setMoveId(v.id), show: hasEdit && !isSold,
                            },
                            { label: "Edit car", icon: Pencil, to: `/vehicles/${v.id}/edit`, show: hasEdit },
                            {
                              label: "Remove outside car", icon: Trash2, destructive: true,
                              onClick: () => setDeleteId(v.id), show: hasDelete,
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <CustomPagination
          page={safePage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
          sizes={[20, 50, 100]}
        />
      )}

      {filtered.length === 0 && (search || conditionFilter !== "all" || sourceFilter !== "all"
        || month !== ALL_TIME || week !== ALL_WEEKS) && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={resetFilters} className="rounded-xl border-white/10">
            Clear filters
          </Button>
        </div>
      )}

      {/* Move onto the stand */}
      <AlertDialog open={!!moveId} onOpenChange={() => setMoveId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Move this car onto the stand?</AlertDialogTitle>
            <AlertDialogDescription>
              It becomes ordinary stock: it moves to the Vehicles page, counts towards the
              stand, and can be signed in and out. Both prices are kept as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => moveId && moveToStandMutation.mutate(moveId)}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
            >
              {moveToStandMutation.isPending ? "Moving..." : "Move onto the stand"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this outside car?</AlertDialogTitle>
            <AlertDialogDescription>
              The record and its images will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="rounded-xl bg-destructive hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
