import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  Pencil, 
  Trash2, 
  Car, 
  Calendar, 
  Gauge, 
  Fuel, 
  Settings2, 
  BadgeCheck, 
  Coins, 
  Info,
  ChevronRight,
  Hash,
  Palette,
  Key,
  Building2,
  CalendarDays
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canDelete, canEdit } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";

export default function VehicleDetail() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasEdit = canEdit(role, "vehicles", permissions);
  const hasDelete = canDelete(role, "vehicles", permissions);
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: images = [] } = useQuery({
    queryKey: ["vehicle-images", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_images")
        .select("*")
        .eq("vehicle_id", id!);
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle deleted successfully");
      navigate("/vehicles");
    },
    onError: (err: any) => toast.error(`Failed to delete: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse space-y-4">
          <div className="h-12 w-64 bg-foreground/5 rounded-2xl mx-auto" />
          <div className="h-4 w-48 bg-foreground/5 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive">
          <Info className="h-12 w-12" />
        </div>
        <h2 className="text-2xl font-bold">Vehicle Not Found</h2>
        <Button variant="outline" onClick={() => navigate("/vehicles")}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const specItem = (Icon: any, label: string, value: any) => (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-foreground/[0.02] border border-white/5 hover:bg-foreground/[0.04] transition-colors">
      <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate max-w-[150px]">{value || "—"}</p>
      </div>
    </div>
  );

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "available": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "sold": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "reserved": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default: return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" className="pl-0 hover:bg-transparent -ml-2 text-muted-foreground hover:text-foreground group" onClick={() => navigate("/vehicles")}>
            <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            Back to Inventory
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black tracking-tight text-foreground">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h1>
            <Badge className={getStatusColor(vehicle.status)}>
              {vehicle.status}
            </Badge>
          </div>
          <p className="text-muted-foreground font-medium flex items-center gap-2">
            {vehicle.trim || "Standard Edition"} <ChevronRight className="h-3 w-3" /> {vehicle.vin}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasEdit && (
            <>
              <Button asChild className="rounded-2xl h-12 px-6 bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/20">
                <Link to={`/vehicles/${id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Details
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="rounded-2xl h-12 px-6 border-destructive/20 text-destructive hover:bg-destructive/5">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="glass-panel border-white/10 rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-xl">Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the 
                      <strong> {vehicle.year} {vehicle.make} {vehicle.model} </strong> 
                      from your inventory database.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                    >
                      Delete Vehicle
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Images & Description */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Gallery */}
          <div className="relative group">
            <div className="absolute inset-0 bg-violet-500/5 blur-3xl -z-10 rounded-3xl" />
            <Card className="glass-panel border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <CardContent className="p-2">
                {images.length > 0 ? (
                  <div className="space-y-4">
                    <div className="aspect-[16/9] w-full overflow-hidden rounded-[2rem] border border-white/5">
                      <img
                        src={images[0].image_url}
                        alt="Vehicle Primary"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {images.length > 1 && (
                      <div className="grid grid-cols-4 gap-4 px-2 pb-2">
                        {images.slice(1, 5).map((img, idx) => (
                          <div key={img.id} className="aspect-square rounded-2xl overflow-hidden border border-white/5 relative group/img">
                            <img
                              src={img.image_url}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                            />
                            {idx === 3 && images.length > 5 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                <span className="text-white font-bold">+{images.length - 5} More</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-[16/9] w-full bg-foreground/[0.03] rounded-[2rem] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-white/5">
                    <Car className="h-16 w-16 mb-4 opacity-20" />
                    <p className="font-medium">No images available for this vehicle</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          {vehicle.description && (
            <Card className="glass-panel border-white/10 rounded-[2rem]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Info className="h-5 w-5 text-violet-500" />
                  Description & Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {vehicle.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Technical Specs Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {specItem(Calendar, "Year", vehicle.year)}
            {specItem(Gauge, "Mileage", `${vehicle.mileage?.toLocaleString()} km`)}
            {specItem(Fuel, "Fuel Type", vehicle.fuel_type)}
            {specItem(Settings2, "Transmission", vehicle.transmission)}
            {specItem(Palette, "Exterior Color", vehicle.color)}
            {specItem(BadgeCheck, "Condition", vehicle.condition)}
          </div>
        </div>

        {/* Right Column: Pricing & Quick Actions */}
        <div className="space-y-8">
          {/* Pricing Card */}
          <Card className="glass-panel border-white/10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Coins className="h-24 w-24 text-violet-500" />
            </div>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-violet-500">Retail Value</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <p className="text-5xl font-black text-foreground">
                  ₦{vehicle.price?.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-500" /> Professional Appraisal Complete
                </p>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-medium">Acquisition Cost</span>
                  <span className="text-sm font-bold">₦{vehicle.cost_price?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-medium">Estimated Profit</span>
                  <span className="text-sm font-black text-emerald-500">
                    ₦{(vehicle.price - vehicle.cost_price)?.toLocaleString()}
                  </span>
                </div>
              </div>

              <Button className="w-full h-14 rounded-2xl bg-white text-black hover:bg-white/90 font-bold text-lg shadow-xl shadow-white/5" asChild>
                <Link to="/sales">
                  Record Sale Transaction
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Logistics & Registration */}
          <Card className="glass-panel border-white/10 rounded-[2rem]">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-violet-500" />
                Inventory Logistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                  <Hash className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">VIN / Chassis</p>
                  <p className="font-mono text-sm font-bold">{vehicle.vin || "NOT PROVIDED"}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Date Arrived</p>
                  <p className="text-sm font-bold">
                    {vehicle.date_arrived ? new Date(vehicle.date_arrived).toLocaleDateString(undefined, { dateStyle: 'long' }) : "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Keys Included</p>
                  <p className="text-sm font-bold">{vehicle.num_keys || 0} Sets of Keys</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Source Company</p>
                  <p className="text-sm font-bold">{vehicle.source_company || "Direct Purchase"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
