import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Car, Eye, FileText, LayoutGrid, Pencil, PlusCircle, Rows3, Search,
  Trash2, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/CurrencyInput";
import { CustomPagination } from "@/components/CustomPagination";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { RecordActions } from "@/components/RecordActions";
import { PrintSheet } from "@/components/PrintSheet";
import {
  COMPANY, MetaLabel, ModernLetterhead, PrintWatermark, MODERN_FONT, ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { VIN_FULL_LENGTH } from "@/lib/constants";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import { withSchemaFallback } from "@/lib/dbCompat";
import {
  ALL_TIME, ALL_WEEKS, longDate, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

const PAGE_KEY = "performance-quotes" as const;
const ENTITY = "Proforma Invoice";

const CONDITIONS = ["New", "Used", "Foreign Used", "Locally Used"];
const TRANSMISSIONS = ["Automatic", "Manual", "CVT"];
const CYLINDERS = ["V4", "V6", "V8", "V10", "V12", "Electric", "Other"];
const STATUSES = ["Draft", "Sent", "Accepted", "Expired"];

type QuoteItem = {
  key: string;
  vehicle_id: string | null;
  vehicle_description: string;
  vin: string;
  base_price: string;
  has_duty: boolean;
  duty_price: string;
  quantity: number;
  condition: string;
  transmission: string;
  cylinders: string;
};

const emptyManualVehicle = {
  make: "", model: "", year: "", vin: "", basePrice: "",
  condition: "Used", transmission: "Automatic", cylinders: "V4",
};

const newKey = () => Math.random().toString(36).slice(2, 10);

const itemAmount = (item: QuoteItem) => {
  const base = parseFloat((item.base_price || "0").replace(/,/g, "")) || 0;
  const duty = item.has_duty ? parseFloat((item.duty_price || "0").replace(/,/g, "")) || 0 : 0;
  return (base + duty) * (item.quantity || 1);
};
const itemUnitPrice = (item: QuoteItem) => {
  const base = parseFloat((item.base_price || "0").replace(/,/g, "")) || 0;
  const duty = item.has_duty ? parseFloat((item.duty_price || "0").replace(/,/g, "")) || 0 : 0;
  return base + duty;
};

type QuoteDoc = {
  id: string | null;
  /** The invoice's serial — 001, 002, … assigned by the database on save. */
  document_no: string | null;
  quote_date: string;
  status: string;
  customer: { name: string; phone: string; email: string; address: string };
  items: QuoteItem[];
  vat_percentage: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  notes: string;
};

const totalsOf = (items: QuoteItem[], vatPercentage: string) => {
  const subtotal = items.reduce((sum, i) => sum + itemAmount(i), 0);
  const vatPct = parseFloat(vatPercentage || "0") || 0;
  const vat = (subtotal * vatPct) / 100;
  return { subtotal, vatPct, vat, total: subtotal + vat };
};

// ─── The document ────────────────────────────────────────────────────────────

function ProformaDocument({ doc }: { doc: QuoteDoc }) {
  const { subtotal, vatPct, vat, total } = totalsOf(doc.items, doc.vat_percentage);
  // The serial the database assigned. A quote being previewed before its first
  // save has none yet, and says so rather than inventing one.
  const docNumber = doc.document_no || "DRAFT";
  const onlyVehicle = doc.items.length === 1 ? doc.items[0] : null;

  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[20mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        <ModernLetterhead docTitle="Proforma" docNumber={docNumber} />

        {/* Meta row */}
        <div className="grid grid-cols-4 gap-4 mb-5 pb-3" style={{ borderBottom: ROW_RULE }}>
          <div className="col-span-2">
            <MetaLabel>Billed to</MetaLabel>
            <p className="text-[12px] font-bold text-black">{doc.customer.name || "—"}</p>
            {doc.customer.phone && <p className="text-[10px] text-black">{doc.customer.phone}</p>}
            {doc.customer.address && <p className="text-[10px] text-black">{doc.customer.address}</p>}
            {doc.customer.email && <p className="text-[10px] text-black">{doc.customer.email}</p>}
          </div>
          <div>
            <MetaLabel>Date issued</MetaLabel>
            <p className="text-[10.5px] font-semibold text-black">{longDate(doc.quote_date)}</p>
            {onlyVehicle && (
              <>
                <div className="h-2" />
                <MetaLabel>Vehicle</MetaLabel>
                <p className="text-[10.5px] font-semibold text-black">
                  {onlyVehicle.vehicle_description}
                </p>
              </>
            )}
          </div>
          <div className="text-right">
            <MetaLabel>Status</MetaLabel>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-black">
              {doc.status}
            </p>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full border-collapse mb-5">
          <thead>
            <tr>
              <th className="text-left text-[9px] font-black uppercase tracking-[0.14em] text-black pb-1" style={{ borderBottom: RULE }}>
                Description
              </th>
              <th className="text-center text-[9px] font-black uppercase tracking-[0.14em] text-black pb-1 w-[48px]" style={{ borderBottom: RULE }}>
                Qty
              </th>
              <th className="text-right text-[9px] font-black uppercase tracking-[0.14em] text-black pb-1 w-[110px]" style={{ borderBottom: RULE }}>
                Unit Price
              </th>
              <th className="text-right text-[9px] font-black uppercase tracking-[0.14em] text-black pb-1 w-[120px]" style={{ borderBottom: RULE }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => {
              const specs = [item.vin, item.condition, item.transmission, item.cylinders]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={item.key}>
                  <td className="py-[6px] align-top" style={{ borderBottom: ROW_RULE }}>
                    <p className="text-[11px] font-semibold text-black">{item.vehicle_description}</p>
                    {specs && <p className="text-[8.5px] text-neutral-500 mt-[1px]">{specs}</p>}
                    {item.has_duty && (
                      <p className="text-[8.5px] text-neutral-500">Unit price includes customs duty</p>
                    )}
                  </td>
                  <td className="py-[6px] text-center text-[11px] text-black align-top" style={{ borderBottom: ROW_RULE }}>
                    {item.quantity}
                  </td>
                  <td className="py-[6px] text-right text-[11px] text-black align-top" style={{ borderBottom: ROW_RULE }}>
                    {formatNaira(itemUnitPrice(item))}
                  </td>
                  <td className="py-[6px] text-right text-[11px] font-semibold text-black align-top" style={{ borderBottom: ROW_RULE }}>
                    {formatNaira(itemAmount(item))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Words + summary */}
        <div className="flex items-start justify-between gap-8 mb-5">
          <div className="flex-1">
            <MetaLabel>Amount in words</MetaLabel>
            <p className="text-[10.5px] italic font-semibold text-black">{numberToWords(total)}</p>
          </div>
          <div className="w-[210px] shrink-0">
            <div className="flex justify-between text-[10.5px] text-black py-[3px]" style={{ borderBottom: ROW_RULE }}>
              <span>Subtotal</span>
              <span className="font-semibold">{formatNaira(subtotal)}</span>
            </div>
            {vatPct > 0 && (
              <div className="flex justify-between text-[10.5px] text-black py-[3px]" style={{ borderBottom: ROW_RULE }}>
                <span>VAT ({vatPct}%)</span>
                <span className="font-semibold">{formatNaira(vat)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13px] font-black text-black pt-[6px] mt-[2px]" style={{ borderTop: RULE }}>
              <span>Total</span>
              <span>{formatNaira(total)}</span>
            </div>
          </div>
        </div>

        {/* Payment details */}
        <div className="bg-neutral-100 rounded-[4px] p-3 mb-4">
          <MetaLabel>Payment details</MetaLabel>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[8px] uppercase tracking-wider text-neutral-500">Bank</p>
              <p className="text-[10.5px] font-semibold text-black">{doc.bank_name || "—"}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-wider text-neutral-500">Account number</p>
              <p className="text-[10.5px] font-semibold text-black">{doc.account_number || "—"}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-wider text-neutral-500">Account name</p>
              <p className="text-[10.5px] font-semibold text-black">{doc.account_name || "—"}</p>
            </div>
          </div>
        </div>

        {doc.notes ? (
          <div className="mb-4">
            <MetaLabel>Notes / Terms</MetaLabel>
            <p className="text-[10px] leading-[1.6] text-black whitespace-pre-wrap">{doc.notes}</p>
          </div>
        ) : null}

        <p className="text-[8.5px] text-neutral-600 text-center mt-5 pt-2" style={{ borderTop: ROW_RULE }}>
          This is a Proforma Invoice and not a receipt of payment. No refund of money after payment.
          <br />
          {COMPANY.name} {COMPANY.nameSuffix} · Tel: {COMPANY.tel}
        </p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProformaInvoice() {
  const { user, role } = useAuth();
  const { permissions } = usePermissions();
  const mayCreate = canCreate(role, PAGE_KEY, permissions);
  const mayEdit = canEdit(role, PAGE_KEY, permissions);
  const mayDelete = canDelete(role, PAGE_KEY, permissions);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<QuoteDoc | null>(null);
  /** The serial of the quote open in the editor, once it has one. */
  const [editingDocumentNo, setEditingDocumentNo] = useState<string | null>(null);
  // True when Preview was opened mid-entry, so Back returns to the form
  const [previewFromEditor, setPreviewFromEditor] = useState(false);

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(ALL_TIME);
  const [week, setWeek] = useState(ALL_WEEKS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // editor state
  const [useExistingCustomer, setUseExistingCustomer] = useState(true);
  const [customerId, setCustomerId] = useState<string>("");
  const [typedCustomer, setTypedCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [vatPercentage, setVatPercentage] = useState("");
  const [bank, setBank] = useState({ bank_name: "", account_number: "", account_name: "" });
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Draft");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehiclePickerSearch, setVehiclePickerSearch] = useState("");
  const [showManualVehicle, setShowManualVehicle] = useState(false);
  const [manualVehicle, setManualVehicle] = useState({ ...emptyManualVehicle });

  const documentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const months = useMemo(() => monthOptions(), []);

  // ── Draft persistence ───────────────────────────────────────────────────
  // Everything typed into the editor is mirrored into localStorage, so closing
  // the tab (or a browser crash) mid-entry does not lose the invoice. New
  // invoices share one draft; an edit is keyed to its own record.
  const DRAFT_KEY = "manga_proforma_draft";
  const draftKey = editingId ? `${DRAFT_KEY}:${editingId}` : DRAFT_KEY;
  const hydrated = useRef(false);

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!dialogOpen) { hydrated.current = false; return; }
    if (hydrated.current) return;
    hydrated.current = true;
    // An edit loads from its row; only a new invoice restores the shared draft
    if (editingId) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || (!d.items?.length && !d.typedCustomer?.name && !d.customerId)) return;
      setUseExistingCustomer(d.useExistingCustomer ?? true);
      setCustomerId(d.customerId ?? "");
      setTypedCustomer(d.typedCustomer ?? { name: "", phone: "", email: "", address: "" });
      setItems(Array.isArray(d.items) ? d.items : []);
      setVatPercentage(d.vatPercentage ?? "");
      setBank(d.bank ?? { bank_name: "", account_number: "", account_name: "" });
      setNotes(d.notes ?? "");
      setStatus(d.status ?? "Draft");
      setQuoteDate(d.quoteDate ?? new Date().toISOString().split("T")[0]);
      toast.info("Unsaved draft restored");
    } catch { /* a corrupt draft is simply ignored */ }
  }, [dialogOpen, editingId]);

  useEffect(() => {
    if (!dialogOpen) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        useExistingCustomer, customerId, typedCustomer, items,
        vatPercentage, bank, notes, status, quoteDate,
      }));
    } catch { /* storage full or blocked — the form still works */ }
  }, [
    dialogOpen, draftKey, useExistingCustomer, customerId, typedCustomer, items,
    vatPercentage, bank, notes, status, quoteDate,
  ]);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["performance_quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_quotes")
        .select("*, performance_quote_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, address");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: availableVehicles = [] } = useQuery({
    queryKey: ["vehicles", "available"],
    queryFn: async () => {
      // Workshop-only cars are not stock, so they are never quoted. inventory_type
      // arrives with a migration, so fall back rather than empty the picker.
      return withSchemaFallback(
        () => supabase
          .from("vehicles")
          .select("id, make, model, year, vin, price, condition, transmission, inventory_type")
          .eq("status", "Available")
          // Outside cars are quotable at their office price; only the workshop
          // is excluded. Kept as .or() rather than .neq() so NULL rows survive.
          .or("inventory_type.is.null,inventory_type.eq.main,inventory_type.eq.external"),
        () => supabase
          .from("vehicles")
          .select("id, make, model, year, vin, price, condition, transmission")
          .eq("status", "Available"),
        ["inventory_type"]
      ) as Promise<any[]>;
    },
  });

  const customerById = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );

  const resetEditor = () => {
    setEditingId(null);
    setEditingDocumentNo(null);
    setUseExistingCustomer(true);
    setCustomerId("");
    setTypedCustomer({ name: "", phone: "", email: "", address: "" });
    setItems([]);
    setVatPercentage("");
    setBank({ bank_name: "", account_number: "", account_name: "" });
    setNotes("");
    setStatus("Draft");
    setQuoteDate(new Date().toISOString().split("T")[0]);
    setShowManualVehicle(false);
    setManualVehicle({ ...emptyManualVehicle });
    setVehiclePickerSearch("");
  };

  const openCreate = () => {
    resetEditor();
    setDialogOpen(true);
  };

  const openEdit = (quote: any) => {
    setEditingId(quote.id);
    setEditingDocumentNo(quote.document_no ?? null);
    setUseExistingCustomer(!!quote.customer_id);
    setCustomerId(quote.customer_id || "");
    setTypedCustomer({
      name: quote.customer_name || "",
      phone: quote.customer_phone || "",
      email: quote.customer_email || "",
      address: quote.customer_address || "",
    });
    setItems(
      (quote.performance_quote_items || []).map((i: any) => ({
        key: newKey(),
        vehicle_id: i.vehicle_id,
        vehicle_description: i.vehicle_description || "Vehicle",
        vin: i.vin || "",
        base_price: String(i.base_price ?? ""),
        has_duty: !!i.has_duty,
        duty_price: String(i.duty_price ?? ""),
        quantity: i.quantity ?? 1,
        condition: i.condition || "",
        transmission: i.transmission || "",
        cylinders: i.cylinders || "",
      }))
    );
    setVatPercentage(quote.vat_percentage ? String(quote.vat_percentage) : "");
    setBank({
      bank_name: quote.bank_name || "",
      account_number: quote.account_number || "",
      account_name: quote.account_name || "",
    });
    setNotes(quote.notes || "");
    setStatus(quote.status || "Draft");
    setQuoteDate(quote.quote_date || new Date().toISOString().split("T")[0]);
    setDialogOpen(true);
  };

  const addInventoryVehicle = (v: any) => {
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        vehicle_id: v.id,
        vehicle_description: `${v.year} ${v.make} ${v.model}`.trim(),
        vin: v.vin || "",
        base_price: v.price ? String(v.price) : "",
        has_duty: false,
        duty_price: "",
        quantity: 1,
        condition: v.condition || "",
        transmission: v.transmission || "",
        cylinders: "",
      },
    ]);
    setVehiclePickerSearch("");
  };

  const addManualVehicle = () => {
    if (!manualVehicle.make.trim() || !manualVehicle.model.trim()) {
      toast.error("Make and model are required");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        vehicle_id: null,
        vehicle_description: `${manualVehicle.year} ${manualVehicle.make} ${manualVehicle.model}`.trim(),
        vin: manualVehicle.vin,
        base_price: manualVehicle.basePrice,
        has_duty: false,
        duty_price: "",
        quantity: 1,
        condition: manualVehicle.condition,
        transmission: manualVehicle.transmission,
        cylinders: manualVehicle.cylinders,
      },
    ]);
    setManualVehicle({ ...emptyManualVehicle });
    setShowManualVehicle(false);
  };

  const patchItem = (key: string, patch: Partial<QuoteItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const buildDoc = (id: string | null): QuoteDoc => {
    const chosen = useExistingCustomer ? customerById[customerId] : null;
    return {
      id,
      document_no: editingDocumentNo,
      quote_date: quoteDate,
      status,
      customer: {
        name: chosen?.name || typedCustomer.name,
        phone: chosen?.phone || typedCustomer.phone,
        email: chosen?.email || typedCustomer.email,
        address: chosen?.address || typedCustomer.address,
      },
      items,
      vat_percentage: vatPercentage,
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      account_name: bank.account_name,
      notes,
    };
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error("Add at least one vehicle");
      const chosen = useExistingCustomer ? customerById[customerId] : null;
      if (!chosen && !typedCustomer.name.trim()) throw new Error("A customer is required");

      const { subtotal, vatPct, vat, total } = totalsOf(items, vatPercentage);

      const payload = {
        customer_id: chosen?.id ?? null,
        customer_name: chosen ? null : typedCustomer.name.trim(),
        customer_phone: chosen ? null : typedCustomer.phone.trim() || null,
        customer_email: chosen ? null : typedCustomer.email.trim() || null,
        customer_address: chosen ? null : typedCustomer.address.trim() || null,
        quote_date: quoteDate,
        status,
        notes: notes.trim() || null,
        bank_name: bank.bank_name.trim() || null,
        account_number: bank.account_number.trim() || null,
        account_name: bank.account_name.trim() || null,
        vat_percentage: vatPct,
        vat_amount: vat,
        total_amount: total,
        created_by: user?.id ?? null,
      };

      let quoteId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from("performance_quotes")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        await logAction("UPDATE", ENTITY, editingId, { subtotal, total });
      } else {
        const { data, error } = await supabase
          .from("performance_quotes")
          .insert(payload)
          .select("id, document_no")
          .single();
        if (error) throw error;
        quoteId = data.id;
        setEditingDocumentNo((data as any).document_no ?? null);
        await logAction("CREATE", ENTITY, quoteId, { subtotal, total });
      }

      // Items: delete and re-insert — the simplest correct path on edit
      await supabase.from("performance_quote_items").delete().eq("quote_id", quoteId as string);
      const rows = items.map((i) => ({
        quote_id: quoteId as string,
        vehicle_id: i.vehicle_id,
        vehicle_description: i.vehicle_description,
        vin: i.vin || null,
        base_price: parseFloat((i.base_price || "0").replace(/,/g, "")) || 0,
        has_duty: i.has_duty,
        duty_price: i.has_duty ? parseFloat((i.duty_price || "0").replace(/,/g, "")) || 0 : 0,
        quantity: i.quantity || 1,
        condition: i.condition || null,
        transmission: i.transmission || null,
        cylinders: i.cylinders || null,
      }));
      const { error: itemsError } = await supabase.from("performance_quote_items").insert(rows);
      if (itemsError) throw itemsError;

      return quoteId as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["performance_quotes"] });
      clearDraft();
      toast.success(editingId ? "Proforma invoice updated" : "Proforma invoice saved");
      setEditingId(id);
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save the proforma invoice"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_quotes").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", ENTITY, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance_quotes"] });
      toast.success("Proforma invoice deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete the proforma invoice"),
  });

  const quoteToDoc = (quote: any): QuoteDoc => {
    const c = quote.customer_id ? customerById[quote.customer_id] : null;
    return {
      id: quote.id,
      document_no: quote.document_no ?? null,
      quote_date: quote.quote_date,
      status: quote.status || "Draft",
      customer: {
        name: c?.name || quote.customer_name || "—",
        phone: c?.phone || quote.customer_phone || "",
        email: c?.email || quote.customer_email || "",
        address: c?.address || quote.customer_address || "",
      },
      items: (quote.performance_quote_items || []).map((i: any) => ({
        key: i.id,
        vehicle_id: i.vehicle_id,
        vehicle_description: i.vehicle_description || "Vehicle",
        vin: i.vin || "",
        base_price: String(i.base_price ?? 0),
        has_duty: !!i.has_duty,
        duty_price: String(i.duty_price ?? 0),
        quantity: i.quantity ?? 1,
        condition: i.condition || "",
        transmission: i.transmission || "",
        cylinders: i.cylinders || "",
      })),
      vat_percentage: quote.vat_percentage ? String(quote.vat_percentage) : "",
      bank_name: quote.bank_name || "",
      account_number: quote.account_number || "",
      account_name: quote.account_name || "",
      notes: quote.notes || "",
    };
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((row) => {
      const name = (row.customer_id ? customerById[row.customer_id]?.name : row.customer_name) || "";
      const matchesSearch =
        !q ||
        (row.document_no || "").toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        (row.performance_quote_items || []).some((i: any) =>
          (i.vehicle_description || "").toLowerCase().includes(q)
        );
      return matchesSearch && matchesPeriod(row.quote_date || row.created_at, month, week);
    });
  }, [quotes, search, month, week, customerById]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const rangeValue = filtered.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);
  const editorTotals = totalsOf(items, vatPercentage);

  const pickerResults = availableVehicles.filter((v) => {
    const q = vehiclePickerSearch.trim().toLowerCase();
    if (!q) return true;
    return `${v.year} ${v.make} ${v.model} ${v.vin || ""}`.toLowerCase().includes(q);
  });

  // ── Preview replaces the list ─────────────────────────────────────────────
  if (previewDoc) {
    return (
      <div className="p-4 md:p-8 animate-fade-in">
        <DocumentToolbar
          documentRef={documentRef}
          filename={`proforma-${previewDoc.document_no || "draft"}`}
          entity={ENTITY}
          recordId={previewDoc.id}
          backLabel={previewFromEditor ? "Back to Form" : "Back to Invoices"}
          accentClass="bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
          onBack={() => {
            setPreviewDoc(null);
            // Re-open the editor with everything still filled in
            if (previewFromEditor) {
              setPreviewFromEditor(false);
              setDialogOpen(true);
            }
          }}
        />
        <PrintSheet ref={documentRef}>
          <ProformaDocument doc={previewDoc} />
        </PrintSheet>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/10 shrink-0">
            <FileText className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Proforma Invoice</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Priced quotes for one or more vehicles, with duty, VAT and bank details.
            </p>
          </div>
        </div>
        {mayCreate && (
          <Button onClick={openCreate}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/20">
            <PlusCircle className="h-4 w-4 mr-2" /> New Quote
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bento-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quotes in range</p>
          <p className="text-3xl font-bold mt-1">{filtered.length}</p>
        </div>
        <div className="bento-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total quote value</p>
          <p className="text-3xl font-bold mt-1 text-emerald-500">{formatNaira(rangeValue)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl border border-white/5 p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search no., customer or vehicle..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="h-10 pl-9 rounded-xl bg-background/50 border-white/10"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={month} onValueChange={(v) => { setMonth(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={week} onValueChange={(v) => { setWeek(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[130px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              {WEEK_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={w.value} className="text-sm">{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-xl border border-white/10 bg-background/50 p-1">
            <Button variant="ghost" size="icon" aria-label="Cards view"
              onClick={() => setView("cards")}
              className={`h-8 w-8 rounded-lg ${view === "cards" ? "bg-emerald-500/15 text-emerald-500" : ""}`}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Table view"
              onClick={() => setView("table")}
              className={`h-8 w-8 rounded-lg ${view === "table" ? "bg-emerald-500/15 text-emerald-500" : ""}`}>
              <Rows3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center text-center">
          <div className="bg-emerald-500/10 p-5 rounded-full mb-4">
            <FileText className="h-9 w-9 text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">No proforma invoices yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Create one to quote a customer for one or more vehicles.
          </p>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((q) => {
            const name = (q.customer_id ? customerById[q.customer_id]?.name : q.customer_name) || "—";
            const count = (q.performance_quote_items || []).length;
            return (
              <div key={q.id} className="bento-card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-emerald-500 mb-0.5">
                      No. {q.document_no || "—"}
                    </p>
                    <p className="font-bold text-sm truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} vehicle{count === 1 ? "" : "s"} · {shortDate(q.quote_date)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500">
                    {q.status}
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatNaira(q.total_amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {Number(q.vat_percentage) > 0
                      ? `Includes ${Number(q.vat_percentage)}% VAT`
                      : "Standard Quote"}
                  </p>
                </div>
                <RecordActions
                  menuLabel={`More actions for invoice ${q.document_no || name}`}
                  primary={[
                    {
                      label: "Preview", icon: Eye,
                      onClick: () => { setPreviewFromEditor(false); setPreviewDoc(quoteToDoc(q)); },
                    },
                    { label: "Edit", icon: Pencil, onClick: () => openEdit(q), show: mayEdit },
                  ]}
                  menu={[
                    {
                      label: "Delete invoice", icon: Trash2,
                      onClick: () => setDeleteId(q.id), destructive: true, show: mayDelete,
                    },
                  ]}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bento-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-foreground/5">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="px-6 font-semibold">No.</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Vehicles</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Total</TableHead>
                  <TableHead className="text-right px-6 font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((q) => (
                  <TableRow key={q.id} className="border-border/10 hover:bg-white/5">
                    <TableCell className="px-6 font-mono text-xs font-bold text-emerald-500">
                      {q.document_no || "—"}
                    </TableCell>
                    <TableCell className="font-semibold text-sm">
                      {(q.customer_id ? customerById[q.customer_id]?.name : q.customer_name) || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{(q.performance_quote_items || []).length}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{shortDate(q.quote_date)}</TableCell>
                    <TableCell>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500">
                        {q.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-bold">{formatNaira(q.total_amount)}</TableCell>
                    <TableCell className="text-right px-6">
                      <RecordActions
                        inline
                        menuLabel={`More actions for invoice ${q.document_no || q.id}`}
                        primary={[
                          {
                            label: "Preview", icon: Eye,
                            onClick: () => { setPreviewFromEditor(false); setPreviewDoc(quoteToDoc(q)); },
                          },
                        ]}
                        menu={[
                          { label: "Edit invoice", icon: Pencil, onClick: () => openEdit(q), show: mayEdit },
                          {
                            label: "Delete invoice", icon: Trash2, destructive: true,
                            onClick: () => setDeleteId(q.id), show: mayDelete,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
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
      />

      {/* ── Create / edit dialog ───────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl p-0 rounded-3xl glass-panel border-white/10 overflow-hidden max-h-[92vh] flex flex-col">
          <div className="sticky top-0 z-10 flex items-center gap-3 p-5 border-b border-white/5 bg-background/80 backdrop-blur-xl">
            <Button variant="ghost" size="icon" aria-label="Close"
              onClick={() => setDialogOpen(false)} className="h-8 w-8 rounded-lg">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-lg font-bold">
                {editingId ? "Edit Proforma Invoice" : "Create Proforma Invoice"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {items.length} vehicle{items.length === 1 ? "" : "s"} · {formatNaira(editorTotals.total)}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-7">
            {/* Customer */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">Customer</p>
                <Button variant="ghost" size="sm"
                  onClick={() => setUseExistingCustomer((s) => !s)}
                  className="h-7 rounded-lg text-[11px] font-semibold text-emerald-500 hover:bg-emerald-500/10">
                  <Users className="h-3.5 w-3.5 mr-1" />
                  {useExistingCustomer ? "Type a new customer" : "Pick an existing customer"}
                </Button>
              </div>

              {useExistingCustomer ? (
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-11 rounded-xl bg-background/50 border-white/10">
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border-white/10 rounded-xl max-h-[280px]">
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">
                        {c.name}{c.phone ? ` · ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                  <Input placeholder="Customer name *" value={typedCustomer.name}
                    onChange={(e) => setTypedCustomer({ ...typedCustomer, name: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Input placeholder="Phone" value={typedCustomer.phone}
                    onChange={(e) => setTypedCustomer({ ...typedCustomer, phone: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Input placeholder="Email" value={typedCustomer.email}
                    onChange={(e) => setTypedCustomer({ ...typedCustomer, email: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Input placeholder="Address" value={typedCustomer.address}
                    onChange={(e) => setTypedCustomer({ ...typedCustomer, address: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <div className="sm:col-span-2">
                    <CustomerMatchHint
                      name={typedCustomer.name}
                      phone={typedCustomer.phone}
                      onPick={(c) => {
                        setUseExistingCustomer(true);
                        setCustomerId(c.id);
                        setTypedCustomer({ name: "", phone: "", email: "", address: "" });
                        toast.success(`Using the existing record for ${c.name}`);
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Quote date</Label>
                  <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-panel border-white/10 rounded-xl">
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Vehicles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">Vehicles</p>
                <Button variant="ghost" size="sm" onClick={() => setShowManualVehicle((s) => !s)}
                  className="h-7 rounded-lg text-[11px] font-semibold text-emerald-500 hover:bg-emerald-500/10">
                  <PlusCircle className="h-3.5 w-3.5 mr-1" />
                  {showManualVehicle ? "Cancel manual entry" : "Enter a vehicle manually"}
                </Button>
              </div>

              {showManualVehicle && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                  <Input placeholder="Make *" value={manualVehicle.make}
                    onChange={(e) => setManualVehicle({ ...manualVehicle, make: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Input placeholder="Model *" value={manualVehicle.model}
                    onChange={(e) => setManualVehicle({ ...manualVehicle, model: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Input placeholder="Year" type="number" value={manualVehicle.year}
                    onChange={(e) => setManualVehicle({ ...manualVehicle, year: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Input
                    placeholder={`Chassis (VIN) — ${manualVehicle.vin.length}/${VIN_FULL_LENGTH}`}
                    value={manualVehicle.vin}
                    maxLength={VIN_FULL_LENGTH}
                    onChange={(e) => setManualVehicle({
                      ...manualVehicle,
                      vin: e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, VIN_FULL_LENGTH),
                    })}
                    className="h-10 rounded-xl bg-background/50 border-white/10 font-mono uppercase" />
                  <CurrencyInput placeholder="Base price" value={manualVehicle.basePrice}
                    onChange={(e) => setManualVehicle({ ...manualVehicle, basePrice: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                  <Select value={manualVehicle.condition}
                    onValueChange={(v) => setManualVehicle({ ...manualVehicle, condition: v })}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-panel border-white/10 rounded-xl">
                      {CONDITIONS.map((c) => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={manualVehicle.transmission}
                    onValueChange={(v) => setManualVehicle({ ...manualVehicle, transmission: v })}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-panel border-white/10 rounded-xl">
                      {TRANSMISSIONS.map((t) => <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={manualVehicle.cylinders}
                    onValueChange={(v) => setManualVehicle({ ...manualVehicle, cylinders: v })}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-panel border-white/10 rounded-xl">
                      {CYLINDERS.map((c) => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button size="sm" onClick={addManualVehicle}
                      className="h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                      Add vehicle
                    </Button>
                  </div>
                </div>
              )}

              {/* Inventory picker */}
              <div className="rounded-2xl bg-foreground/5 border border-white/5 p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search available inventory..."
                    value={vehiclePickerSearch}
                    onChange={(e) => setVehiclePickerSearch(e.target.value)}
                    className="h-9 pl-9 rounded-xl bg-background/50 border-white/10 text-sm" />
                </div>
                <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                  {pickerResults.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => addInventoryVehicle(v)}
                      className="text-left p-3 rounded-xl bg-background/40 border border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-colors"
                    >
                      <p className="text-[13px] font-semibold leading-tight">
                        {v.year} {v.make} {v.model}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {v.vin || "No VIN"}
                      </p>
                    </button>
                  ))}
                  {pickerResults.length === 0 && (
                    <p className="sm:col-span-2 text-center text-sm text-muted-foreground italic py-3">
                      No available vehicles match.
                    </p>
                  )}
                </div>
              </div>

              {/* Added items */}
              {items.length > 0 && (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.key} className="rounded-2xl border border-white/10 bg-background/40 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold flex items-center gap-2">
                            <Car className="h-4 w-4 text-emerald-500 shrink-0" />
                            <span className="truncate">{item.vehicle_description}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {[item.vin, item.condition, item.transmission, item.cylinders]
                              .filter(Boolean).join(" · ") || "No specs"}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" aria-label="Remove vehicle"
                          onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                          className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 shrink-0">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Quantity</Label>
                          <Input type="number" min={1} value={item.quantity}
                            onChange={(e) => patchItem(item.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="h-9 rounded-lg bg-background/50 border-white/10" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Base price (₦)</Label>
                          <CurrencyInput value={item.base_price}
                            onChange={(e) => patchItem(item.key, { base_price: e.target.value })}
                            placeholder="0"
                            className="h-9 rounded-lg bg-background/50 border-white/10" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Line amount</Label>
                          <p className="h-9 flex items-center px-3 rounded-lg bg-foreground/5 text-sm font-bold">
                            {formatNaira(itemAmount(item))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={item.has_duty}
                            onCheckedChange={(checked) => patchItem(item.key, { has_duty: checked === true })}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                          <span className="text-xs font-semibold">Has duty</span>
                        </label>
                        {item.has_duty && (
                          <div className="space-y-1 flex-1 min-w-[160px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Duty price (₦)</Label>
                            <CurrencyInput value={item.duty_price}
                              onChange={(e) => patchItem(item.key, { duty_price: e.target.value })}
                              placeholder="0"
                              className="h-9 rounded-lg bg-background/50 border-white/10" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* VAT + bank + notes */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">
                VAT &amp; Payment Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">VAT percentage (optional)</Label>
                  <Input type="number" min={0} step="0.5" value={vatPercentage}
                    onChange={(e) => setVatPercentage(e.target.value)}
                    placeholder="e.g. 7.5"
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Bank name</Label>
                  <Input value={bank.bank_name}
                    onChange={(e) => setBank({ ...bank, bank_name: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Account number</Label>
                  <Input value={bank.account_number}
                    onChange={(e) => setBank({ ...bank, account_number: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Account name</Label>
                  <Input value={bank.account_name}
                    onChange={(e) => setBank({ ...bank, account_name: e.target.value })}
                    className="h-10 rounded-xl bg-background/50 border-white/10" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes / terms</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Validity, delivery terms, anything the customer should read..."
                  className="rounded-xl min-h-[80px] bg-background/50 border-white/10" />
              </div>
            </div>

            {/* Totals preview */}
            <div className="rounded-2xl bg-foreground/5 border border-white/5 p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatNaira(editorTotals.subtotal)}</span>
              </div>
              {editorTotals.vatPct > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT ({editorTotals.vatPct}%)</span>
                  <span className="font-semibold">{formatNaira(editorTotals.vat)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/10">
                <span>Total</span>
                <span className="text-emerald-500">{formatNaira(editorTotals.total)}</span>
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-white/5 bg-foreground/5 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}
              className="rounded-xl border-white/10 hover:bg-white/5">
              Cancel
            </Button>
            <Button variant="ghost"
              onClick={() => { clearDraft(); resetEditor(); toast.success("Form cleared"); }}
              className="rounded-xl hover:bg-white/5">
              Clear Form
            </Button>
            <Button variant="outline"
              onClick={() => {
                setPreviewDoc(buildDoc(editingId));
                setPreviewFromEditor(true);
                setDialogOpen(false);
              }}
              disabled={items.length === 0}
              className="rounded-xl border-white/10 hover:bg-white/5">
              <Eye className="h-4 w-4 mr-2" /> Preview
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={items.length === 0 || saveMutation.isPending}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/20"
            >
              {saveMutation.isPending ? "Saving..." : editingId ? "Update Invoice" : "Save Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this proforma invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              The quote and its line items will be removed. This cannot be undone.
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
    </div>
  );
}
