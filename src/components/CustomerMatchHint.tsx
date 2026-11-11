import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, UserCheck } from "lucide-react";
import { findCustomerMatches, type CustomerLike } from "@/lib/customerMatch";

type Props = {
  name?: string | null;
  phone?: string | null;
  /** The record being edited, so a customer never matches itself. */
  excludeId?: string | null;
  /** Given, each suggestion becomes a button that adopts that customer. */
  onPick?: (customer: CustomerLike) => void;
  className?: string;
};

/**
 * Warns, as the details are typed, that this customer may already be on file —
 * matched on the phone number first, and on the name as a weaker hint.
 *
 * Drop it under any name/phone pair. It reads the shared ["customers"] query, so
 * it adds no extra request on a page that already lists customers.
 */
export function CustomerMatchHint({ name, phone, excludeId, onPick, className = "" }: Props) {
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, address");
      if (error) throw error;
      return data as CustomerLike[];
    },
    staleTime: 60_000,
  });

  const matches = useMemo(
    () => findCustomerMatches(customers, { name, phone }, { excludeId }),
    [customers, name, phone, excludeId]
  );

  if (matches.length === 0) return null;

  const onPhone = matches[0].reason === "phone";

  return (
    <div
      role="status"
      className={`rounded-xl border p-3 space-y-2 animate-fade-in ${
        onPhone ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-foreground/5"
      } ${className}`}
    >
      <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${
        onPhone ? "text-amber-600" : "text-muted-foreground"
      }`}>
        {onPhone ? <AlertCircle className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
        {onPhone
          ? "This number is already on file"
          : matches.length === 1 ? "A customer with a similar name exists"
          : "Customers with a similar name exist"}
      </p>

      <ul className="space-y-1.5">
        {matches.map(({ customer }) => (
          <li key={customer.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate">{customer.name}</span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}
              </span>
            </span>
            {onPick && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onPick(customer)}
                className="h-7 shrink-0 rounded-lg border-white/10 text-[11px]"
              >
                Use this customer
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
