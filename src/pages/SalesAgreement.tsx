import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Eye, FileCheck, FileSignature, Handshake, History, LayoutGrid, Pencil, Rows3,
  Search, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";
import { CurrencyInput } from "@/components/CurrencyInput";
import { CustomPagination } from "@/components/CustomPagination";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import {
  COMPANY, DocField, DocSectionTitle, InlineRuled, ModernSignSlot, PrintHeader,
  PrintWatermark, MODERN_FONT, ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { VIN_MAX_LENGTH } from "@/lib/constants";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import {
  ALL_TIME, ALL_WEEKS, longDate, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

const PAGE_KEY = "authority-to-sell" as const; // shares the Auth. Form permission
const ENTITY = "Sales Agreement";

const EMPTY_FORM = {
  agreementDate: new Date().toISOString().split("T")[0],
  sellerName: "",
  sellerAddress: "",
  sellerPhone: "",
  sellerIdType: "",
  buyerName: "",
  buyerAddress: "",
  buyerPhone: "",
  buyerIdType: "",
  vehicleMake: "",
  vehicleYearModel: "",
  vehicleColor: "",
  vehiclePlateNumber: "",
  vehicleEngineNumber: "",
  vehicleChassis: "",
  salePrice: "",
  paymentMethod: "",
  note: "",
  sellerSignature: "",
  sellerWitnessName: "",
  sellerWitnessSignature: "",
  buyerSignature: "",
  buyerWitnessName: "",
  buyerWitnessSignature: "",
  repName: "",
  repSignature: "",
  repSignatureDate: new Date().toISOString().split("T")[0],
};

type SAForm = typeof EMPTY_FORM;

const rowToForm = (row: any): SAForm => ({
  agreementDate: row.agreement_date || "",
  sellerName: row.seller_name || "",
  sellerAddress: row.seller_address || "",
  sellerPhone: row.seller_phone || "",
  sellerIdType: row.seller_id_type || "",
  buyerName: row.buyer_name || "",
  buyerAddress: row.buyer_address || "",
  buyerPhone: row.buyer_phone || "",
  buyerIdType: row.buyer_id_type || "",
  vehicleMake: row.vehicle_make || "",
  vehicleYearModel: row.vehicle_year_model || "",
  vehicleColor: row.vehicle_color || "",
  vehiclePlateNumber: row.vehicle_plate_number || "",
  vehicleEngineNumber: row.vehicle_engine_number || "",
  vehicleChassis: row.vehicle_chassis || "",
  salePrice: row.sale_price || "",
  paymentMethod: row.payment_method || "",
  note: row.note || "",
  sellerSignature: row.seller_signature || "",
  sellerWitnessName: row.seller_witness_name || "",
  sellerWitnessSignature: row.seller_witness_signature || "",
  buyerSignature: row.buyer_signature || "",
  buyerWitnessName: row.buyer_witness_name || "",
  buyerWitnessSignature: row.buyer_witness_signature || "",
  repName: row.rep_name || "",
  repSignature: row.rep_signature || "",
  repSignatureDate: row.rep_signature_date || "",
});

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500 mb-3">{children}</p>
);

// ─── The document ────────────────────────────────────────────────────────────

function AgreementDocument({ data }: { data: SAForm }) {
  const price = parseFloat((data.salePrice || "0").replace(/,/g, "")) || 0;

  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[20mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        <PrintHeader />

        <div className="text-center mb-5">
          <h1 className="text-[15.5px] font-black uppercase tracking-[0.1em] text-black underline underline-offset-4">
            Vehicle Sales Agreement &amp; Change of Ownership
          </h1>
          <p className="text-[10.5px] font-semibold text-black mt-1">
            Dated {longDate(data.agreementDate)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-5">
          <section>
            <DocSectionTitle>Seller's Information</DocSectionTitle>
            <div className="space-y-[7px]">
              <DocField label="Full Name" value={data.sellerName} />
              <DocField label="Address" value={data.sellerAddress} />
              <DocField label="Phone Number" value={data.sellerPhone} />
              <DocField label="ID Type & Number" value={data.sellerIdType} />
            </div>
          </section>
          <section>
            <DocSectionTitle>Buyer's Information</DocSectionTitle>
            <div className="space-y-[7px]">
              <DocField label="Full Name" value={data.buyerName} />
              <DocField label="Address" value={data.buyerAddress} />
              <DocField label="Phone Number" value={data.buyerPhone} />
              <DocField label="ID Type & Number" value={data.buyerIdType} />
            </div>
          </section>
        </div>

        <section className="mb-5">
          <DocSectionTitle>Vehicle Details</DocSectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-[7px]">
            <DocField label="Make / Brand" value={data.vehicleMake} />
            <DocField label="Year Model" value={data.vehicleYearModel} />
            <DocField label="Colour" value={data.vehicleColor} />
            <DocField label="Plate Number" value={data.vehiclePlateNumber} />
            <DocField label="Engine Number" value={data.vehicleEngineNumber} />
            <DocField label="Chassis / VIN No." value={data.vehicleChassis} />
          </div>
        </section>

        <section className="mb-5">
          <DocSectionTitle>Sale Details</DocSectionTitle>
          <div className="space-y-[7px]">
            <DocField label="Agreed Price" value={formatNaira(price)} />
            <p
              className="text-[10.5px] italic text-black pb-[2px]"
              style={{ borderBottom: ROW_RULE }}
            >
              {numberToWords(price)}
            </p>
            <DocField label="Payment Method" value={data.paymentMethod} />
          </div>
        </section>

        <section className="mb-5">
          <DocSectionTitle>Terms of Agreement</DocSectionTitle>
          <p className="text-[11px] leading-[1.75] text-black text-justify">
            I, <InlineRuled>{data.sellerName}</InlineRuled> (Seller), confirm the sale and
            transfer of full vehicle ownership to <InlineRuled>{data.buyerName}</InlineRuled>{" "}
            (Buyer) for <span className="font-bold">{formatNaira(price)}</span> (
            {numberToWords(price)}), facilitated by{" "}
            <span className="font-bold">{COMPANY.name} {COMPANY.nameSuffix}</span>.
          </p>
          <p className="text-[11px] leading-[1.75] text-black text-justify mt-2">
            The Seller warrants the vehicle is free from all encumbrances and title shall be
            transferred upon receipt of full payment. Both parties confirm reading and
            understanding these terms.
          </p>
        </section>

        {data.note ? (
          <section className="mb-5">
            <DocSectionTitle>Note</DocSectionTitle>
            <p className="text-[11px] leading-[1.7] text-black whitespace-pre-wrap">{data.note}</p>
          </section>
        ) : null}

        <section className="mt-6">
          <DocSectionTitle>Signatures &amp; Witnesses</DocSectionTitle>
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <ModernSignSlot
              signature={data.sellerSignature}
              caption="Seller's Signature"
              name={data.sellerName}
              date={longDate(data.agreementDate)}
            />
            <ModernSignSlot
              signature={data.buyerSignature}
              caption="Buyer's Signature"
              name={data.buyerName}
              date={longDate(data.agreementDate)}
            />
            <ModernSignSlot
              signature={data.sellerWitnessSignature}
              caption="Witness to the Seller"
              name={data.sellerWitnessName}
            />
            <ModernSignSlot
              signature={data.buyerWitnessSignature}
              caption="Witness to the Buyer"
              name={data.buyerWitnessName}
            />
            <div className="col-span-2 pt-1" style={{ borderTop: RULE }}>
              <div className="w-1/2 pt-3">
                <ModernSignSlot
                  signature={data.repSignature}
                  caption={`For ${COMPANY.name} ${COMPANY.nameSuffix}`}
                  name={data.repName}
                  date={longDate(data.repSignatureDate)}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SalesAgreement() {
  const { user, role } = useAuth();
  const { permissions } = usePermissions();
  const mayCreate = canCreate(role, PAGE_KEY, permissions);
  const mayEdit = canEdit(role, PAGE_KEY, permissions);
  const mayDelete = canDelete(role, PAGE_KEY, permissions);

  const [activeTab, setActiveTab] = useState(mayCreate ? "create" : "history");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewData, setPreviewData] = useState<SAForm | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(ALL_TIME);
  const [week, setWeek] = useState(ALL_WEEKS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [form, setForm, clearDraft] = useFormPersistence<SAForm>(
    "manga_sales_agreement_draft", EMPTY_FORM, !!editingId, editingId
  );

  const documentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const months = useMemo(() => monthOptions(), []);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["sales_agreements"],
    queryFn: async () => {
      // Signature columns hold base64 PNGs, so the history list leaves them out
      // and the full row is fetched when a document is previewed or edited.
      const { data, error } = await supabase
        .from("sales_agreements")
        .select("id, created_at, agreement_date, seller_name, seller_address, seller_phone, seller_id_type, buyer_name, buyer_address, buyer_phone, buyer_id_type, vehicle_make, vehicle_year_model, vehicle_color, vehicle_engine_number, vehicle_chassis, vehicle_plate_number, sale_price, payment_method, note, seller_witness_name, buyer_witness_name, rep_name, rep_signature_date")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    clearDraft();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        agreement_date: form.agreementDate || null,
        seller_name: form.sellerName.trim(),
        seller_address: form.sellerAddress.trim() || null,
        seller_phone: form.sellerPhone.trim() || null,
        seller_id_type: form.sellerIdType.trim() || null,
        buyer_name: form.buyerName.trim(),
        buyer_address: form.buyerAddress.trim() || null,
        buyer_phone: form.buyerPhone.trim() || null,
        buyer_id_type: form.buyerIdType.trim() || null,
        vehicle_make: form.vehicleMake.trim(),
        vehicle_year_model: form.vehicleYearModel.trim() || null,
        vehicle_color: form.vehicleColor.trim() || null,
        vehicle_plate_number: form.vehiclePlateNumber.trim() || null,
        vehicle_engine_number: form.vehicleEngineNumber.trim() || null,
        vehicle_chassis: form.vehicleChassis.trim() || null,
        sale_price: form.salePrice.replace(/,/g, "") || null,
        payment_method: form.paymentMethod.trim() || null,
        note: form.note.trim() || null,
        seller_signature: form.sellerSignature || null,
        buyer_signature: form.buyerSignature || null,
        seller_witness_name: form.sellerWitnessName.trim() || null,
        seller_witness_signature: form.sellerWitnessSignature || null,
        buyer_witness_name: form.buyerWitnessName.trim() || null,
        buyer_witness_signature: form.buyerWitnessSignature || null,
        rep_name: form.repName.trim() || null,
        rep_signature: form.repSignature || null,
        rep_signature_date: form.repSignatureDate || null,
        created_by: user?.id ?? null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("sales_agreements")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        await logAction("UPDATE", ENTITY, editingId);
        return editingId;
      }

      const { data, error } = await supabase
        .from("sales_agreements")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await logAction("CREATE", ENTITY, data.id);
      return data.id as string;
    },
    onSuccess: (id) => {
      setEditingId(id);
      setPreviewId(id);
      setPreviewData({ ...form });
      queryClient.invalidateQueries({ queryKey: ["sales_agreements"] });
      clearDraft();
      toast.success("Document saved to history");
      setMode("preview");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save the document"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_agreements").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", ENTITY, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales_agreements"] });
      toast.success("Document deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete the document"),
  });

  /** The whole row, signatures included — only needed for a document or an edit. */
  const fetchFullRow = async (row: any) => {
    const { data } = await supabase
      .from("sales_agreements")
      .select("*")
      .eq("id", row.id)
      .maybeSingle();
    return data ? { ...row, ...data } : row;
  };

  const openPreview = async (row: any) => {
    const full = await fetchFullRow(row);
    setPreviewData(rowToForm(full));
    setPreviewId(row.id);
    setMode("preview");
  };

  const openEdit = async (row: any) => {
    const full = await fetchFullRow(row);
    setEditingId(row.id);
    setForm(rowToForm(full));
    setActiveTab("create");
    setMode("edit");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchesSearch =
        !q ||
        (r.seller_name || "").toLowerCase().includes(q) ||
        (r.buyer_name || "").toLowerCase().includes(q) ||
        (r.vehicle_make || "").toLowerCase().includes(q) ||
        (r.vehicle_chassis || "").toLowerCase().includes(q);
      return matchesSearch && matchesPeriod(r.agreement_date || r.created_at, month, week);
    });
  }, [records, search, month, week]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const canSubmit =
    !!form.sellerName.trim() && !!form.buyerName.trim() && !!form.vehicleMake.trim() &&
    !saveMutation.isPending;

  if (mode === "preview" && previewData) {
    return (
      <div className="p-4 md:p-8 animate-fade-in">
        <DocumentToolbar
          documentRef={documentRef}
          filename={`sales-agreement-${(previewData.buyerName || "document").replace(/\s+/g, "-").toLowerCase()}`}
          entity={ENTITY}
          recordId={previewId}
          accentClass="bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
          onBack={() => setMode("edit")}
        />
        <div className="print-pages-container">
          <div ref={documentRef}>
            <AgreementDocument data={previewData} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-emerald-500/10 shrink-0">
          <Handshake className="h-6 w-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Sales Agreement &amp; Change of Ownership
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The signed agreement between seller and buyer, with witnesses, transferring ownership.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="rounded-xl bg-foreground/5 p-1">
          {mayCreate && (
            <TabsTrigger value="create" className="rounded-lg text-xs font-semibold">
              <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Create Document
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="rounded-lg text-xs font-semibold">
            <History className="h-3.5 w-3.5 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* ── Create ────────────────────────────────────────────────────── */}
        {mayCreate && (
          <TabsContent value="create" className="mt-0">
            <Card className="bento-card border-white/5">
              <CardContent className="p-6 space-y-8">
                {editingId && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs font-semibold text-amber-600">
                      Editing a saved document — saving updates it in place.
                    </p>
                    <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 rounded-lg text-xs">
                      Start a new one
                    </Button>
                  </div>
                )}

                <div className="max-w-xs space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Agreement Date
                  </Label>
                  <Input type="date" name="agreementDate" value={form.agreementDate}
                    onChange={handleChange}
                    className="rounded-xl h-11 bg-background/50 border-white/10" />
                </div>

                <div>
                  <SectionLabel>Seller's Information</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Full name *</Label>
                      <Input name="sellerName" value={form.sellerName} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input name="sellerPhone" value={form.sellerPhone} onChange={handleChange}
                        placeholder="080..." className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Input name="sellerAddress" value={form.sellerAddress} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">ID type &amp; number</Label>
                      <Input name="sellerIdType" value={form.sellerIdType} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="md:col-span-2">
                      <CustomerMatchHint
                        name={form.sellerName}
                        phone={form.sellerPhone}
                        onPick={(c) => setForm((prev) => ({
                          ...prev,
                          sellerName: c.name ?? prev.sellerName,
                          sellerPhone: c.phone ?? prev.sellerPhone,
                          sellerAddress: c.address ?? prev.sellerAddress,
                        }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Buyer's Information</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Full name *</Label>
                      <Input name="buyerName" value={form.buyerName} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input name="buyerPhone" value={form.buyerPhone} onChange={handleChange}
                        placeholder="080..." className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Input name="buyerAddress" value={form.buyerAddress} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">ID type &amp; number</Label>
                      <Input name="buyerIdType" value={form.buyerIdType} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="md:col-span-2">
                      <CustomerMatchHint
                        name={form.buyerName}
                        phone={form.buyerPhone}
                        onPick={(c) => setForm((prev) => ({
                          ...prev,
                          buyerName: c.name ?? prev.buyerName,
                          buyerPhone: c.phone ?? prev.buyerPhone,
                          buyerAddress: c.address ?? prev.buyerAddress,
                        }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Vehicle Details</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Make / brand *</Label>
                      <Input name="vehicleMake" value={form.vehicleMake} onChange={handleChange}
                        placeholder="Toyota" className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Year model</Label>
                      <Input name="vehicleYearModel" value={form.vehicleYearModel} onChange={handleChange}
                        placeholder="2015 Camry" className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Colour</Label>
                      <Input name="vehicleColor" value={form.vehicleColor} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Plate number</Label>
                      <Input name="vehiclePlateNumber" value={form.vehiclePlateNumber} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10 uppercase" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Engine number</Label>
                      <Input name="vehicleEngineNumber" value={form.vehicleEngineNumber} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10 font-mono" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Chassis / VIN</Label>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${form.vehicleChassis.length === VIN_MAX_LENGTH ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-500"}`}>
                          {form.vehicleChassis.length} / {VIN_MAX_LENGTH}
                        </span>
                      </div>
                      <Input
                        value={form.vehicleChassis}
                        maxLength={VIN_MAX_LENGTH}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            vehicleChassis: e.target.value
                              .toUpperCase()
                              .replace(/\s+/g, "")
                              .slice(0, VIN_MAX_LENGTH),
                          }))
                        }
                        className="rounded-xl h-11 bg-background/50 border-white/10 font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Sale Details</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Agreed sale price (₦)</Label>
                      <CurrencyInput
                        name="salePrice"
                        value={form.salePrice}
                        onChange={handleChange}
                        placeholder="0"
                        className="rounded-xl h-11 bg-background/50 border-white/10 font-bold"
                      />
                      {form.salePrice && (
                        <p className="text-[11px] italic text-emerald-500">
                          {numberToWords(form.salePrice)}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Payment method</Label>
                      <Input name="paymentMethod" value={form.paymentMethod} onChange={handleChange}
                        placeholder="Bank Transfer / Cash / Cheque"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                      <Textarea name="note" value={form.note} onChange={handleChange}
                        placeholder="Anything agreed in addition to the terms above..."
                        className="rounded-xl min-h-[80px] bg-background/50 border-white/10" />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Signatures &amp; Witnesses</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Seller</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad value={form.sellerSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, sellerSignature: v }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Buyer</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad value={form.buyerSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, buyerSignature: v }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Seller's witness</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad value={form.sellerWitnessSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, sellerWitnessSignature: v }))} />
                      </div>
                      <Input name="sellerWitnessName" value={form.sellerWitnessName} onChange={handleChange}
                        placeholder="Witness full name"
                        className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Buyer's witness</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad value={form.buyerWitnessSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, buyerWitnessSignature: v }))} />
                      </div>
                      <Input name="buyerWitnessName" value={form.buyerWitnessName} onChange={handleChange}
                        placeholder="Witness full name"
                        className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Company representative</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50 md:w-1/2">
                        <SignaturePad value={form.repSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, repSignature: v }))} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:w-1/2">
                        <Input name="repName" value={form.repName} onChange={handleChange}
                          placeholder="Rep full name"
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                        <Input type="date" name="repSignatureDate" value={form.repSignatureDate}
                          onChange={handleChange}
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-white/5">
                  <Button variant="outline" onClick={resetForm}
                    className="rounded-xl border-white/10 hover:bg-white/5">
                    Clear Form
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSubmit}
                    className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/20"
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    {saveMutation.isPending ? "Saving..." : "Save & Preview Document"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── History ───────────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-0 space-y-4">
          <div className="glass-panel rounded-2xl border border-white/5 p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search seller, buyer, vehicle or chassis..."
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

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bento-card p-12 flex flex-col items-center text-center">
              <div className="bg-emerald-500/10 p-5 rounded-full mb-4">
                <Handshake className="h-9 w-9 text-emerald-500" />
              </div>
              <h2 className="text-lg font-bold mb-1">No agreements yet</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Saved agreements appear here, ready to preview, print or edit.
              </p>
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map((r) => (
                <div key={r.id} className="bento-card p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{r.seller_name} → {r.buyer_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.vehicle_make} {r.vehicle_year_model}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500">
                      {shortDate(r.agreement_date)}
                    </span>
                  </div>
                  <p className="text-base font-bold text-foreground">
                    {formatNaira(r.sale_price || 0)}
                  </p>
                  <div className="flex gap-1.5 pt-2 border-t border-white/5">
                    <Button variant="outline" size="sm" onClick={() => openPreview(r)}
                      className="h-8 text-xs rounded-lg border-white/10">
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                    </Button>
                    {mayEdit && (
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}
                        className="h-8 text-xs rounded-lg border-white/10">
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                    )}
                    {mayDelete && (
                      <Button variant="ghost" size="icon" aria-label="Delete document"
                        onClick={() => setDeleteId(r.id)}
                        className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bento-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-foreground/5">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="px-6 font-semibold">Seller</TableHead>
                      <TableHead className="font-semibold">Buyer</TableHead>
                      <TableHead className="font-semibold">Vehicle</TableHead>
                      <TableHead className="font-semibold">Price</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="text-right px-6 font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.id} className="border-border/10 hover:bg-white/5">
                        <TableCell className="px-6 font-semibold text-sm">{r.seller_name}</TableCell>
                        <TableCell className="text-sm">{r.buyer_name}</TableCell>
                        <TableCell className="text-sm">{r.vehicle_make} {r.vehicle_year_model}</TableCell>
                        <TableCell className="text-sm font-semibold">{formatNaira(r.sale_price || 0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{shortDate(r.agreement_date)}</TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Preview document"
                              onClick={() => openPreview(r)}
                              className="h-8 w-8 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-500">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {mayEdit && (
                              <Button variant="ghost" size="icon" aria-label="Edit document"
                                onClick={() => openEdit(r)} className="h-8 w-8 rounded-lg hover:bg-foreground/10">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {mayDelete && (
                              <Button variant="ghost" size="icon" aria-label="Delete document"
                                onClick={() => setDeleteId(r.id)}
                                className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agreement?</AlertDialogTitle>
            <AlertDialogDescription>
              The agreement will be removed from history. This cannot be undone.
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
