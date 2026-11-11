import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ArrowUpRight, Building2, Car, Contact, Download, Phone, PlusCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate } from "@/lib/permissions";
import { formatNaira } from "@/lib/numberToWords";
import { shortDate } from "@/lib/historyFilters";
import { isExternal } from "@/lib/inventoryType";
import {
  groupSources, sourceMatches, vehicleMatches, type Source, type SourceVehicle,
} from "@/lib/sources";
import { exportPhoneNumbers } from "@/lib/phoneExport";

const PAGE_SIZE = 12;

/** Status pill used in both the hover preview and the full list. */
const StatusPill = ({ status }: { status: string | null }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
    status === "Available" ? "bg-emerald-500/10 text-emerald-500"
      : status === "Sold" ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
  }`}>
    {status || "—"}
  </span>
);

const vehicleName = (v: SourceVehicle) => [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";

/**
 * Sources: the companies and people vehicles are bought from, built from the
 * "Company / Owner" field on each vehicle. Hover a card for a preview of what
 * they supplied; click it for the full, searchable list.
 */
export default function Sources() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, "vehicles", permissions);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openName, setOpenName] = useState<string | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles", "sources"],
    queryFn: async () => {
      // select("*") because the contact columns arrived with a later migration
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .not("source_company", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SourceVehicle[];
    },
  });

  const sources = useMemo(() => groupSources(vehicles), [vehicles]);
  const filtered = useMemo(() => sources.filter((s) => sourceMatches(s, search)), [sources, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const open = sources.find((s) => s.name === openName) ?? null;
  const openVehicles = open ? open.vehicles.filter((v) => vehicleMatches(v, vehicleSearch)) : [];

  const totals = useMemo(() => ({
    sources: sources.length,
    vehicles: sources.reduce((n, s) => n + s.vehicles.length, 0),
    withPhone: sources.filter((s) => s.phone || s.repPhone).length,
  }), [sources]);

  const openSource = (s: Source) => {
    setVehicleSearch(search); // a search that found a car carries into the list
    setOpenName(s.name);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const count = await exportPhoneNumbers();
      if (count === 0) toast.info("No phone numbers recorded yet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export phone numbers");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-sky-500/10 shrink-0">
            <Building2 className="h-6 w-6 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sources</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Companies and people we buy vehicles from. A source appears here as soon as a
              vehicle names it as its company / owner.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting}
            className="rounded-xl border-white/10 hover:bg-white/5">
            <Download className="h-4 w-4 mr-2" /> {exporting ? "Exporting…" : "Export phone numbers"}
          </Button>
          {hasCreate && (
            <Button asChild className="rounded-xl bg-sky-500 hover:bg-sky-600 text-white border-0">
              <Link to="/vehicles/new"><PlusCircle className="h-4 w-4 mr-2" /> Record a vehicle</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Sources", value: totals.sources },
          { label: "Vehicles sourced", value: totals.vehicles },
          { label: "With a phone number", value: totals.withPhone },
        ].map((t) => (
          <div key={t.label} className="bento-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-bold mt-1">{t.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search a source, phone number, or a car they supplied (make, model, VIN)…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="h-11 pl-9 rounded-xl bg-background/50 border-white/10"
        />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center text-center">
          <div className="bg-sky-500/10 p-5 rounded-full mb-4">
            <Building2 className="h-9 w-9 text-sky-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">{search ? "No source matches that search" : "No sources yet"}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {search
              ? "Try a name, a phone number, or the make, model or VIN of a car."
              : "Fill in “Company / Owner Name” when you record a vehicle and the source appears here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((s) => {
            const matching = search ? s.vehicles.filter((v) => vehicleMatches(v, search)).length : 0;
            return (
              <HoverCard key={s.name} openDelay={250} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openSource(s)}
                    className="bento-card p-5 text-left flex flex-col gap-3 transition-colors hover:border-sky-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Last supplied {shortDate(s.lastDate)}
                        </p>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-500/10 text-sky-500 px-2.5 py-1 text-xs font-bold">
                        <Car className="h-3.5 w-3.5" /> {s.vehicles.length}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {s.phone}</p>}
                      {(s.repName || s.repPhone) && (
                        <p className="flex items-center gap-1.5">
                          <Contact className="h-3.5 w-3.5" />
                          {[s.repName, s.repPhone].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {!s.phone && !s.repName && !s.repPhone && <p className="italic">No contact details recorded</p>}
                    </div>
                    <p className="text-xs mt-auto pt-2 border-t border-white/5 flex justify-between">
                      <span className="text-muted-foreground">Total cost</span>
                      <span className="font-semibold">{formatNaira(s.totalCost)}</span>
                    </p>
                    {matching > 0 && (
                      <p className="text-[11px] font-semibold text-sky-500">
                        {matching} matching vehicle{matching === 1 ? "" : "s"}
                      </p>
                    )}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent align="start" className="w-80 p-0 overflow-hidden">
                  <p className="px-4 py-2.5 text-xs font-semibold border-b bg-foreground/5">
                    {s.vehicles.length} vehicle{s.vehicles.length === 1 ? "" : "s"} from {s.name}
                  </p>
                  <ul className="divide-y max-h-64 overflow-y-auto">
                    {s.vehicles.slice(0, 6).map((v) => (
                      <li key={v.id} className="px-4 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{vehicleName(v)}</p>
                          <p className="text-muted-foreground font-mono text-[10px]">
                            {v.vin || "No VIN"} · {shortDate(v.date_arrived || v.created_at)}
                          </p>
                        </div>
                        <StatusPill status={v.status} />
                      </li>
                    ))}
                  </ul>
                  <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
                    {s.vehicles.length > 6 ? `+${s.vehicles.length - 6} more · ` : ""}Click the card to search them all
                  </p>
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
            className="rounded-lg border-white/10">Previous</Button>
          <span className="text-muted-foreground">Page {safePage + 1} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
            className="rounded-lg border-white/10">Next</Button>
        </div>
      )}

      {/* A source's vehicles */}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenName(null)}>
        <DialogContent className="max-w-3xl rounded-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {open.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {open.vehicles.length} vehicle{open.vehicles.length === 1 ? "" : "s"} · {formatNaira(open.totalCost)}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  {open.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {open.phone}</span>}
                  {(open.repName || open.repPhone) && (
                    <span className="inline-flex items-center gap-1">
                      <Contact className="h-3.5 w-3.5" /> Rep: {[open.repName, open.repPhone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </p>
              </DialogHeader>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search these vehicles by make, model, year or VIN…"
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  className="h-10 pl-9 rounded-xl"
                />
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-xl border divide-y">
                {openVehicles.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">No vehicle matches that search.</p>
                ) : openVehicles.map((v) => (
                  <Link
                    key={v.id}
                    to={`/vehicles/${v.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {vehicleName(v)}
                        {isExternal(v) && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-amber-500">Outside</span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{v.vin || "No VIN"}</span>
                        {" · "}{shortDate(v.date_arrived || v.created_at)}
                        {" · "}{formatNaira(v.cost_price)}
                      </p>
                    </div>
                    <StatusPill status={v.status} />
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>

              <Button variant="outline" asChild className="rounded-xl w-fit">
                <Link to={`/source-company/${encodeURIComponent(open.name)}`}>Open the full source page</Link>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
