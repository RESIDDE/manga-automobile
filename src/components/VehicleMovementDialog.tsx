import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { isMissingSchema } from "@/lib/dbCompat";
import { logAction } from "@/lib/logger";
import {
  movementStateOf, movementsFor, type MovementRow, type MovementState,
} from "@/lib/vehicleMovements";

const REASONS = ["Test drive", "Customer inspection", "Workshop", "Mechanic", "Errand", "Other"];

type Vehicle = {
  id: string;
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  vin?: string | null;
};

type Props = {
  vehicle: Vehicle | null;
  movements: MovementRow[];
  states: Map<string, MovementState>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const whenText = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** `datetime-local` wants a local-time string without the timezone suffix. */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Signing a car out of the stand and back in, with its full history.
 *
 * The direction is decided by the car's current state rather than by the
 * caller: a car that is out can only be signed in, and vice versa, so there is
 * no way to record two sign-outs in a row by mistake.
 */
export function VehicleMovementDialog({
  vehicle, movements, states, open, onOpenChange,
}: Props) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const state = vehicle ? movementStateOf(vehicle.id, states) : null;
  const direction: "out" | "in" = state?.isOut ? "in" : "out";
  const history = vehicle ? movementsFor(movements, vehicle.id) : [];

  const staffName = profile?.full_name || profile?.display_name || user?.email?.split("@")[0] || "";

  const [person, setPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [destination, setDestination] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");

  // Re-seed each time the dialog opens: signing out defaults to the staff
  // member, signing in defaults to whoever took it.
  useEffect(() => {
    if (!open || !vehicle) return;
    setPerson(direction === "in" ? (state?.person ?? staffName) : staffName);
    setPhone("");
    setReason(REASONS[0]);
    setOtherReason("");
    setDestination("");
    setNotes("");
    const due = new Date();
    due.setHours(18, 0, 0, 0);
    setExpected(direction === "out" ? toLocalInput(due) : "");
  }, [open, vehicle, direction, state?.person, staffName]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error("No vehicle selected");
      if (!person.trim()) throw new Error("Who is taking the car?");

      const payload = {
        vehicle_id: vehicle.id,
        direction,
        person_name: person.trim(),
        person_phone: phone.trim() || null,
        reason: direction === "out"
          ? (reason === "Other" ? (otherReason.trim() || "Other") : reason)
          : null,
        destination: direction === "out" ? (destination.trim() || null) : null,
        expected_return: direction === "out" && expected ? new Date(expected).toISOString() : null,
        notes: notes.trim() || null,
        recorded_by: user?.id ?? null,
        recorded_by_name: staffName || null,
        moved_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("vehicle_movements").insert(payload);
      if (error) {
        if (isMissingSchema(error, ["vehicle_movements"])) {
          throw new Error("Sign in / sign out needs the pending database migration.");
        }
        throw error;
      }
      await logAction("MOVEMENT", "Vehicle", vehicle.id, {
        direction, person_name: payload.person_name, reason: payload.reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-movements"] });
      toast.success(direction === "out" ? "Signed out of the stand" : "Signed back in");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Could not record the movement"),
  });

  if (!vehicle) return null;

  const title = `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || "Vehicle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 rounded-3xl glass-panel border-white/10 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="p-6 border-b border-white/5">
          <DialogTitle className="text-lg font-bold">
            {direction === "out" ? "Sign out of the stand" : "Sign back into the stand"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {title}{vehicle.vin ? ` · ${vehicle.vin}` : ""}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* What is happening now */}
          {state?.isOut && (
            <div className={`rounded-2xl border p-4 ${
              state.overdue ? "border-rose-500/30 bg-rose-500/10" : "border-amber-500/20 bg-amber-500/5"
            }`}>
              <p className="text-sm font-semibold flex items-center gap-2">
                <Clock className={`h-4 w-4 ${state.overdue ? "text-rose-500" : "text-amber-500"}`} />
                {state.overdue ? "Overdue" : "Currently out"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Taken by <span className="font-semibold text-foreground">{state.person || "someone"}</span>
                {state.reason ? ` for ${state.reason.toLowerCase()}` : ""} on {whenText(state.since)}.
                {state.expectedReturn ? ` Expected back ${whenText(state.expectedReturn)}.` : ""}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {direction === "out" ? "Taken by *" : "Returned by *"}
              </Label>
              <Input value={person} onChange={(e) => setPerson(e.target.value)}
                placeholder="Full name"
                className="h-10 rounded-xl bg-background/50 border-white/10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="080..."
                className="h-10 rounded-xl bg-background/50 border-white/10" />
            </div>

            {direction === "out" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Reason</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-panel border-white/10 rounded-xl">
                      {REASONS.map((r) => (
                        <SelectItem key={r} value={r} className="text-sm">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Destination</Label>
                  <Input value={destination} onChange={(e) => setDestination(e.target.value)}
                    placeholder="Where is it going?"
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                </div>
                {reason === "Other" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Reason (other)</Label>
                    <Input value={otherReason} onChange={(e) => setOtherReason(e.target.value)}
                      className="h-10 rounded-xl bg-background/50 border-white/10" />
                  </div>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Expected back</Label>
                  <Input type="datetime-local" value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                </div>
              </>
            )}

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth recording..."
                className="rounded-xl min-h-[70px] bg-background/50 border-white/10" />
            </div>
          </div>

          {/* History */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Movement history
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                This car has not been signed out before.
              </p>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <Table>
                  <TableHeader className="bg-foreground/5">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="font-semibold">Movement</TableHead>
                      <TableHead className="font-semibold">Person</TableHead>
                      <TableHead className="font-semibold">When</TableHead>
                      <TableHead className="font-semibold">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((m) => (
                      <TableRow key={m.id} className="border-border/10">
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${
                            m.direction === "out" ? "text-amber-500" : "text-emerald-500"
                          }`}>
                            {m.direction === "out"
                              ? <><ArrowUpRight className="h-3.5 w-3.5" /> Out</>
                              : <><ArrowDownLeft className="h-3.5 w-3.5" /> In</>}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{m.person_name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {whenText(m.moved_at || m.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.reason || "—"}
                          {m.destination ? <span className="text-muted-foreground"> · {m.destination}</span> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-white/5 bg-foreground/5 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}
            className="rounded-xl border-white/10 hover:bg-white/5">
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!person.trim() || saveMutation.isPending}
            className={`rounded-xl text-white border-0 ${
              direction === "out"
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-emerald-500 hover:bg-emerald-600"
            }`}
          >
            {saveMutation.isPending
              ? "Saving..."
              : direction === "out" ? "Sign out" : "Sign back in"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
