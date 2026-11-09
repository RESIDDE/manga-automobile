import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, Car, Eye, Phone } from "lucide-react";
import { buildSoldPriceMap, soldFigure } from "@/lib/soldPrice";
import { firstWorkingSelect } from "@/lib/dbCompat";
import { formatNaira } from "@/lib/numberToWords";
import { shortDate } from "@/lib/historyFilters";

/** Every vehicle that came from one source company, with its totals. */
export default function SourceCompany() {
  const { name = "" } = useParams();
  const company = decodeURIComponent(name);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles", "source", company],
    queryFn: async () => {
      // Skip the large text columns; this page only lists and totals. The
      // contact columns arrive with a migration, so fall back to select("*").
      return firstWorkingSelect<any[]>([
        () => supabase
          .from("vehicles")
          .select("id, make, model, year, vin, price, cost_price, status, date_arrived, source_company, source_company_phone, source_rep_name")
          .eq("source_company", company)
          .order("created_at", { ascending: false }) as any,
        () => supabase
          .from("vehicles")
          .select("*")
          .eq("source_company", company)
          .order("created_at", { ascending: false }) as any,
      ]);
    },
  });

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

  const totals = useMemo(() => {
    let cost = 0, asking = 0, soldRevenue = 0, soldUnits = 0;
    for (const v of vehicles) {
      cost += Number(v.cost_price || 0);
      asking += Number(v.price || 0);
      if (v.status === "Sold") {
        soldUnits += 1;
        soldRevenue += soldFigure(v, soldMap).amount;
      }
    }
    return { units: vehicles.length, cost, asking, soldUnits, soldRevenue };
  }, [vehicles, soldMap]);

  const phone = vehicles.find((v) => v.source_company_phone)?.source_company_phone;
  const rep = vehicles.find((v) => v.source_rep_name)?.source_rep_name;

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <Button variant="outline" asChild className="rounded-xl border-white/10 hover:bg-white/5">
        <Link to="/vehicles"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Vehicles</Link>
      </Button>

      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-sky-500/10 shrink-0">
          <Building2 className="h-6 w-6 text-sky-500" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{company}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
            <span>{totals.units} vehicle{totals.units === 1 ? "" : "s"} supplied</span>
            {rep && <span>Rep: {rep}</span>}
            {phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {phone}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Units supplied", value: String(totals.units) },
          { label: "Total cost", value: formatNaira(totals.cost) },
          { label: "Total asking", value: formatNaira(totals.asking) },
          { label: `Sold (${totals.soldUnits})`, value: formatNaira(totals.soldRevenue) },
        ].map((tile) => (
          <div key={tile.label} className="bento-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </p>
            <p className="text-2xl font-bold mt-1">{tile.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center text-center">
          <div className="bg-sky-500/10 p-5 rounded-full mb-4">
            <Car className="h-9 w-9 text-sky-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">Nothing from this source yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            No vehicle records name {company} as their source company.
          </p>
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[680px]">
              <TableHeader className="bg-foreground/5">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="px-6 font-semibold">Vehicle</TableHead>
                  <TableHead className="font-semibold">Chassis (VIN)</TableHead>
                  <TableHead className="font-semibold">Arrived</TableHead>
                  <TableHead className="font-semibold">Cost</TableHead>
                  <TableHead className="font-semibold">Asking / Sold</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right px-6 font-semibold">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => {
                  const isSold = v.status === "Sold";
                  const f = soldFigure(v, soldMap);
                  return (
                    <TableRow key={v.id} className="border-border/10 hover:bg-white/5">
                      <TableCell className="px-6 font-semibold text-sm">
                        {v.year} {v.make} {v.model}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.vin || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {shortDate(v.date_arrived)}
                      </TableCell>
                      <TableCell className="text-sm">{formatNaira(v.cost_price)}</TableCell>
                      <TableCell className={`text-sm font-bold ${isSold ? "text-blue-500" : ""}`}>
                        {formatNaira(isSold ? f.amount : v.price)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          v.status === "Available" ? "bg-emerald-500/10 text-emerald-500"
                            : isSold ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
                        }`}>
                          {v.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button variant="ghost" size="icon" asChild aria-label="View vehicle"
                          className="h-8 w-8 rounded-lg hover:bg-sky-500/10 hover:text-sky-500">
                          <Link to={`/vehicles/${v.id}`}><Eye className="h-4 w-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
