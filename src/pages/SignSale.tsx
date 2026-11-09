import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, PenLine, ShieldCheck } from "lucide-react";
import {
  SaleReceiptDocument, type ReceiptBankDetails, type ReceiptLineItem,
} from "@/components/SaleReceiptDocument";
import { withSchemaFallback } from "@/lib/dbCompat";
import { formatNaira } from "@/lib/numberToWords";
import { derivePaymentState } from "@/lib/receipts";

const SALE_SELECT_WITH_PAYMENTS = `
  *,
  customer:customers(name, phone, email, address),
  sale_vehicles(price, vehicle:vehicles(make, model, year, trim, vin, color)),
  sale_payments(*)
`;

const SALE_SELECT_BASE = `
  *,
  customer:customers(name, phone, email, address),
  sale_vehicles(price, vehicle:vehicles(make, model, year, trim, vin, color))
`;

/**
 * Public signing page for a sale. The customer sees the *actual* receipt they
 * will be given — the same <SaleReceiptDocument /> the office prints — with
 * their signature appearing on it as they draw, so nothing about the document
 * is a surprise after they sign.
 */
export default function SignSale() {
  const { id } = useParams<{ id: string }>();
  const [signature, setSignature] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale-sign", id],
    enabled: !!id,
    queryFn: async () =>
      // sale_payments arrives with a migration; without it the receipt falls
      // back to the stored payment status rather than failing to load at all.
      withSchemaFallback(
        () => supabase.from("sales").select(SALE_SELECT_WITH_PAYMENTS).eq("id", id).single(),
        () => supabase.from("sales").select(SALE_SELECT_BASE).eq("id", id).single(),
        ["sale_payments"]
      ) as Promise<any>,
  });

  // Bank details are nice to have here; a public visitor may not be allowed to
  // read settings, in which case the panel is simply left off the document.
  const { data: bank = {} as ReceiptBankDetails } = useQuery({
    queryKey: ["sale-sign-bank"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("key, value")
        .in("key", ["bank_name", "account_number", "account_name"]);
      if (error) return {} as ReceiptBankDetails;
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: any) => { map[row.key] = row.value ?? ""; });
      return {
        bank_name: map.bank_name || "",
        account_number: map.account_number || "",
        account_name: map.account_name || "",
      } as ReceiptBankDetails;
    },
  });

  const items: ReceiptLineItem[] = useMemo(() => {
    if (!sale) return [];
    const links: any[] = sale.sale_vehicles ?? [];
    const total = Number(sale.sale_price || 0);
    const share = links.length ? total / links.length : total;

    if (links.length === 0) {
      return [{ id: `${sale.id}-vehicle`, description: "Vehicle", amount: total }];
    }

    return links.map((link, i) => {
      const v = link.vehicle ?? {};
      const own = Number(link.price || 0);
      return {
        id: `${sale.id}-${i}`,
        description: [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle",
        vin: v.vin ?? null,
        color: v.color ?? null,
        trim: v.trim ?? null,
        amount: own > 0 ? own : share,
      };
    });
  }, [sale]);

  const handleSubmit = async () => {
    if (!signature || !id) return;
    setSaving(true);

    const { error } = await supabase
      .from("sales")
      .update({
        buyer_signature: signature,
        buyer_signature_date: new Date().toISOString().split("T")[0],
      })
      .eq("id", id);

    setSaving(false);
    if (error) {
      console.error("Signature save error:", error);
      toast.error(`Could not save signature: ${error.message || "Permission denied"}`);
      return;
    }
    setSubmitted(true);
    toast.success("Signature recorded");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 bg-foreground/5 rounded-full mb-4" />
          <div className="h-4 w-32 bg-foreground/5 rounded" />
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="glass-panel p-8 text-center rounded-3xl border-white/10 max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold">Invalid signing link</h2>
          <p className="text-muted-foreground mt-2">
            This sale record could not be found, or the link has expired.
          </p>
        </Card>
      </div>
    );
  }

  const state = derivePaymentState(sale);
  const alreadySigned = !!sale.buyer_signature && !submitted;
  // The signature lands on the document as it is drawn, so the customer can see
  // exactly where it goes before committing.
  const documentSale = {
    ...sale,
    buyer_signature: signature || sale.buyer_signature || null,
    buyer_signature_date:
      signature && !sale.buyer_signature_date
        ? new Date().toISOString().split("T")[0]
        : sale.buyer_signature_date,
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-[232mm] mx-auto px-4 py-8 space-y-6">
        {/* Instruction only — the document below carries its own title and number */}
        <div className="text-center">
          <div className="bg-violet-500/10 p-3 rounded-2xl inline-block mb-3">
            <ShieldCheck className="h-7 w-7 text-violet-500" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
            Please review and sign
          </h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xl mx-auto">
            Below is the exact document you will receive. Read it through, then sign at the bottom —
            your signature appears on the document as you draw it.
          </p>
        </div>

        {submitted ? (
          <Card className="glass-panel border-white/10 rounded-3xl shadow-xl">
            <CardContent className="py-10 text-center">
              <div className="bg-emerald-500/10 p-5 rounded-full inline-block mb-5">
                <CheckCircle className="h-11 w-11 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold">Signed — thank you</h2>
              <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
                Your signature has been recorded on the document below. A copy will be issued to
                you by {sale.rep_name || "Manga Automobiles"}. You can close this page.
              </p>
            </CardContent>
          </Card>
        ) : alreadySigned ? (
          <Card className="glass-panel border-emerald-500/20 rounded-3xl">
            <CardContent className="py-6 flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold">This document is already signed</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Signed on{" "}
                  {sale.buyer_signature_date
                    ? new Date(sale.buyer_signature_date).toLocaleDateString("en-GB")
                    : "file"}
                  . It is shown below for your records — sign again only if the dealership asks you to.
                </p>
                <Button
                  variant="outline"
                  className="rounded-xl border-white/10 mt-3"
                  onClick={() => {
                    // Let them re-sign deliberately rather than by accident
                    setSignature("");
                    document.getElementById("sign-panel")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <PenLine className="h-4 w-4 mr-2" /> Sign again
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* The document itself — the same component the office prints */}
        <div className="print-pages-container">
          <SaleReceiptDocument
            sale={documentSale}
            customer={sale.customer ?? {}}
            items={items}
            bank={bank}
          />
        </div>

        {/* Signing panel */}
        <Card id="sign-panel" className="glass-panel border-white/10 rounded-3xl shadow-xl overflow-hidden print:hidden">
          <div className="bg-amber-500/10 border-b border-amber-500/10 p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-500 uppercase tracking-wider text-[11px]">
                Refund policy
              </h4>
              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                By signing you confirm the details on the document above are correct and accept that{" "}
                <strong className="text-foreground">no refund of money is made after payment</strong>.
                If you decide not to go on with the transaction, your money is returned only after
                the said car is sold.
              </p>
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total", value: formatNaira(state.total) },
                { label: "Amount paid", value: formatNaira(state.totalPaid) },
                { label: "Balance due", value: formatNaira(state.balance) },
              ].map((tile) => (
                <div key={tile.label} className="rounded-2xl bg-foreground/5 border border-white/5 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {tile.label}
                  </p>
                  <p className="text-sm sm:text-base font-bold mt-1">{tile.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold">
                Sign here — buyer
              </p>
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50 hover:border-violet-500/30 transition-colors">
                <SignaturePad value={signature} onChange={setSignature} />
              </div>
              <p className="text-[11px] text-center text-muted-foreground">
                Use your finger on a phone, or your mouse on a computer. Your signature appears on
                the Buyer line of the document above.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!signature || saving}
              className="w-full h-14 rounded-2xl bg-violet-500 hover:bg-violet-600 text-white font-bold shadow-lg shadow-violet-500/20 active:scale-[0.98] transition-all text-base"
            >
              {saving ? "Submitting..." : "Sign & accept this document"}
            </Button>

            <p className="text-[11px] text-center text-muted-foreground opacity-70">
              This is a legally binding digital signature. Sales representative:{" "}
              <strong>{sale.rep_name || "Manga Automobiles"}</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
