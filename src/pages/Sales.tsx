import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { PlusCircle, Pencil, Trash2, Receipt, Download, Eye, FileText, Printer, DollarSign, Calendar, Search, Car, Users, QrCode, CheckCircle, AlertCircle, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { exportToCSV, exportToJSON, printTable, downloadTableAsPDF } from "@/lib/exportHelpers";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { getPrintHeaderHTML, getPrintWatermarkHTML } from "@/components/PrintHeader";
import { getPrintFooterHTML } from "@/components/PrintFooter";
import { 
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList 
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/SignaturePad";
import { QrSignDialog } from "@/lib/qrHelpers";
import { CurrencyInput } from "@/components/CurrencyInput";
import { VIN_MAX_LENGTH } from "@/lib/constants";
import { isExternal, isSellableInventory } from "@/lib/inventoryType";
import {
  buildReceiptLedger, derivePaymentState, paymentLabel, receiptMatches, receiptNumber,
} from "@/lib/receipts";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { logAction } from "@/lib/logger";
import { CustomPagination } from "@/components/CustomPagination";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { ALL_TIME, ALL_WEEKS, matchesPeriod, monthOptions, WEEK_OPTIONS } from "@/lib/historyFilters";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import {
  Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis,
} from "recharts";
import { createRoot } from "react-dom/client";
import {
  SaleReceiptDocument, type ReceiptLineItem, type ReceiptBankDetails,
} from "@/components/SaleReceiptDocument";
import { PrintSheet } from "@/components/PrintSheet";
import { RecordActions } from "@/components/RecordActions";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { downloadDocument, type DocFormat } from "@/lib/documentExport";
import { firstWorkingSelect, warnOnce, withSchemaFallback } from "@/lib/dbCompat";

/**
 * Columns the sales list actually renders. The signature columns are left out on
 * purpose: they hold base64 PNG data URLs, which made a list of a few hundred
 * sales several megabytes of payload the list never showed. They are fetched for
 * one record at a time, when a receipt is opened or a sale is edited.
 */
/** Columns every deployment has had since the original schema. */
const SALE_BASE_COLUMNS =
  "id, customer_id, vehicle_id, sale_price, sale_date, payment_type, payment_status, " +
  "notes, rep_name, created_at, buyer_signature_date, rep_signature_date";

/** Columns added by later migrations — absent until those are applied. */
const SALE_ADDED_COLUMNS = "sale_number, is_registered, agreement_details";

const SALE_LIST_COLUMNS = `${SALE_BASE_COLUMNS}, ${SALE_ADDED_COLUMNS}`;

const emptyForm = { 
  customer_id: "", 
  selected_vehicle_ids: [] as string[],
  sale_price: "", 
  sale_date: new Date().toISOString().split("T")[0], 
  payment_type: "cash",
  payment_status: "paid_in_full",
  rep_name: "",
  rep_signature: "",
  buyer_signature: "",
  buyer_signature_date: "",
  notes: "",
  initial_payment: "",
  // Registered-vehicle agreement (D6). Off, the sale behaves as a plain receipt.
  is_registered: false,
  engine_number: "",
  registration_number: "",
  witness_one_name: "",
  witness_one_address: "",
  witness_one_occupation: "",
  witness_two_name: "",
  witness_two_address: "",
  witness_two_occupation: "",
  seller_name: "",
  seller_address: "",
  seller_occupation: "",
  received_in_good_condition: false,
  received_date: "",
};

const emptyNewVehicle = {
  make: "",
  model: "",
  year: String(new Date().getFullYear()),
  color: "",
  vin: "",
  price: "",
};

export default function Sales() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, "sales", permissions);
  const hasEdit = canEdit(role, "sales", permissions);
  const hasDelete = canDelete(role, "sales", permissions);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm, clearSaleDraft, startNewSale] = useFormPersistence(
    "manga_sale_draft", emptyForm, !!editId, editId
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [paymentsSale, setPaymentsSale] = useState<any>(null);
  const [newPayment, setNewPayment] = useState({ amount: "", method: "cash", notes: "" });
  const [showReceipts, setShowReceipts] = useState(false);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptType, setReceiptType] = useState<"all" | "sale" | "payment">("all");
  const [receiptPage, setReceiptPage] = useState(0);
  const [receiptSale, setReceiptSale] = useState<any>(null);
  const receiptDocRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [saleMonth, setSaleMonth] = useState(ALL_TIME);
  const [saleWeek, setSaleWeek] = useState(ALL_WEEKS);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [page, setPage] = useState(0);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer, clearNewCustomerDraft] = useFormPersistence(
    "manga_sale_new_customer_draft", { name: "", phone: "", email: "", address: "" }
  );
  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [newVehicle, setNewVehicle, clearNewVehicleDraft] = useFormPersistence(
    "manga_sale_new_vehicle_draft", emptyNewVehicle
  );
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDates, setExportDates] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [exportMode, setExportMode] = useState<"summary" | "individual">("individual");
  const [isExporting, setIsExporting] = useState(false);
  const PAGE_SIZE = 15;
  const queryClient = useQueryClient();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () =>
      /**
       * Several of these columns, and the sale_payments table, arrive with
       * migrations. PostgREST rejects a whole statement over one unknown name,
       * so the read steps down through shapes and ends on `select("*")`, which
       * always works. The list must never come up empty because the database is
       * a migration behind.
       */
      firstWorkingSelect<any[]>(
        [
          () => supabase
            .from("sales")
            .select(`${SALE_LIST_COLUMNS}, sale_vehicles(vehicle_id, price), sale_payments(id, amount, payment_date, payment_method, notes, created_at)`)
            .order("created_at", { ascending: false }) as any,
          () => supabase
            .from("sales")
            .select(`${SALE_LIST_COLUMNS}, sale_vehicles(vehicle_id, price)`)
            .order("created_at", { ascending: false }) as any,
          () => supabase
            .from("sales")
            .select(`${SALE_BASE_COLUMNS}, sale_vehicles(vehicle_id, price)`)
            .order("created_at", { ascending: false }) as any,
          () => supabase
            .from("sales")
            .select("*, sale_vehicles(vehicle_id, price)")
            .order("created_at", { ascending: false }) as any,
        ],
        [],
        () => warnOnce("sales_schema", () => toast.warning(
          "Some sales features are limited until the pending database migration is applied."
        ))
      ),
  });

  // "Receipt" sends the user straight to the print dialog; the preview stays
  // open underneath so they can re-print or download without going back.
  useEffect(() => {
    if (!receiptSale?.autoPrint) return;
    const id = setTimeout(() => {
      window.print();
      setReceiptSale((prev: any) => (prev ? { ...prev, autoPrint: false } : prev));
    }, 450);
    return () => clearTimeout(id);
  }, [receiptSale]);

  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sales"] });
    const channel = supabase
      .channel('sales_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, invalidate)
      // Instalments change the derived payment state, so they invalidate too
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_payments' }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: vehicles = [] } = useQuery({
    // Its own key: this picker selects a different column set from the stand
    // list, and a shared key let whichever page mounted first win the cache.
    queryKey: ["vehicles", "picker"],
    queryFn: async () => {
      // Workshop-only cars ('service') are never offered for sale — but
      // inventory_type also arrives with a migration, so the read degrades to
      // the columns that exist rather than emptying the picker.
      return withSchemaFallback(
        () => supabase
          .from("vehicles")
          .select("id, make, model, year, color, vin, status, price, inventory_type"),
        () => supabase
          .from("vehicles")
          .select("id, make, model, year, color, vin, status, price"),
        ["inventory_type"]
      );
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone, email, address");
      if (error) throw error;
      return data;
    },
  });

  const addVehicleMutation = useMutation({
    mutationFn: async () => {
      if (!newVehicle.make.trim() || !newVehicle.model.trim() || !newVehicle.year) {
        throw new Error("Make, model and year are required");
      }
      const vin = newVehicle.vin.trim().toUpperCase();

      // Look the VIN up first. The vehicle is created before the sale row, so a
      // later failure leaves the car behind; without lookup-first every retry
      // collides with the unique VIN and the sale could never be saved.
      if (vin) {
        const { data: existing } = await supabase
          .from("vehicles")
          .select("id, make, model, year, color")
          .eq("vin", vin)
          .maybeSingle();
        if (existing) {
          const { data: updated, error: updateError } = await supabase
            .from("vehicles")
            .update({
              make: newVehicle.make.trim(),
              model: newVehicle.model.trim(),
              year: parseInt(newVehicle.year, 10),
              color: newVehicle.color.trim() || null,
              price: parseFloat(newVehicle.price) || 0,
            })
            .eq("id", existing.id)
            .select("id, make, model, year, color")
            .single();
          if (updateError) throw updateError;
          return updated;
        }
      }

      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          make: newVehicle.make.trim(),
          model: newVehicle.model.trim(),
          year: parseInt(newVehicle.year, 10),
          color: newVehicle.color.trim() || null,
          vin: vin || null,
          price: parseFloat(newVehicle.price) || 0,
          status: "Available",
          condition: "Used",
        })
        .select("id, make, model, year, color")
        .single();
      if (error) {
        // Someone inserted the same VIN between the lookup and the insert:
        // adopt the row that won instead of failing the sale.
        if ((error as any).code === "23505" && vin) {
          const { data: winner } = await supabase
            .from("vehicles")
            .select("id, make, model, year, color")
            .eq("vin", vin)
            .maybeSingle();
          if (winner) return winner;
          throw new Error("A vehicle with this chassis number already exists");
        }
        throw error;
      }
      return data;
    },
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      // Auto-select the vehicle we just created for this sale
      setForm((prev) => ({
        ...prev,
        selected_vehicle_ids: [...prev.selected_vehicle_ids, vehicle.id],
      }));
      clearNewVehicleDraft();
      setNewVehicle({ ...emptyNewVehicle });
      setShowNewVehicle(false);
      toast.success(`${vehicle.year} ${vehicle.make} ${vehicle.model} added and selected`);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add vehicle"),
  });

  const vehicleMap = Object.fromEntries(vehicles.map((v) => [
    v.id, 
    `${v.year} ${v.make} ${v.model} ${v.color ? `(${v.color})` : ""}`.trim()
  ]));
  /**
   * Vehicles offered on the sale dialog: stock only (workshop cars excluded) and
   * not already sold — plus whatever is attached to the sale being edited, so
   * reopening an old sale never strips the cars off it.
   */
  const selectableVehicles = useMemo(() => {
    const onThisSale = new Set(form.selected_vehicle_ids);
    return (vehicles as any[]).filter((v) => {
      if (onThisSale.has(v.id)) return true;
      // Only the workshop is excluded. Testing positively matters: on a database
      // without inventory_type every row would fail a "not main" test, which
      // would empty the picker.
      if (!isSellableInventory(v)) return false;
      return v.status !== "Sold";
    });
  }, [vehicles, form.selected_vehicle_ids]);

  // Bank details for the receipt's payment panel come from app_settings, so the
  // dealership can change them without a deploy.
  const { data: bankDetails = {} as ReceiptBankDetails } = useQuery({
    queryKey: ["app_settings", "bank_details"],
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

  const vehicleObjMap = Object.fromEntries((vehicles as any[]).map((v) => [v.id, v]));
  const vehicleVinMap = Object.fromEntries(vehicles.map((v) => [v.id, (v as any).vin || ""]));
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  const customerObjMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  /** Vehicle ids attached to a sale, whichever shape it was saved in. */
  const saleVehicleIds = (s: any): string[] =>
    s.sale_vehicles?.length
      ? s.sale_vehicles.map((sv: any) => sv.vehicle_id).filter(Boolean)
      : (s.vehicle_id ? [s.vehicle_id] : []);

  const saleMonths = useMemo(() => monthOptions(), []);

  const saleSources = useMemo(() => {
    const set = new Set<string>();
    (vehicles as any[]).forEach((v) => v.source_company && set.add(v.source_company));
    return [...set].sort();
  }, [vehicles]);

  const filtered = useMemo(() => (sales as any[]).filter((s: any) => {
    const q = search.trim().toLowerCase();
    const ids = saleVehicleIds(s);
    const names = ids.map((vid) => (vehicleMap[vid] || "").toLowerCase()).join(" ");
    const vins = ids.map((vid) => (vehicleVinMap[vid] || "").toLowerCase()).join(" ");
    const cName = (customerMap[s.customer_id] || "").toLowerCase();
    const matchesSearch = !q || names.includes(q) || vins.includes(q) || cName.includes(q);

    // Payment state is derived from the instalments, so the filter agrees with the pill
    const state = derivePaymentState(s);
    const matchesPayment =
      paymentFilter === "all"
      || (paymentFilter === "paid" && state.isPaidInFull)
      || (paymentFilter === "outstanding" && !state.isPaidInFull);

    const matchesSource =
      sourceFilter === "all"
      || ids.some((vid) => (vehicleObjMap[vid] as any)?.source_company === sourceFilter);

    return matchesSearch && matchesPayment && matchesSource
      && matchesPeriod(s.sale_date || s.created_at, saleMonth, saleWeek);
  }), [sales, search, paymentFilter, sourceFilter, saleMonth, saleWeek,
       vehicleMap, vehicleVinMap, customerMap, vehicleObjMap]);

  // ── Analytics for the filtered set ────────────────────────────────────────
  const analytics = useMemo(() => {
    const revenue = filtered.reduce((sum: number, s: any) => sum + Number(s.sale_price || 0), 0);
    const cost = filtered.reduce((sum: number, s: any) =>
      sum + saleVehicleIds(s).reduce(
        (c: number, vid: string) => c + Number((vehicleObjMap[vid] as any)?.cost_price || 0), 0
      ), 0);
    const units = filtered.reduce((sum: number, s: any) => sum + saleVehicleIds(s).length, 0);
    const outstanding = filtered.reduce(
      (sum: number, s: any) => sum + derivePaymentState(s).balance, 0
    );

    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const value = filtered
        .filter((s: any) => {
          const when = new Date(s.sale_date || s.created_at);
          return !Number.isNaN(when.getTime()) && isWithinInterval(when, { start, end });
        })
        .reduce((sum: number, s: any) => sum + Number(s.sale_price || 0), 0);
      return { name: format(d, "MMM"), Revenue: value };
    });

    const makeCounts: Record<string, number> = {};
    filtered.forEach((s: any) => saleVehicleIds(s).forEach((vid: string) => {
      const make = (vehicleObjMap[vid] as any)?.make || "Unknown";
      makeCounts[make] = (makeCounts[make] || 0) + 1;
    }));
    const makes = Object.entries(makeCounts)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      revenue, cost, units, outstanding,
      profit: revenue - cost,
      avgSale: filtered.length ? revenue / filtered.length : 0,
      monthly, makes,
    };
  }, [filtered, vehicleObjMap]);

  // ── Receipt records: derived from the sales themselves, never stored ───────
  // This covers receipts issued before the feature existed and can never miss
  // one. The trade-off: an entry reflects the sale's current data, so editing a
  // sale changes what a re-print shows.
  const RECEIPTS_PAGE_SIZE = 10;
  const ledger = useMemo(() => buildReceiptLedger(sales as any[]), [sales]);

  const saleById = useMemo(
    () => Object.fromEntries((sales as any[]).map((x: any) => [x.id, x])),
    [sales]
  );

  const receiptContext = (saleId: string) => {
    const sale: any = saleById[saleId];
    if (!sale) return {};
    const ids: string[] = sale.sale_vehicles?.length
      ? sale.sale_vehicles.map((sv: any) => sv.vehicle_id)
      : (sale.vehicle_id ? [sale.vehicle_id] : []);
    return {
      customer: customerMap[sale.customer_id] || "",
      vehicles: ids.map((vid) => vehicleMap[vid] || "").join(" "),
      vins: ids.map((vid) => vehicleVinMap[vid] || "").join(" "),
    };
  };

  const filteredReceipts = useMemo(
    () => ledger.filter((entry) =>
      (receiptType === "all" || entry.type === receiptType)
      && receiptMatches(entry, receiptSearch, receiptContext(entry.saleId))
    ),
    [ledger, receiptType, receiptSearch, saleById, customerMap, vehicleMap]
  );

  const receiptPageCount = Math.max(1, Math.ceil(filteredReceipts.length / RECEIPTS_PAGE_SIZE));
  const safeReceiptPage = Math.min(receiptPage, receiptPageCount - 1);
  const pagedReceipts = filteredReceipts.slice(
    safeReceiptPage * RECEIPTS_PAGE_SIZE,
    (safeReceiptPage + 1) * RECEIPTS_PAGE_SIZE
  );

  const exportReceiptLedger = (format: "csv" | "json") => {
    const rows = filteredReceipts.map((entry) => {
      const ctx = receiptContext(entry.saleId);
      return {
        "Receipt No": entry.number,
        Type: entry.type,
        Label: entry.label,
        Date: entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "",
        Customer: ctx.customer ?? "",
        Vehicle: ctx.vehicles ?? "",
        VIN: ctx.vins ?? "",
        Amount: entry.amount,
        Balance: entry.balance,
        Method: entry.method,
        Status: entry.status,
        Notes: entry.notes,
      };
    });
    if (format === "csv") exportToCSV(rows, "receipt_records");
    else exportToJSON(rows, "receipt_records");
    logAction("EXPORT", "Receipt", null, { format, rows: rows.length });
  };

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      let actualCustomerId = form.customer_id;

      if (isNewCustomer) {
        if (!newCustomer.name) throw new Error("Customer name is required");
        const { data: nc, error: nce } = await supabase
          .from("customers")
          .insert({
            name: newCustomer.name,
            phone: newCustomer.phone || null,
            email: newCustomer.email || null,
            address: newCustomer.address || null
          })
          .select()
          .single();
        if (nce) throw nce;
        actualCustomerId = nc.id;
      }

      const basePayload = {
        customer_id: actualCustomerId,
        sale_price: parseFloat(form.sale_price),
        sale_date: form.sale_date,
        payment_type: form.payment_type,
        payment_status: form.payment_status,
        rep_name: form.rep_name,
        rep_signature: form.rep_signature,
        buyer_signature: form.buyer_signature || null,
        buyer_signature_date: form.buyer_signature_date || null,
        notes: form.notes || null,
        // For backward compatibility, also keep first vehicle_id if any
        vehicle_id: form.selected_vehicle_ids[0] || null,
      };

      const agreementPayload = {
        is_registered: form.is_registered,
        agreement_details: form.is_registered
          ? {
              engine_number: form.engine_number || null,
              registration_number: form.registration_number || null,
              witness_one_name: form.witness_one_name || null,
              witness_one_address: form.witness_one_address || null,
              witness_one_occupation: form.witness_one_occupation || null,
              witness_two_name: form.witness_two_name || null,
              witness_two_address: form.witness_two_address || null,
              witness_two_occupation: form.witness_two_occupation || null,
              seller_name: form.seller_name || null,
              seller_address: form.seller_address || null,
              seller_occupation: form.seller_occupation || null,
              received_in_good_condition: form.received_in_good_condition,
              received_date: form.received_date || form.sale_date || null,
            }
          : null,
      };

      const payload = { ...basePayload, ...agreementPayload };

      /**
       * A missing column must not cost a sale: if the agreement columns are not
       * in the database yet, strip them, save the sale anyway, and warn that the
       * migration is still pending.
       */
      const missingAgreementColumn = (error: any) =>
        error?.code === "PGRST204" ||
        /agreement_details|is_registered/i.test(error?.message ?? "");

      let agreementSkipped = false;

      let saleId = editId;
      let previousVehicleIds: string[] = [];
      if (editId) {
        let { error } = await supabase.from("sales").update(payload).eq("id", editId);
        if (error && missingAgreementColumn(error)) {
          agreementSkipped = true;
          ({ error } = await supabase.from("sales").update(basePayload).eq("id", editId));
        }
        if (error) throw error;
        // Remember what was linked before so we can release de-selected vehicles
        const { data: oldLinks } = await supabase
          .from("sale_vehicles")
          .select("vehicle_id")
          .eq("sale_id", editId);
        previousVehicleIds = (oldLinks || []).map((l: any) => l.vehicle_id).filter(Boolean);
        // Clear existing links
        await supabase.from("sale_vehicles").delete().eq("sale_id", editId);
      } else {
        let { data, error } = await supabase.from("sales").insert(payload).select().single();
        if (error && missingAgreementColumn(error)) {
          agreementSkipped = true;
          ({ data, error } = await supabase.from("sales").insert(basePayload).select().single());
        }
        if (error) throw error;
        if (!data) throw new Error("Failed to retrieve new sale ID");
        saleId = data.id;
      }

      if (form.selected_vehicle_ids.length > 0) {
        const links = form.selected_vehicle_ids.map(vid => ({
          sale_id: saleId,
          vehicle_id: vid,
          price: parseFloat(form.sale_price) / form.selected_vehicle_ids.length // Provisional split
        }));
        const { error } = await supabase.from("sale_vehicles").insert(links);
        if (error) throw error;

        // Mark the vehicles on this sale as Sold so the amount shows on their card
        const { error: soldError } = await supabase
          .from("vehicles")
          .update({ status: "Sold" })
          .in("id", form.selected_vehicle_ids);
        if (soldError) throw soldError;
      }

      // Any vehicle removed from this sale goes back into available stock
      const released = previousVehicleIds.filter(
        (id) => !form.selected_vehicle_ids.includes(id)
      );
      if (released.length > 0) {
        await supabase.from("vehicles").update({ status: "Available" }).in("id", released);
      }

      // An initial payment is only recorded for a brand-new sale; on an edit the
      // instalments already on file are left alone.
      const initial = parseFloat((form.initial_payment || "0").replace(/,/g, ""));
      if (!editId && Number.isFinite(initial) && initial > 0) {
        const { error } = await supabase.from("sale_payments").insert({
          sale_id: saleId,
          amount: initial,
          payment_method: form.payment_type,
          notes: "Initial payment recorded with the sale",
          payment_date: new Date().toISOString(),
        });
        if (error) throw error;
        await logAction("PAYMENT", "Sale", saleId, { amount: initial, initial: true });
      }

      await logAction(editId ? "UPDATE" : "CREATE", "Sale", saleId, {
        price: basePayload.sale_price,
        vehicles: form.selected_vehicle_ids.length,
        registered: form.is_registered,
      });

      return { agreementSkipped };
    },
    onSuccess: (result) => {
      if (result?.agreementSkipped) {
        toast.warning(
          "Sale saved, but the registered-vehicle details were not: run the pending database migration."
        );
      }
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-sales"] });
      toast.success(editId ? "Sale updated" : "Sale recorded");
      resetForm();
      closeDialog();
    },
    onError: () => toast.error("Failed to save sale"),
  });

  // ── Instalments ───────────────────────────────────────────────────────────
  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentsSale) throw new Error("No sale selected");
      const amount = parseFloat((newPayment.amount || "0").replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount");

      const { error } = await supabase.from("sale_payments").insert({
        sale_id: paymentsSale.id,
        amount,
        payment_method: newPayment.method,
        notes: newPayment.notes.trim() || null,
        payment_date: new Date().toISOString(),
      });
      if (error) throw error;
      await logAction("PAYMENT", "Sale", paymentsSale.id, { amount, method: newPayment.method });
      return amount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setNewPayment({ amount: "", method: "cash", notes: "" });
      toast.success("Payment recorded");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to record the payment"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Release the vehicles back into available stock
      const { data: links } = await supabase
        .from("sale_vehicles")
        .select("vehicle_id")
        .eq("sale_id", id);
      const vehicleIds = (links || []).map((l: any) => l.vehicle_id).filter(Boolean);

      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;

      if (vehicleIds.length > 0) {
        await supabase.from("vehicles").update({ status: "Available" }).in("id", vehicleIds);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-sales"] });
      toast.success("Sale deleted");
    },
    onError: () => toast.error("Failed to delete sale"),
  });

  // Closing the dialog keeps the draft, so an accidental dismissal loses nothing;
  // only a completed sale or an explicit Clear wipes it.
  // The dialog holds a row from the previous render, so re-read it from the
  // refreshed list rather than showing a stale balance after adding a payment.
  const livePaymentsSale = paymentsSale
    ? (sales as any[]).find((x: any) => x.id === paymentsSale.id) ?? paymentsSale
    : null;

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setShowNewVehicle(false);
    setVehicleSearch("");
  };

  /**
   * The full row for one sale, signatures and all. Used when a document or the
   * edit dialog genuinely needs them, so the list stays light.
   */
  const fetchFullSale = async (sale: any) => {
    const { data, error } = await withSchemaFallbackSingle(sale.id);
    if (error || !data) return sale; // fall back to the list row rather than block
    return { ...sale, ...data };
  };

  const withSchemaFallbackSingle = async (saleId: string) => {
    const result = await supabase
      .from("sales")
      .select("*, sale_vehicles(vehicle_id, price)")
      .eq("id", saleId)
      .maybeSingle();
    return result as { data: any; error: any };
  };

  const resetForm = () => {
    clearSaleDraft();
    clearNewCustomerDraft();
    clearNewVehicleDraft();
    setForm(emptyForm);
    setIsNewCustomer(false);
    setNewCustomer({ name: "", phone: "", email: "", address: "" });
    setNewVehicle({ ...emptyNewVehicle });
    setShowNewVehicle(false);
    setVehicleSearch("");
  };

  const openEdit = async (listSale: any) => {
    // Signatures live outside the list payload, so fetch the whole row to edit
    const s = await fetchFullSale(listSale);
    setEditId(s.id);
    setForm({
      customer_id: s.customer_id,
      selected_vehicle_ids: s.sale_vehicles?.map((sv: any) => sv.vehicle_id) || (s.vehicle_id ? [s.vehicle_id] : []),
      sale_price: String(s.sale_price),
      sale_date: s.sale_date,
      payment_type: s.payment_type || "cash",
      payment_status: s.payment_status || "paid_in_full",
      rep_name: s.rep_name || "",
      rep_signature: s.rep_signature || "",
      buyer_signature: s.buyer_signature || "",
      buyer_signature_date: s.buyer_signature_date || "",
      notes: s.notes || "",
      // Instalments are edited in the Payments dialog, not here
      initial_payment: "",
      is_registered: !!s.is_registered,
      engine_number: s.agreement_details?.engine_number || "",
      registration_number: s.agreement_details?.registration_number || "",
      witness_one_name: s.agreement_details?.witness_one_name || "",
      witness_one_address: s.agreement_details?.witness_one_address || "",
      witness_one_occupation: s.agreement_details?.witness_one_occupation || "",
      witness_two_name: s.agreement_details?.witness_two_name || "",
      witness_two_address: s.agreement_details?.witness_two_address || "",
      witness_two_occupation: s.agreement_details?.witness_two_occupation || "",
      seller_name: s.agreement_details?.seller_name || "",
      seller_address: s.agreement_details?.seller_address || "",
      seller_occupation: s.agreement_details?.seller_occupation || "",
      received_in_good_condition: !!s.agreement_details?.received_in_good_condition,
      received_date: s.agreement_details?.received_date || "",
    });
    setDialogOpen(true);
  };

  const canSubmit = form.selected_vehicle_ids.length > 0 && form.customer_id && form.sale_price && !upsertMutation.isPending;

  const handleExportCSV = () => {
    const rows = sales.map((s) => ({
      Vehicle: vehicleMap[s.vehicle_id] || s.vehicle_id,
      Customer: customerMap[s.customer_id] || s.customer_id,
      "Sale Price": s.sale_price,
      "Sale Date": s.sale_date,
      Notes: s.notes || "",
    }));
    exportToCSV(rows, "sales_export");
  };

  const handleExportJSON = () => {
    exportToJSON(sales, "sales_export");
  };

  const handlePrint = () => {
    const rows = sales.map((s) => ({
      vehicle: vehicleMap[s.vehicle_id] || s.vehicle_id,
      customer: customerMap[s.customer_id] || s.customer_id,
      sale_price: `₦${Number(s.sale_price).toLocaleString()}`,
      sale_date: new Date(s.sale_date).toLocaleDateString(),
      notes: s.notes || "",
    }));
    printTable("Sales Report — Manga Automobiles", rows, [
      { key: "vehicle", label: "Vehicle" },
      { key: "customer", label: "Customer" },
      { key: "sale_price", label: "Sale Price" },
      { key: "sale_date", label: "Sale Date" },
      { key: "notes", label: "Notes" },
    ]);
  };

  const handleDownloadSummaryPDF = async () => {
    const rows = sales.map((s) => ({
      vehicle: vehicleMap[s.vehicle_id] || s.vehicle_id,
      customer: customerMap[s.customer_id] || s.customer_id,
      sale_price: `₦${Number(s.sale_price).toLocaleString()}`,
      sale_date: new Date(s.sale_date).toLocaleDateString(),
      notes: s.notes || "",
    }));
    await downloadTableAsPDF("Sales Summary — Manga Automobiles", rows, [
      { key: "vehicle", label: "Vehicle" },
      { key: "customer", label: "Customer" },
      { key: "sale_price", label: "Price" },
      { key: "sale_date", label: "Date" },
      { key: "notes", label: "Notes" },
    ]);
  };

  /**
   * Receipt line items for one sale: a row per vehicle, priced from its own
   * sale_vehicles row when set and otherwise an even share of the total.
   */
  const receiptItems = (sale: any): ReceiptLineItem[] => {
    const links: any[] = sale.sale_vehicles?.length
      ? sale.sale_vehicles
      : (sale.vehicle_id ? [{ vehicle_id: sale.vehicle_id, price: sale.sale_price }] : []);
    const total = Number(sale.sale_price || 0);
    const share = links.length ? total / links.length : total;

    return links.map((link: any, i: number) => {
      const vehicle: any = vehicleObjMap[link.vehicle_id];
      const own = Number(link.price || 0);
      return {
        id: `${sale.id}-${link.vehicle_id ?? i}`,
        description: vehicleMap[link.vehicle_id] || "Vehicle",
        vin: vehicle?.vin ?? null,
        color: vehicle?.color ?? null,
        trim: vehicle?.trim ?? null,
        amount: own > 0 ? own : share,
      };
    });
  };

  /**
   * Opens the receipt in the preview pane. Preview, print and every downloaded
   * file render the same <SaleReceiptDocument />, so they can never drift.
   */
  const printReceipt = async (sale: any, payment: any = null, paymentIndex = 0) => {
    const full = await fetchFullSale(sale);
    setReceiptSale({ sale: full, payment, paymentIndex, autoPrint: true });
  };

  const openReceipt = async (sale: any, payment: any = null, paymentIndex = 0) => {
    const full = await fetchFullSale(sale);
    setReceiptSale({ sale: full, payment, paymentIndex, autoPrint: false });
  };

  const downloadReceipt = async (listSale: any, format: DocFormat, payment: any = null) => {
    const sale = await fetchFullSale(listSale);
    // Render the document off-screen, capture it, then tear it down — the file is
    // the same markup the preview and the printer use.
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = "210mm";
    host.style.background = "#ffffff";
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await new Promise<void>((resolve) => {
        root.render(
          <SaleReceiptDocument
            sale={sale}
            customer={customerObjMap[sale.customer_id] ?? {}}
            items={receiptItems(sale)}
            payment={payment}
            bank={bankDetails}
          />
        );
        // Let the browser lay the sheet out (and decode the letterhead) first
        requestAnimationFrame(() => setTimeout(resolve, 350));
      });

      const sheet = host.querySelector<HTMLElement>(".print-document-page") ?? host;
      await downloadDocument(
        sheet,
        `receipt-${receiptNumber(payment ? payment.id : sale.id, payment ? (payment.payment_date ?? null) : (sale.sale_date ?? null))}`,
        format
      );
      logAction("EXPORT", "Receipt", sale.id, { format, payment: !!payment });
    } finally {
      root.unmount();
      host.remove();
    }
  };

  const handleDownloadPDF = (sale: any) => downloadReceipt(sale, "pdf");

  const handleBulkExport = async () => {
    const start = new Date(exportDates.start);
    const end = new Date(exportDates.end);
    end.setHours(23, 59, 59, 999);

    const toExport = sales.filter(s => {
      const d = new Date(s.sale_date);
      return d >= start && d <= end;
    });

    if (toExport.length === 0) {
      toast.error("No sales found in this date range");
      return;
    }

    setIsExporting(true);
    setExportDialogOpen(false);

    try {
      if (exportMode === "summary") {
        const rows = toExport.map((s) => ({
          sale_no: (s as any).sale_number ? `#${(s as any).sale_number}` : s.id.slice(0, 4),
          vehicle: vehicleMap[s.vehicle_id] || s.vehicle_id,
          customer: customerMap[s.customer_id] || s.customer_id,
          sale_price: `₦${Number(s.sale_price).toLocaleString()}`,
          sale_date: new Date(s.sale_date).toLocaleDateString(),
        }));
        await downloadTableAsPDF(`Sales Summary (${exportDates.start} to ${exportDates.end})`, rows, [
          { key: "sale_no", label: "Sale #" },
          { key: "vehicle", label: "Vehicle" },
          { key: "customer", label: "Customer" },
          { key: "sale_price", label: "Price" },
          { key: "sale_date", label: "Date" },
        ]);
      } else {
        toast.info(`Generating ${toExport.length} documents... Please wait.`);
        // For individual documents, we loop and trigger downloads
        // We do it in small batches to not overwhelm the browser
        for (let i = 0; i < toExport.length; i++) {
          const s = toExport[i];
          await downloadReceipt(s, "pdf");
          
          // Small delay between documents to help the browser
          if (i < toExport.length - 1) {
             await new Promise(r => setTimeout(r, 800));
          }
        }
        toast.success(`Exported ${toExport.length} documents`);
      }
    } catch (error) {
      console.error("Bulk export failed:", error);
      toast.error("Bulk export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPNG = (sale: any) => downloadReceipt(sale, "png");
  const handleDownloadJPEG = (sale: any) => downloadReceipt(sale, "jpeg");

  // ── Receipt preview replaces the page, like the other documents ───────────
  if (receiptSale) {
    const { sale, payment, paymentIndex } = receiptSale;
    // Merge in anything newer from the list (a payment added a moment ago) while
    // keeping the signatures that only the full row carries.
    const fromList = (sales as any[]).find((x: any) => x.id === sale.id);
    const live = fromList ? { ...fromList, ...sale, sale_payments: fromList.sale_payments ?? sale.sale_payments } : sale;
    return (
      <div className="animate-fade-in">
        <DocumentToolbar
          documentRef={receiptDocRef}
          filename={`receipt-${receiptNumber(
            payment ? payment.id : live.id,
            payment ? (payment.payment_date ?? null) : (live.sale_date ?? null)
          )}`}
          entity="Receipt"
          recordId={live.id}
          backLabel="Back to Sales"
          accentClass="bg-violet-500 hover:bg-violet-600 shadow-violet-500/20"
          onBack={() => setReceiptSale(null)}
        />
        <PrintSheet ref={receiptDocRef}>
          <SaleReceiptDocument
            sale={live}
            customer={customerObjMap[live.customer_id] ?? {}}
            items={receiptItems(live)}
            payment={payment}
            paymentIndex={paymentIndex}
            bank={bankDetails}
          />
        </PrintSheet>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8 animate-fade-up pb-10 max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <DollarSign className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium uppercase tracking-wider text-violet-500">Revenue</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground to-foreground/70 tracking-tight">
            Sales
          </h1>
          <p className="text-base text-muted-foreground mt-2 max-w-xl">
            Track vehicle sales, generate receipts, and manage sales history.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg" className="rounded-2xl glass-panel border-white/10 hover:bg-white/5 transition-all">
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="rounded-xl glass-panel p-2 shadow-2xl border-white/10" align="end">
              <DropdownMenuItem onClick={handleExportCSV} className="rounded-lg cursor-pointer">
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" /> Export to CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON} className="rounded-lg cursor-pointer">
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" /> Export to JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadSummaryPDF} className="rounded-lg cursor-pointer text-violet-500 font-bold">
                <FileText className="mr-2 h-4 w-4" /> Download PDF Summary (All)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExportDialogOpen(true)} className="rounded-lg cursor-pointer text-emerald-500 font-bold">
                <Download className="mr-2 h-4 w-4" /> Advanced Bulk Export (Date Range)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint} className="rounded-lg cursor-pointer text-muted-foreground py-2 border-t border-white/5 mt-1">
                <Printer className="mr-2 h-4 w-4" /> Print / Save PDF (Dialog)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hasCreate && (
            <Button onClick={() => { setEditId(null); startNewSale(); setDialogOpen(true); }} size="lg" className="rounded-2xl shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all bg-violet-500 hover:bg-violet-600 text-white">
              <PlusCircle className="mr-2 h-5 w-5" /> Record Sale
            </Button>
          )}
        </div>
      </div>

      {/* Analytics strip */}
      <div className="bento-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAnalytics((v) => !v)}
          className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-violet-500/10">
              <DollarSign className="h-4 w-4 text-violet-500" />
            </span>
            <span>
              <span className="block text-sm font-bold">Sales Analytics</span>
              <span className="block text-[11px] text-muted-foreground">
                {formatNaira(analytics.revenue)} across {filtered.length} sale
                {filtered.length === 1 ? "" : "s"} in the current filter
              </span>
            </span>
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            {showAnalytics ? "Hide" : "Show"}
          </span>
        </button>

        {showAnalytics && (
          <div className="p-5 pt-0 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Revenue", value: formatNaira(analytics.revenue), tone: "text-violet-500" },
                {
                  label: "Profit",
                  value: formatNaira(analytics.profit),
                  tone: analytics.profit >= 0 ? "text-emerald-500" : "text-rose-500",
                },
                { label: "Units sold", value: String(analytics.units), tone: "" },
                {
                  label: "Outstanding",
                  value: formatNaira(analytics.outstanding),
                  tone: analytics.outstanding > 0 ? "text-amber-500" : "text-emerald-500",
                },
              ].map((tile) => (
                <div key={tile.label} className="rounded-2xl bg-foreground/5 border border-white/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {tile.label}
                  </p>
                  <p className={`text-xl font-bold mt-1 ${tile.tone}`}>{tile.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Average sale {formatNaira(analytics.avgSale)} · cost of goods{" "}
              {formatNaira(analytics.cost)}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-foreground/5 border border-white/5 p-4">
                <p className="text-sm font-bold mb-3">Revenue per month</p>
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.monthly}>
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}m`} />
                      <ChartTip
                        formatter={(v: any) => formatNaira(Number(v))}
                        contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)" }}
                      />
                      <Area type="monotone" dataKey="Revenue" stroke="hsl(262 83% 58%)"
                        fill="hsl(262 83% 58%)" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl bg-foreground/5 border border-white/5 p-4">
                <p className="text-sm font-bold mb-3">Top makes sold</p>
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analytics.makes} dataKey="value" nameKey="name"
                        innerRadius={45} outerRadius={75}>
                        {analytics.makes.map((_, i) => (
                          <Cell key={i} fill={[
                            "hsl(262 83% 58%)", "hsl(199 89% 48%)", "hsl(142 76% 36%)",
                            "hsl(38 92% 50%)", "hsl(0 84% 60%)",
                          ][i % 5]} />
                        ))}
                      </Pie>
                      <ChartTip contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="glass-panel p-4 rounded-3xl flex flex-col xl:flex-row gap-3 xl:items-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-transparent pointer-events-none" />
        <div className="relative flex-1 min-w-0 group z-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-violet-500 transition-colors" />
          <Input
            placeholder="Search by vehicle, VIN or customer name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-10 h-10 rounded-xl bg-background/50 border-white/10 focus-visible:ring-violet-500/50 transition-all font-medium text-sm w-full"
          />
        </div>
        <div className="flex flex-wrap gap-2 z-10">
          <Select value={saleMonth} onValueChange={(v) => { setSaleMonth(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[140px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              {saleMonths.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-sm">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={saleWeek} onValueChange={(v) => { setSaleWeek(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[120px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              {WEEK_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={w.value} className="text-sm">{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl">
              <SelectItem value="all" className="text-sm">All payments</SelectItem>
              <SelectItem value="paid" className="text-sm">Paid in full</SelectItem>
              <SelectItem value="outstanding" className="text-sm">Balance due</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl bg-background/50 border-white/10 text-sm">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent className="glass-panel border-white/10 rounded-xl max-h-[260px]">
              <SelectItem value="all" className="text-sm">All sources</SelectItem>
              {saleSources.map((srcName) => (
                <SelectItem key={srcName} value={srcName} className="text-sm">{srcName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Receipt records: the derived ledger ──────────────────────────── */}
      <div className="bento-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowReceipts((v) => !v)}
          className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-violet-500/10">
              <Receipt className="h-4 w-4 text-violet-500" />
            </span>
            <span>
              <span className="block text-sm font-bold">Receipt Records</span>
              <span className="block text-[11px] text-muted-foreground">
                {ledger.length} receipt{ledger.length === 1 ? "" : "s"} — one per sale, one per payment
              </span>
            </span>
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            {showReceipts ? "Hide" : "Show"}
          </span>
        </button>

        {showReceipts && (
          <div className="p-5 pt-0 space-y-4 animate-fade-in">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search receipt no, customer, vehicle, VIN, amount, method or date (november, 06/11/2026)…"
                  value={receiptSearch}
                  onChange={(e) => { setReceiptSearch(e.target.value); setReceiptPage(0); }}
                  className="h-10 pl-9 rounded-xl bg-background/50 border-white/10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={receiptType}
                  onValueChange={(v) => { setReceiptType(v as any); setReceiptPage(0); }}>
                  <SelectTrigger className="h-10 w-[150px] rounded-xl bg-background/50 border-white/10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border-white/10 rounded-xl">
                    <SelectItem value="all" className="text-sm">All receipts</SelectItem>
                    <SelectItem value="sale" className="text-sm">Sale receipts</SelectItem>
                    <SelectItem value="payment" className="text-sm">Payment receipts</SelectItem>
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-10 rounded-xl border-white/10">
                      <Download className="h-4 w-4 mr-2" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-panel border-white/10 rounded-xl">
                    <DropdownMenuItem onClick={() => exportReceiptLedger("csv")} className="rounded-lg cursor-pointer">
                      <FileText className="h-4 w-4 mr-2" /> Excel / CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportReceiptLedger("json")} className="rounded-lg cursor-pointer">
                      <FileText className="h-4 w-4 mr-2" /> JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {filteredReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">
                No receipts match that search.
              </p>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader className="bg-foreground/5">
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="font-semibold">Receipt No</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Customer</TableHead>
                        <TableHead className="font-semibold">Amount</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="text-right font-semibold">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedReceipts.map((entry) => {
                        const sale: any = saleById[entry.saleId];
                        const ctx = receiptContext(entry.saleId);
                        return (
                          <TableRow key={entry.key} className="border-border/10 hover:bg-white/5">
                            <TableCell className="font-mono text-xs font-semibold">{entry.number}</TableCell>
                            <TableCell>
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                entry.type === "sale" ? "bg-violet-500/10 text-violet-500" : "bg-emerald-500/10 text-emerald-500"
                              }`}>
                                {entry.type}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "—"}
                            </TableCell>
                            <TableCell className="text-sm">{ctx.customer || "—"}</TableCell>
                            <TableCell className="text-sm font-bold">{formatNaira(entry.amount)}</TableCell>
                            <TableCell className="text-xs">{entry.status}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" aria-label="Open receipt"
                                  disabled={!sale}
                                  onClick={() => {
                                    if (!sale) return;
                                    const state = derivePaymentState(sale);
                                    const idx = entry.paymentId
                                      ? state.payments.findIndex((pp) => pp.id === entry.paymentId)
                                      : 0;
                                    openReceipt(
                                      sale,
                                      entry.paymentId ? state.payments[idx] : null,
                                      Math.max(0, idx)
                                    );
                                  }}
                                  className="h-8 w-8 rounded-lg hover:bg-violet-500/10 hover:text-violet-500">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label="Download receipt"
                                      className="h-8 w-8 rounded-lg hover:bg-sky-500/10 hover:text-sky-500">
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="glass-panel border-white/10 rounded-xl">
                                    {(["pdf", "png", "jpeg"] as DocFormat[]).map((fmt) => (
                                      <DropdownMenuItem
                                        key={fmt}
                                        disabled={!sale}
                                        onClick={() => {
                                          if (!sale) return;
                                          const state = derivePaymentState(sale);
                                          const found = entry.paymentId
                                            ? state.payments.find((pp) => pp.id === entry.paymentId) ?? null
                                            : null;
                                          downloadReceipt(sale, fmt, found);
                                        }}
                                        className="rounded-lg cursor-pointer"
                                      >
                                        <FileText className="h-4 w-4 mr-2" /> {fmt.toUpperCase()}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <CustomPagination
              page={safeReceiptPage}
              pageCount={receiptPageCount}
              pageSize={RECEIPTS_PAGE_SIZE}
              total={filteredReceipts.length}
              onPageChange={setReceiptPage}
              onPageSizeChange={() => {}}
              sizes={[RECEIPTS_PAGE_SIZE]}
            />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 w-full rounded-2xl bg-card/40 animate-pulse border border-white/5" />)}
        </div>
      ) : sales.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center justify-center text-center">
          <div className="bg-violet-500/10 p-5 rounded-full mb-4">
            <DollarSign className="h-10 w-10 text-violet-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">No sales recorded.</h2>
          <p className="text-muted-foreground max-w-sm mb-6">Start tracking your dealership revenue by recording your first sale.</p>
          {hasCreate && (
            <Button onClick={() => { setEditId(null); startNewSale(); setDialogOpen(true); }} className="rounded-xl shadow-lg shadow-violet-500/20 bg-violet-500 hover:bg-violet-600 text-white">Record Sale</Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/*
            One card per sale, rather than the eight-column table this used to
            be. The table needed 800px before it could show a single row, so on
            anything but a desktop the office was scrolling sideways to find the
            buttons — which were themselves six equal-weight items in a row at
            half opacity until you hovered.

            The card puts the three things anyone actually reads first — what
            was sold, for how much, and whether it is paid — then gives the two
            everyday actions a solid button each and folds the rest into one
            menu.
          */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((s) => {
              // Derived from the instalments, never from payment_status alone
              const state = derivePaymentState(s as any);
              const paidPct = state.total > 0
                ? Math.min(100, (state.totalPaid / state.total) * 100)
                : 0;
              const saleNo = (s as any).sale_number
                ? String((s as any).sale_number).padStart(5, "0")
                : s.id.slice(0, 5).toUpperCase();

              return (
                <div
                  key={s.id}
                  className="bento-card p-5 flex flex-col gap-4 transition-colors hover:border-violet-500/30"
                >
                  {/* Serial and status: the two things that identify the row */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[11px] font-bold text-violet-500 bg-violet-500/10 px-2 py-1 rounded-md">
                      № {saleNo}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                        state.isPaidInFull
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {state.isPaidInFull ? "Paid in full" : "Part paid"}
                    </span>
                  </div>

                  {/* What was sold, and to whom */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="font-bold text-sm truncate">
                        {vehicleMap[s.vehicle_id] || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 min-w-0">
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        {customerMap[s.customer_id] || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.sale_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* The money, with the balance shown as progress when part paid */}
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none">
                      {formatNaira(state.total)}
                    </p>
                    {state.isPaidInFull ? (
                      <p className="text-[11px] text-emerald-500 font-semibold mt-1.5">
                        Fully settled
                      </p>
                    ) : (
                      <>
                        <div className="h-1.5 w-full rounded-full bg-foreground/10 mt-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          <span className="font-semibold text-foreground">
                            {formatNaira(state.totalPaid)}
                          </span>{" "}
                          paid ·{" "}
                          <span className="font-semibold text-amber-500">
                            {formatNaira(state.balance)}
                          </span>{" "}
                          due
                        </p>
                      </>
                    )}
                  </div>

                  {/* Actions: the two used daily, then everything else in one menu */}
                  <RecordActions
                    menuLabel={`More actions for sale ${saleNo}`}
                    primary={[
                      { label: "Receipt", icon: Receipt, onClick: () => printReceipt(s) },
                      {
                        label: "Payments", icon: DollarSign, tone: "text-emerald-500",
                        onClick: () => {
                          setPaymentsSale(s);
                          setNewPayment({ amount: "", method: "cash", notes: "" });
                        },
                      },
                    ]}
                    menu={[
                      {
                        label: "Sign link", icon: QrCode, tone: "text-amber-500",
                        onClick: () => setQrId(s.id),
                      },
                      {
                        label: "Download PDF", icon: FileText, tone: "text-violet-500",
                        onClick: () => handleDownloadPDF(s),
                      },
                      {
                        label: "Download PNG", icon: Download, tone: "text-sky-500",
                        onClick: () => handleDownloadPNG(s),
                      },
                      { label: "Edit sale", icon: Pencil, onClick: () => openEdit(s), show: hasEdit },
                      {
                        label: "Delete sale", icon: Trash2, destructive: true, show: hasDelete,
                        onClick: () => setDeleteId(s.id),
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-6 border-t border-border/10">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => page > 0 && setPage(page - 1)}
                      className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i} className="hidden sm:block">
                      <PaginationLink 
                        isActive={page === i}
                        onClick={() => setPage(i)}
                        className="cursor-pointer"
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => page < totalPages - 1 && setPage(page + 1)}
                      className={page >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="text-center mt-4 text-xs text-muted-foreground sm:hidden">
                Page {page + 1} of {totalPages}
              </div>
            </div>
          )}
        </div>
      )}

    {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl glass-panel shadow-2xl border-white/10 p-0 bg-background/95 backdrop-blur-3xl">
          <div className="p-6 border-b border-white/5 bg-foreground/5 pointer-events-none">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{editId ? "Edit Sale Details" : "Record New Sale"}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer *</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn("h-7 px-2 text-[10px] uppercase font-bold", isNewCustomer ? "text-amber-500 bg-amber-500/10" : "text-violet-500")}
                  onClick={() => setIsNewCustomer(!isNewCustomer)}
                >
                  <UserPlus className="w-3 h-3 mr-1" />
                  {isNewCustomer ? "Select Existing" : "Add New Customer"}
                </Button>
              </div>

              {!isNewCustomer ? (
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerSearchOpen}
                      className="w-full justify-between rounded-xl h-11 bg-background/50 border-white/10 font-normal hover:bg-background/80"
                    >
                      {form.customer_id
                        ? customers.find((c) => c.id === form.customer_id)?.name
                        : "Select customer..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 glass-panel border-white/10">
                    <Command className="bg-transparent">
                      <CommandInput placeholder="Search customers..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          {customers.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setForm({ ...form, customer_id: c.id });
                                setCustomerSearchOpen(false);
                              }}
                              className="rounded-lg cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.customer_id === c.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{c.name}</span>
                                <span className="text-[10px] text-muted-foreground">{c.phone || "No phone"}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl animate-fade-in">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Full Name *</Label>
                    <Input 
                      placeholder="Customer Name" 
                      className="h-9 rounded-lg bg-background/50 border-white/10" 
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Phone Number</Label>
                    <Input 
                      placeholder="080..." 
                      className="h-9 rounded-lg bg-background/50 border-white/10" 
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Email Address</Label>
                    <Input 
                      placeholder="customer@example.com" 
                      className="h-9 rounded-lg bg-background/50 border-white/10" 
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Address</Label>
                    <Input 
                      placeholder="Home or Office address" 
                      className="h-9 rounded-lg bg-background/50 border-white/10" 
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <CustomerMatchHint
                      name={newCustomer.name}
                      phone={newCustomer.phone}
                      onPick={(c) => {
                        // Use the record on file instead of creating a duplicate
                        setIsNewCustomer(false);
                        setForm((prev) => ({ ...prev, customer_id: c.id }));
                        clearNewCustomerDraft();
                        setNewCustomer({ name: "", phone: "", email: "", address: "" });
                        toast.success(`Using the existing record for ${c.name}`);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Vehicles *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewVehicle((s) => !s)}
                  className="h-7 rounded-lg text-[11px] font-semibold text-violet-500 hover:bg-violet-500/10"
                >
                  <PlusCircle className="h-3.5 w-3.5 mr-1" />
                  {showNewVehicle ? "Cancel new vehicle" : "Add vehicle manually"}
                </Button>
              </div>
              <div className="bg-foreground/5 border border-white/5 p-4 rounded-2xl flex flex-col gap-3">
                {showNewVehicle && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl animate-fade-in">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Make *</Label>
                      <Input
                        placeholder="Toyota"
                        className="h-9 rounded-lg bg-background/50 border-white/10"
                        value={newVehicle.make}
                        onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Model *</Label>
                      <Input
                        placeholder="Camry"
                        className="h-9 rounded-lg bg-background/50 border-white/10"
                        value={newVehicle.model}
                        onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Year *</Label>
                      <Input
                        type="number"
                        placeholder="2015"
                        className="h-9 rounded-lg bg-background/50 border-white/10"
                        value={newVehicle.year}
                        onChange={(e) => setNewVehicle({ ...newVehicle, year: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Color</Label>
                      <Input
                        placeholder="Silver"
                        className="h-9 rounded-lg bg-background/50 border-white/10"
                        value={newVehicle.color}
                        onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Chassis Number (VIN)</Label>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${newVehicle.vin.length === VIN_MAX_LENGTH ? 'bg-emerald-500 text-white' : 'bg-violet-500/10 text-violet-500'}`}>
                          {newVehicle.vin.length} / {VIN_MAX_LENGTH}
                        </span>
                      </div>
                      <Input
                        placeholder="JT2BF28K0X0"
                        maxLength={VIN_MAX_LENGTH}
                        className="h-9 rounded-lg bg-background/50 border-white/10 font-mono uppercase"
                        value={newVehicle.vin}
                        onChange={(e) =>
                          setNewVehicle({
                            ...newVehicle,
                            vin: e.target.value.toUpperCase().slice(0, VIN_MAX_LENGTH),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Listed Price</Label>
                      <CurrencyInput
                        placeholder="0"
                        className="h-9 rounded-lg bg-background/50 border-white/10"
                        value={newVehicle.price}
                        onChange={(e) => setNewVehicle({ ...newVehicle, price: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addVehicleMutation.mutate()}
                        disabled={
                          !newVehicle.make.trim() ||
                          !newVehicle.model.trim() ||
                          !newVehicle.year ||
                          addVehicleMutation.isPending
                        }
                        className="h-9 rounded-xl bg-violet-500 hover:bg-violet-600 text-white border-0"
                      >
                        {addVehicleMutation.isPending ? "Adding..." : "Add & select vehicle"}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by make, model, or year..."
                    className="h-9 pl-9 rounded-xl bg-background/50 border-white/10 text-sm"
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {selectableVehicles
                    .filter((v) => `${v.year} ${v.make} ${v.model} ${v.vin ?? ""}`.toLowerCase().includes(vehicleSearch.toLowerCase()))
                    .map((v) => (
                    <div 
                      key={v.id} 
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        form.selected_vehicle_ids.includes(v.id) 
                          ? 'bg-violet-500/10 border-violet-500/20 text-violet-500' 
                          : 'bg-background/40 border-white/5 hover:bg-white/5'
                      }`}
                      onClick={() => {
                        const ids = form.selected_vehicle_ids.includes(v.id)
                          ? form.selected_vehicle_ids.filter(id => id !== v.id)
                          : [...form.selected_vehicle_ids, v.id];
                        setForm({ ...form, selected_vehicle_ids: ids });
                      }}
                    >
                      <Checkbox checked={form.selected_vehicle_ids.includes(v.id)} className="data-[state=checked]:bg-violet-500 pointer-events-none" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-tight truncate">
                          {v.year} {v.make} {v.model}
                        </span>
                        {isExternal(v) && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                            Outside
                            {v.price ? <span className="font-semibold normal-case tracking-normal text-muted-foreground">
                              · {formatNaira(v.price)}
                            </span> : null}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {selectableVehicles.filter((v) => `${v.year} ${v.make} ${v.model} ${v.vin ?? ""}`.toLowerCase().includes(vehicleSearch.toLowerCase())).length === 0 && (
                     <div className="col-span-1 sm:col-span-2 text-center text-sm text-muted-foreground py-4 italic">No matching vehicles found.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Sale Price *</Label>
                <CurrencyInput className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-violet-500 font-bold" placeholder="0" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sale Date *</Label>
                <Input className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-violet-500" type="date" value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Type</Label>
                 <Select value={form.payment_type} onValueChange={(v) => setForm({ ...form, payment_type: v })}>
                   <SelectTrigger className="rounded-xl h-11 bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                   <SelectContent className="glass-panel border-white/10 rounded-xl">
                     <SelectItem value="cash">Cash</SelectItem>
                     <SelectItem value="transfer">Bank Transfer</SelectItem>
                     <SelectItem value="pos">POS</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="space-y-2">
                 <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Status</Label>
                 <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                   <SelectTrigger className="rounded-xl h-11 bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                   <SelectContent className="glass-panel border-white/10 rounded-xl">
                     <SelectItem value="paid_in_full">Paid in Full</SelectItem>
                     <SelectItem value="deposit">Deposit Only</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
            </div>

            {!editId && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Initial payment (optional)
                </Label>
                <CurrencyInput
                  className="rounded-xl h-11 bg-background/50 border-white/10 max-w-xs"
                  placeholder="0"
                  value={form.initial_payment}
                  onChange={(e) => setForm({ ...form, initial_payment: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Recorded as the first instalment. The balance due is worked out from the
                  instalments, not from the status above.
                </p>
              </div>
            )}

            {/* ── Registered-vehicle agreement ─────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-foreground/5 p-4 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.is_registered}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_registered: checked === true })
                  }
                  className="mt-0.5 data-[state=checked]:bg-violet-500"
                />
                <span>
                  <span className="block text-sm font-bold">Registered vehicle</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Turns the receipt into a Vehicle Sales Agreement Receipt, with witnesses, the
                    sold-by block and the “as is” note.
                  </span>
                </span>
              </label>

              {form.is_registered && (
                <div className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Engine number</Label>
                      <Input value={form.engine_number}
                        onChange={(e) => setForm({ ...form, engine_number: e.target.value.toUpperCase() })}
                        className="h-10 rounded-xl bg-background/50 border-white/10 font-mono uppercase" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Registration number</Label>
                      <Input value={form.registration_number}
                        onChange={(e) => setForm({ ...form, registration_number: e.target.value.toUpperCase() })}
                        className="h-10 rounded-xl bg-background/50 border-white/10 uppercase" />
                    </div>
                  </div>

                  {([
                    ["1st witness", "witness_one_name", "witness_one_address", "witness_one_occupation"],
                    ["2nd witness", "witness_two_name", "witness_two_address", "witness_two_occupation"],
                  ] as const).map(([label, nameKey, addressKey, occupationKey]) => (
                    <div key={label} className="space-y-2">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-violet-400">{label}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Input placeholder="Name" value={form[nameKey]}
                          onChange={(e) => setForm({ ...form, [nameKey]: e.target.value })}
                          className="h-10 rounded-xl bg-background/50 border-white/10" />
                        <Input placeholder="Address" value={form[addressKey]}
                          onChange={(e) => setForm({ ...form, [addressKey]: e.target.value })}
                          className="h-10 rounded-xl bg-background/50 border-white/10" />
                        <Input placeholder="Occupation" value={form[occupationKey]}
                          onChange={(e) => setForm({ ...form, [occupationKey]: e.target.value })}
                          className="h-10 rounded-xl bg-background/50 border-white/10" />
                      </div>
                    </div>
                  ))}

                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-violet-400">Sold by</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input placeholder="Seller name" value={form.seller_name}
                        onChange={(e) => setForm({ ...form, seller_name: e.target.value })}
                        className="h-10 rounded-xl bg-background/50 border-white/10" />
                      <Input placeholder="Address" value={form.seller_address}
                        onChange={(e) => setForm({ ...form, seller_address: e.target.value })}
                        className="h-10 rounded-xl bg-background/50 border-white/10" />
                      <Input placeholder="Occupation" value={form.seller_occupation}
                        onChange={(e) => setForm({ ...form, seller_occupation: e.target.value })}
                        className="h-10 rounded-xl bg-background/50 border-white/10" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.received_in_good_condition}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, received_in_good_condition: checked === true })
                        }
                        className="data-[state=checked]:bg-violet-500"
                      />
                      <span className="text-xs font-semibold">Vehicle received in good condition</span>
                    </label>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Date received</Label>
                      <Input type="date"
                        value={form.received_date || form.sale_date}
                        onChange={(e) => setForm({ ...form, received_date: e.target.value })}
                        className="h-9 rounded-xl bg-background/50 border-white/10 text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-4">
                  <div className="space-y-2">
                     <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seller / Rep Name</Label>
                     <Input className="rounded-xl h-11 bg-background/50 border-white/10" placeholder="Full name" value={form.rep_name} onChange={(e) => setForm({ ...form, rep_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rep Signature</Label>
                     <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Rep" value={form.rep_signature} onChange={(v) => setForm({ ...form, rep_signature: v })} />
                     </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="space-y-2">
                     <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buyer Signature (In-Person)</Label>
                     <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Buyer" value={form.buyer_signature} onChange={(v) => setForm({ ...form, buyer_signature: v })} />
                     </div>
                  </div>
                  {form.buyer_signature && (
                    <div className="space-y-2">
                       <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buyer Signed Date</Label>
                       <Input type="date" className="rounded-xl h-11 bg-background/50 border-white/10" value={form.buyer_signature_date} onChange={(e) => setForm({ ...form, buyer_signature_date: e.target.value })} />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground italic">Or use the "Sign Link" in the table to send this to the customer.</p>
               </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Textarea className="rounded-xl min-h-[80px] bg-background/50 border-white/10 focus-visible:ring-violet-500" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional remarks regarding the sale..." />
            </div>
          </div>
          <div className="p-6 border-t border-white/5 bg-foreground/5 flex justify-end gap-3">
            <Button variant="ghost" onClick={resetForm} className="rounded-xl hover:bg-white/5">Clear</Button>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl border-white/10 hover:bg-white/5">Cancel</Button>
            <Button 
              onClick={() => upsertMutation.mutate()} 
              disabled={!( (form.customer_id || (isNewCustomer && newCustomer.name)) && form.selected_vehicle_ids.length > 0 && form.sale_price && !upsertMutation.isPending )} 
              className="rounded-xl bg-violet-500 hover:bg-violet-600 text-white border-0 shadow-lg shadow-violet-500/20"
            >
              {editId ? "Update Sale" : "Record Sale"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10 p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">Delete Sale</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">This action cannot be undone and will permanently remove the sale record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="rounded-xl border-white/10 text-foreground hover:bg-white/5 sm:mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20 border-none"
            >Delete Forever</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Payment history ─────────────────────────────────────────────── */}
      <Dialog open={!!paymentsSale} onOpenChange={(open) => !open && setPaymentsSale(null)}>
        <DialogContent className="max-w-2xl p-0 rounded-3xl glass-panel border-white/10 overflow-hidden max-h-[92vh] flex flex-col">
          <DialogHeader className="p-6 border-b border-white/5">
            <DialogTitle className="text-lg font-bold">Payment history</DialogTitle>
          </DialogHeader>

          {livePaymentsSale && (() => {
            const state = derivePaymentState(livePaymentsSale as any);
            return (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bento-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
                    <p className="text-xl font-bold mt-1">{formatNaira(state.total)}</p>
                  </div>
                  <div className="bento-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amount paid</p>
                    <p className="text-xl font-bold mt-1 text-emerald-500">{formatNaira(state.totalPaid)}</p>
                  </div>
                  <div className="bento-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Balance due</p>
                    <p className={`text-xl font-bold mt-1 ${state.balance > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                      {formatNaira(state.balance)}
                    </p>
                  </div>
                </div>

                {state.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No instalments recorded. This sale counts as{" "}
                    {state.isPaidInFull ? "paid in full" : "a deposit with the full balance outstanding"}.
                  </p>
                ) : (
                  <div className="rounded-2xl border border-white/10 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-foreground/5">
                        <TableRow className="border-border/50 hover:bg-transparent">
                          <TableHead className="font-semibold">Payment</TableHead>
                          <TableHead className="font-semibold">Date</TableHead>
                          <TableHead className="font-semibold">Method</TableHead>
                          <TableHead className="font-semibold">Amount</TableHead>
                          <TableHead className="text-right font-semibold">Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.payments.map((payment, index) => {
                          const paidSoFar = state.payments
                            .slice(0, index + 1)
                            .reduce((sum, pp) => sum + Number(pp.amount || 0), 0);
                          const closing = state.total - paidSoFar <= 0;
                          return (
                            <TableRow key={payment.id} className="border-border/10">
                              <TableCell className="text-sm font-semibold">
                                {paymentLabel(index, state.payments.length, closing)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(payment.payment_date || payment.created_at || "").toLocaleDateString("en-GB")}
                              </TableCell>
                              <TableCell className="text-xs capitalize">{payment.payment_method || "cash"}</TableCell>
                              <TableCell className="text-sm font-bold">{formatNaira(payment.amount)}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm"
                                  className="h-8 rounded-lg text-xs"
                                  onClick={() => {
                                    setPaymentsSale(null);
                                    printReceipt(livePaymentsSale, payment, index);
                                  }}>
                                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                                  {receiptNumber(payment.id, payment.payment_date || payment.created_at || null)}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {hasEdit && (
                  <div className="rounded-2xl bg-foreground/5 border border-white/5 p-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">
                      Add a payment
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
                        <CurrencyInput
                          value={newPayment.amount}
                          onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                          placeholder="0"
                          className="h-10 rounded-xl bg-background/50 border-white/10"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Method</Label>
                        <Select value={newPayment.method}
                          onValueChange={(v) => setNewPayment({ ...newPayment, method: v })}>
                          <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="glass-panel border-white/10 rounded-xl">
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="transfer">Bank Transfer</SelectItem>
                            <SelectItem value="pos">POS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Note</Label>
                        <Input
                          value={newPayment.notes}
                          onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                          className="h-10 rounded-xl bg-background/50 border-white/10"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={() => addPaymentMutation.mutate()}
                        disabled={!newPayment.amount || addPaymentMutation.isPending}
                        className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                      >
                        {addPaymentMutation.isPending ? "Saving..." : "Record payment"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="p-5 border-t border-white/5 bg-foreground/5 flex justify-end">
            <Button variant="outline" onClick={() => setPaymentsSale(null)}
              className="rounded-xl border-white/10 hover:bg-white/5">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <QrSignDialog 
        open={!!qrId} 
        onOpenChange={(open) => !open && setQrId(null)} 
        type="sale" 
        id={qrId} 
      />

      {/* Advanced Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl glass-panel shadow-2xl border-white/10 p-0 bg-background/95 backdrop-blur-3xl">
          <div className="p-6 border-b border-white/5 bg-emerald-500/5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Download className="h-5 w-5 text-emerald-500" /> Advanced Export
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Export multiple sales based on a specific date range.</p>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start Date</Label>
                <Input 
                  type="date" 
                  className="rounded-xl h-11 bg-background/50 border-white/10" 
                  value={exportDates.start}
                  onChange={(e) => setExportDates({ ...exportDates, start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">End Date</Label>
                <Input 
                  type="date" 
                  className="rounded-xl h-11 bg-background/50 border-white/10" 
                  value={exportDates.end}
                  onChange={(e) => setExportDates({ ...exportDates, end: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3">
               <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export Mode</Label>
               <div className="grid grid-cols-2 gap-3">
                  <div 
                    onClick={() => setExportMode("summary")}
                    className={cn(
                      "p-4 rounded-2xl border cursor-pointer transition-all flex flex-col gap-2",
                      exportMode === "summary" ? "bg-violet-500/10 border-violet-500/50" : "bg-background/40 border-white/5 hover:bg-white/5"
                    )}
                  >
                    <FileText className={cn("h-5 w-5", exportMode === "summary" ? "text-violet-500" : "text-muted-foreground")} />
                    <div>
                      <p className="font-bold text-sm">Summary PDF</p>
                      <p className="text-[10px] text-muted-foreground">Single table listing all sales.</p>
                    </div>
                  </div>
                  <div 
                    onClick={() => setExportMode("individual")}
                    className={cn(
                      "p-4 rounded-2xl border cursor-pointer transition-all flex flex-col gap-2",
                      exportMode === "individual" ? "bg-emerald-500/10 border-emerald-500/50" : "bg-background/40 border-white/5 hover:bg-white/5"
                    )}
                  >
                    <Download className={cn("h-5 w-5", exportMode === "individual" ? "text-emerald-500" : "text-muted-foreground")} />
                    <div>
                      <p className="font-bold text-sm">Individual Docs</p>
                      <p className="text-[10px] text-muted-foreground">Separate PDF for every sale.</p>
                    </div>
                  </div>
               </div>
            </div>

            {exportMode === "individual" && (
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-500 leading-relaxed">
                  Exporting individual documents for many sales may take time. Your browser will prompt you to allow multiple downloads.
                </p>
              </div>
            )}
          </div>
          <div className="p-6 border-t border-white/5 bg-foreground/5 flex justify-end gap-3">
             <Button variant="outline" onClick={() => setExportDialogOpen(false)} className="rounded-xl border-white/10">Cancel</Button>
             <Button 
                onClick={handleBulkExport} 
                className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 px-6"
                disabled={isExporting}
             >
               {isExporting ? "Processing..." : "Export Sales"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isExporting && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
           <div className="glass-panel p-10 rounded-3xl border-white/10 shadow-2xl max-w-sm space-y-4">
              <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <h2 className="text-2xl font-bold">Exporting Sales...</h2>
              <p className="text-muted-foreground">Generating and downloading your documents. Please do not close this window.</p>
           </div>
        </div>
      )}
    </div>
  </>
);
}
