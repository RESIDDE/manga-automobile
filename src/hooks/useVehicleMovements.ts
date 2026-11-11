import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchema, warnOnce } from "@/lib/dbCompat";
import {
  buildMovementMap, standCount, type MovementRow, type MovementState,
} from "@/lib/vehicleMovements";

const MOVEMENT_COLUMNS =
  "id, vehicle_id, direction, moved_at, person_name, person_phone, " +
  "reason, destination, expected_return, notes, recorded_by_name, created_at";

/**
 * Every sign-in and sign-out, plus the derived current state per vehicle.
 *
 * `firstWorkingSelect` cannot help here — its contract is that the last attempt
 * always works, and nothing works when the whole table is missing. So a missing
 * `vehicle_movements` degrades to an empty list, which reads as **every car is
 * on the stand**. The Vehicles page is the most-used screen in the app and must
 * never blank because a migration is pending.
 */
export function useVehicleMovements(vehicles: { id: string }[] = []) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["vehicle-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_movements")
        .select(MOVEMENT_COLUMNS)
        .order("moved_at", { ascending: false });

      if (error) {
        if (isMissingSchema(error, ["vehicle_movements"])) {
          warnOnce("vehicle_movements", () => toast.warning(
            "Sign in / sign out is waiting on the pending database migration."
          ));
          return [] as MovementRow[];
        }
        throw error;
      }
      return (data ?? []) as unknown as MovementRow[];
    },
  });

  const states = useMemo(
    () => buildMovementMap(movements as MovementRow[]),
    [movements]
  );

  const counts = useMemo(() => standCount(vehicles, states), [vehicles, states]);

  return { movements: movements as MovementRow[], states, counts, isLoading };
}

export type { MovementRow, MovementState };
