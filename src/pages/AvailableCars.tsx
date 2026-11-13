import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Car, ChevronLeft, ChevronRight, Fuel, Gauge, MapPinned, Search, Settings2, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNaira } from "@/lib/numberToWords";
import { cn } from "@/lib/utils";

/**
 * What a Direct Sales Agent sees: available cars, on the stand and outside,
 * with one price — the office price. The rows come from get_dsa_vehicles(),
 * which only ever returns these fields: no cost, no owner, no contacts.
 */
type DsaCar = {
  id: string;
  make: string;
  model: string;
  trim_level: string | null;
  year: number;
  color: string | null;
  mileage: number | null;
  fuel_type: string | null;
  transmission: string | null;
  condition: string | null;
  description: string | null;
  location: "stand" | "outside";
  price: number;
  image_url: string | null;
  images: string[];
};

type Filter = "all" | "stand" | "outside";

const photosOf = (c: DsaCar) => [...new Set([...(c.images ?? []), ...(c.image_url ? [c.image_url] : [])])];
const titleOf = (c: DsaCar) => `${c.year} ${c.make} ${c.model}${c.trim_level ? ` ${c.trim_level}` : ""}`;

function LocationBadge({ location }: { location: DsaCar["location"] }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      location === "stand" ? "bg-emerald-500/15 text-emerald-600" : "bg-sky-500/15 text-sky-600",
    )}>
      {location === "stand" ? <Store className="h-3 w-3" /> : <MapPinned className="h-3 w-3" />}
      {location === "stand" ? "On the stand" : "Outside"}
    </span>
  );
}

export default function AvailableCars() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<DsaCar | null>(null);
  const [photo, setPhoto] = useState(0);

  const { data: cars = [], isLoading, error } = useQuery({
    queryKey: ["dsa-vehicles"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DsaCar[]> => {
      const { data, error } = await (supabase as any).rpc("get_dsa_vehicles");
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = useMemo(() => ({
    all: cars.length,
    stand: cars.filter((c) => c.location === "stand").length,
    outside: cars.filter((c) => c.location === "outside").length,
  }), [cars]);

  const shown = cars.filter((c) => {
    if (filter !== "all" && c.location !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [titleOf(c), c.color, c.fuel_type, c.transmission].some((v) => v?.toLowerCase().includes(q));
  });

  const photos = open ? photosOf(open) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 shrink-0">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Available Cars</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every car ready to sell, on the stand and outside, at the office price.
            </p>
          </div>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, colour…"
            className="pl-9 rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex p-1 bg-foreground/5 rounded-2xl gap-1 w-full sm:w-fit">
        {([["all", "All"], ["stand", "On the stand"], ["outside", "Outside"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              filter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label} <span className="opacity-70">({counts[key]})</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive">Couldn't load the cars: {(error as Error).message}</p>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-3xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Car className="h-10 w-10 mx-auto mb-3 opacity-50" />
          {cars.length ? "No cars match your search." : "No cars are available right now."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const cover = photosOf(c)[0];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setOpen(c); setPhoto(0); }}
                className="text-left rounded-3xl border bg-card overflow-hidden hover:border-primary/40 active:scale-[0.99] transition"
              >
                <div className="aspect-[16/10] bg-muted relative">
                  {cover
                    ? <img src={cover} alt={titleOf(c)} loading="lazy" className="h-full w-full object-cover" />
                    : <div className="h-full w-full grid place-items-center"><Car className="h-10 w-10 text-muted-foreground/40" /></div>}
                  <div className="absolute top-3 left-3"><LocationBadge location={c.location} /></div>
                </div>
                <div className="p-4 space-y-2">
                  <p className="font-bold leading-tight">{titleOf(c)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.color, c.transmission, c.fuel_type].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="text-xl font-black text-primary">{formatNaira(c.price)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden">
          {open && (
            <>
              <div className="aspect-[16/10] bg-muted relative">
                {photos.length
                  ? <img src={photos[photo]} alt={titleOf(open)} className="h-full w-full object-cover" />
                  : <div className="h-full w-full grid place-items-center"><Car className="h-12 w-12 text-muted-foreground/40" /></div>}
                {photos.length > 1 && (
                  <>
                    <button type="button" aria-label="Previous photo"
                      onClick={() => setPhoto((p) => (p - 1 + photos.length) % photos.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 text-white grid place-items-center">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" aria-label="Next photo"
                      onClick={() => setPhoto((p) => (p + 1) % photos.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 text-white grid place-items-center">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/50 text-white text-xs px-2 py-0.5">
                      {photo + 1} / {photos.length}
                    </span>
                  </>
                )}
              </div>
              <div className="p-6 space-y-4">
                <DialogHeader className="text-left space-y-2">
                  <LocationBadge location={open.location} />
                  <DialogTitle className="text-xl">{titleOf(open)}</DialogTitle>
                  <DialogDescription className="text-2xl font-black text-primary">{formatNaira(open.price)}</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {[
                    [Gauge, "Mileage", open.mileage ? `${Number(open.mileage).toLocaleString()} km` : "—"],
                    [Fuel, "Fuel", open.fuel_type || "—"],
                    [Settings2, "Gearbox", open.transmission || "—"],
                    [Car, "Colour", open.color || "—"],
                  ].map(([Icon, label, value]: any) => (
                    <div key={label} className="rounded-2xl bg-muted/50 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Icon className="h-3 w-3" /> {label}
                      </p>
                      <p className="font-semibold mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                {open.condition && <p className="text-sm"><span className="text-muted-foreground">Condition:</span> {open.condition}</p>}
                {open.description?.trim() && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{open.description}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
