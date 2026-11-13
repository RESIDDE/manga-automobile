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
  Eye, FileCheck, FileSignature, History, LayoutGrid, Pencil, Rows3, Search,
  Trash2, Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";
import { CurrencyInput } from "@/components/CurrencyInput";
import { CustomPagination } from "@/components/CustomPagination";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { RecordActions } from "@/components/RecordActions";
import { PrintSheet } from "@/components/PrintSheet";
import {
  COMPANY, DocField, DocSectionTitle, InlineRuled, ModernSignSlot,
  PrintHeader, PrintWatermark, MODERN_FONT, ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { VIN_FULL_LENGTH } from "@/lib/constants";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import {
  ALL_TIME, ALL_WEEKS, longDate, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

// Consignment sits under Sales: an owner leaving a car to be sold is a sales
// document, so it rides on the same permission key rather than adding another.
const PAGE_KEY = "sales" as const;
const ENTITY = "Consignment Agreement";

/** House terms, printed on the form but negotiable per owner. */
const DEFAULT_WITHDRAWAL_DAYS = "3";
const DEFAULT_WITHDRAWAL_CHARGE = "100000";

const today = () => new Date().toISOString().split("T")[0];

const EMPTY_FORM = {
  agreementDate: today(),
  /** Assigned by the database on save — 001, 002, … See 20261112110000. */
  documentNo: "",

  companyRep: "Muhammad Manga (CEO)",
  companyAddress: "",
  companyPhone: "",

  ownerName: "",
  ownerAddress: "",
  ownerPhone: "",
  ownerIdNumber: "",

  vehicleMakeModel: "",
  vehicleYear: "",
  vehicleColor: "",
  vehicleChassis: "",
  agreedPrice: "",

  commissionAmount: "",
  commissionNote: "",

  withdrawalDays: DEFAULT_WITHDRAWAL_DAYS,
  withdrawalCharge: DEFAULT_WITHDRAWAL_CHARGE,

  notes: "",

  companySignature: "",
  companySignDate: today(),
  ownerSignature: "",
  ownerSignName: "",
  ownerSignDate: "",
  witnessSignature: "",
  witnessName: "",
};

type ConsignmentForm = typeof EMPTY_FORM;

const rowToForm = (row: any): ConsignmentForm => ({
  agreementDate: row.agreement_date || "",
  documentNo: row.document_no || "",
  companyRep: row.company_rep || "Muhammad Manga (CEO)",
  companyAddress: row.company_address || "",
  companyPhone: row.company_phone || "",
  ownerName: row.owner_name || "",
  ownerAddress: row.owner_address || "",
  ownerPhone: row.owner_phone || "",
  ownerIdNumber: row.owner_id_number || "",
  vehicleMakeModel: row.vehicle_make_model || "",
  vehicleYear: row.vehicle_year || "",
  vehicleColor: row.vehicle_color || "",
  vehicleChassis: row.vehicle_chassis || "",
  agreedPrice: row.agreed_price != null ? String(row.agreed_price) : "",
  commissionAmount: row.commission_amount != null ? String(row.commission_amount) : "",
  commissionNote: row.commission_note || "",
  withdrawalDays: row.withdrawal_days != null ? String(row.withdrawal_days) : DEFAULT_WITHDRAWAL_DAYS,
  withdrawalCharge: row.withdrawal_charge != null ? String(row.withdrawal_charge) : DEFAULT_WITHDRAWAL_CHARGE,
  notes: row.notes || "",
  companySignature: row.company_signature || "",
  companySignDate: row.company_sign_date || "",
  ownerSignature: row.owner_signature || "",
  ownerSignName: row.owner_sign_name || "",
  ownerSignDate: row.owner_sign_date || "",
  witnessSignature: row.witness_signature || "",
  witnessName: row.witness_name || "",
});

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-500 mb-3">{children}</p>
);

const money = (value: string) => parseFloat((value || "0").replace(/,/g, "")) || 0;

// ─── The document ────────────────────────────────────────────────────────────
// One component for the preview, the print output and every exported file.

function ConsignmentDocument({ data }: { data: ConsignmentForm }) {
  const price = money(data.agreedPrice);
  const commission = money(data.commissionAmount);
  const charge = money(data.withdrawalCharge);
  const days = data.withdrawalDays || DEFAULT_WITHDRAWAL_DAYS;

  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[20mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        {/* The serial prints under the address, as on the paper books */}
        <PrintHeader docNumber={data.documentNo} />

        <div className="text-center mb-5">
          {/* A drawn rule, not text-decoration: the PDF renderer draws underlines through the letters */}
          <h1 className="inline-block pb-[3px] text-[15.5px] font-black uppercase tracking-[0.1em] text-black" style={{ borderBottom: "1.5px solid #000" }}>
            Vehicle Display / Consignment Agreement
          </h1>
        </div>

        <div className="mb-5 flex items-baseline gap-2" style={{ borderBottom: RULE }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Date:</span>
          <span className="text-[11.5px] font-bold text-black">{longDate(data.agreementDate)}</span>
        </div>

        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-black mb-2">Between:</p>

        <div className="grid grid-cols-2 gap-6 mb-5">
          <section>
            <DocSectionTitle>{COMPANY.name} {COMPANY.nameSuffix}</DocSectionTitle>
            <div className="space-y-[7px]">
              <DocField label="Represented by" value={data.companyRep} />
              <DocField label="Office Address" value={data.companyAddress || COMPANY.addressLines.join(" ")} />
              <DocField label="Phone" value={data.companyPhone || COMPANY.tel} />
            </div>
            <p className="text-[9.5px] italic text-neutral-500 mt-1">(“The Company”)</p>
          </section>

          <section>
            <DocSectionTitle>The Car Owner</DocSectionTitle>
            <div className="space-y-[7px]">
              <DocField label="Name" value={data.ownerName} />
              <DocField label="Address" value={data.ownerAddress} />
              <DocField label="Phone No" value={data.ownerPhone} />
              <DocField label="NIN / ID No" value={data.ownerIdNumber} />
            </div>
            <p className="text-[9.5px] italic text-neutral-500 mt-1">(“The Owner”)</p>
          </section>
        </div>

        <section className="mb-5">
          <DocSectionTitle>Vehicle Details</DocSectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-[7px]">
            <DocField label="Car Make / Model" value={data.vehicleMakeModel} />
            <DocField label="Year" value={data.vehicleYear} />
            <DocField label="Colour" value={data.vehicleColor} />
            <DocField label="Chassis No" value={data.vehicleChassis} />
          </div>
          <div className="mt-2 space-y-[4px]">
            <DocField label="Owner's Agreed Selling Price" value={formatNaira(price)} />
            <p className="text-[10.5px] italic text-black pb-[2px]" style={{ borderBottom: ROW_RULE }}>
              {numberToWords(price)}
            </p>
          </div>
        </section>

        <section className="mb-4">
          <DocSectionTitle>Terms of Agreement</DocSectionTitle>

          {/* Left-aligned, not justified: the PDF renderer drops justified spacing and words run together */}
          <div className="space-y-[10px] text-[10.5px] leading-[1.65] text-black text-left" style={{ wordSpacing: "0.04em" }}>
            <p>
              <span className="font-bold">1. PURPOSE.</span> The Owner has brought his/her vehicle to{" "}
              {COMPANY.name} {COMPANY.nameSuffix} car stand for display and sale.
            </p>

            <p>
              <span className="font-bold">2. COMPANY'S COMMISSION.</span> After the sale of the vehicle,
              the Company shall deduct <InlineRuled>{formatNaira(commission)}</InlineRuled>
              {data.commissionNote ? <> {data.commissionNote}</> : null}.
            </p>

            <div>
              <p>
                <span className="font-bold">3. RESPONSIBILITIES OF {COMPANY.name.toUpperCase()}{" "}
                {COMPANY.nameSuffix.toUpperCase()} UPON DISPLAY.</span> The Company shall be responsible for:
              </p>
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-[2px]">
                <li>Safe keeping and custody of the vehicle while in the car stand.</li>
                <li>Managing all inspection, viewings and negotiations with prospective buyers.</li>
                <li>Handling all sales-related communication.</li>
                <li>
                  Daily warming of the vehicle to keep the battery safe and ensure the car is ready
                  for inspection daily.
                </li>
              </ol>
            </div>

            <p>
              <span className="font-bold">4. WITHDRAWAL BEFORE SALE.</span> In the event the Owner decides
              to take his/her car back before it is sold, after <InlineRuled>{days} days</InlineRuled> of
              display, the Owner should pay the office the sum of{" "}
              <span className="font-bold">{formatNaira(charge)} ({numberToWords(charge)})</span>{" "}
              as service / display charge.
            </p>

            <div>
              <p><span className="font-bold">5. GENERAL TERMS.</span></p>
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-[2px]">
                <li>
                  The Owner confirms that the vehicle is his/her lawful property and is free from any
                  dispute, lien or encumbrance.
                </li>
                <li>
                  Upon signing out the vehicle, the Owner should contact the C.E.O for approval.
                </li>
                <li>
                  The Owner shall not sell the vehicle privately while it is on display at{" "}
                  {COMPANY.name} {COMPANY.nameSuffix} without informing the Company.
                </li>
                <li>Both parties agree to abide by the terms of this agreement.</li>
              </ol>
            </div>
          </div>
        </section>

        {data.notes ? (
          <section className="mb-4">
            <DocSectionTitle>Note</DocSectionTitle>
            <p className="text-[10.5px] leading-[1.6] text-black whitespace-pre-wrap">{data.notes}</p>
          </section>
        ) : null}

        <p className="text-[10.5px] text-black mb-3">
          <span className="font-bold">IN WITNESS WHEREOF,</span> both parties have signed this agreement
          on the date stated above.
        </p>

        <section>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <ModernSignSlot
              signature={data.companySignature}
              caption={`Signed for ${COMPANY.name} ${COMPANY.nameSuffix}`}
              name={data.companyRep}
              date={longDate(data.companySignDate)}
            />
            <ModernSignSlot
              signature={data.ownerSignature}
              caption="Signed by Car Owner"
              name={data.ownerSignName || data.ownerName}
              date={longDate(data.ownerSignDate)}
            />
            <div className="col-span-2 pt-1" style={{ borderTop: RULE }}>
              <div className="w-1/2 pt-3">
                <ModernSignSlot
                  signature={data.witnessSignature}
                  caption="Witness"
                  name={data.witnessName}
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

export default function ConsignmentAgreement() {
  const { user, role } = useAuth();
  const { permissions } = usePermissions();
  const mayCreate = canCreate(role, PAGE_KEY, permissions);
  const mayEdit = canEdit(role, PAGE_KEY, permissions);
  const mayDelete = canDelete(role, PAGE_KEY, permissions);

  const [activeTab, setActiveTab] = useState(mayCreate ? "create" : "history");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewData, setPreviewData] = useState<ConsignmentForm | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(ALL_TIME);
  const [week, setWeek] = useState(ALL_WEEKS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [form, setForm, clearDraft] = useFormPersistence<ConsignmentForm>(
    "manga_consignment_draft", EMPTY_FORM, !!editingId, editingId
  );

  const documentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const months = useMemo(() => monthOptions(), []);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["consignment_agreements"],
    queryFn: async () => {
      // Signature columns are base64 PNGs; the history list never shows them,
      // so they are fetched per record when a document is opened or edited.
      const { data, error } = await supabase
        .from("consignment_agreements")
        .select(
          "id, created_at, document_no, agreement_date, owner_name, owner_phone, owner_address, " +
          "owner_id_number, vehicle_make_model, vehicle_year, vehicle_color, " +
          "vehicle_chassis, agreed_price, commission_amount, commission_note, " +
          "withdrawal_days, withdrawal_charge, notes, company_rep, company_address, " +
          "company_phone, owner_sign_name, witness_name, company_sign_date, owner_sign_date"
        )
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
        company_rep: form.companyRep.trim() || null,
        company_address: form.companyAddress.trim() || null,
        company_phone: form.companyPhone.trim() || null,
        owner_name: form.ownerName.trim(),
        owner_address: form.ownerAddress.trim() || null,
        owner_phone: form.ownerPhone.trim() || null,
        owner_id_number: form.ownerIdNumber.trim() || null,
        vehicle_make_model: form.vehicleMakeModel.trim(),
        vehicle_year: form.vehicleYear.trim() || null,
        vehicle_color: form.vehicleColor.trim() || null,
        vehicle_chassis: form.vehicleChassis.trim() || null,
        agreed_price: money(form.agreedPrice),
        commission_amount: money(form.commissionAmount),
        commission_note: form.commissionNote.trim() || null,
        withdrawal_days: parseInt(form.withdrawalDays, 10) || 0,
        withdrawal_charge: money(form.withdrawalCharge),
        notes: form.notes.trim() || null,
        company_signature: form.companySignature || null,
        company_sign_date: form.companySignDate || null,
        owner_signature: form.ownerSignature || null,
        owner_sign_name: form.ownerSignName.trim() || null,
        owner_sign_date: form.ownerSignDate || null,
        witness_signature: form.witnessSignature || null,
        witness_name: form.witnessName.trim() || null,
        created_by: user?.id ?? null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("consignment_agreements")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        await logAction("UPDATE", ENTITY, editingId);
        return { id: editingId, document_no: form.documentNo || null };
      }

      const { data, error } = await supabase
        .from("consignment_agreements")
        .insert(payload)
        .select("id, document_no")
        .single();
      if (error) throw error;
      await logAction("CREATE", ENTITY, data.id);
      return data as { id: string; document_no: string | null };
    },
    onSuccess: ({ id, document_no }) => {
      const saved = { ...form, documentNo: document_no || form.documentNo };
      setEditingId(id);
      setPreviewId(id);
      setForm(saved);
      setPreviewData(saved);
      queryClient.invalidateQueries({ queryKey: ["consignment_agreements"] });
      clearDraft();
      toast.success("Agreement saved to history");
      setMode("preview");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save the agreement"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consignment_agreements").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", ENTITY, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consignment_agreements"] });
      toast.success("Agreement deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete the agreement"),
  });

  /** The whole row, signatures included — only needed to print or edit. */
  const fetchFullRow = async (row: any) => {
    const { data } = await supabase
      .from("consignment_agreements")
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
        (r.document_no || "").toLowerCase().includes(q) ||
        (r.owner_name || "").toLowerCase().includes(q) ||
        (r.owner_phone || "").toLowerCase().includes(q) ||
        (r.vehicle_make_model || "").toLowerCase().includes(q) ||
        (r.vehicle_chassis || "").toLowerCase().includes(q);
      return matchesSearch && matchesPeriod(r.agreement_date || r.created_at, month, week);
    });
  }, [records, search, month, week]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const canSubmit =
    !!form.ownerName.trim() && !!form.vehicleMakeModel.trim() && !saveMutation.isPending;

  // ── Preview replaces the page ─────────────────────────────────────────────
  if (mode === "preview" && previewData) {
    return (
      <div className="animate-fade-in">
        <DocumentToolbar
          documentRef={documentRef}
          filename={`consignment-${(previewData.ownerName || "agreement").replace(/\s+/g, "-").toLowerCase()}`}
          entity={ENTITY}
          recordId={previewId}
          archive={{
            type: "Consignment Agreement",
            title: `Consignment Agreement — ${previewData.ownerName || "Owner"}`,
            number: previewData.documentNo || null,
            docDate: previewData.agreementDate || null,
            person: previewData.ownerName || null,
            phone: previewData.ownerPhone || null,
            nin: previewData.ownerIdNumber || null,
            vehicle: [previewData.vehicleYear, previewData.vehicleMakeModel, previewData.vehicleChassis].filter(Boolean).join(" ") || null,
            details: { agreement: previewData },
          }}
          accentClass="bg-teal-500 hover:bg-teal-600 shadow-teal-500/20"
          onBack={() => setMode("edit")}
        />
        <PrintSheet ref={documentRef}>
          <ConsignmentDocument data={previewData} />
        </PrintSheet>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-teal-500/10 shrink-0">
          <Warehouse className="h-6 w-6 text-teal-500" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Vehicle Display / Consignment
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The agreement an owner signs when they leave a car on the stand for us to sell.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="rounded-xl bg-foreground/5 p-1">
          {mayCreate && (
            <TabsTrigger value="create" className="rounded-lg text-xs font-semibold">
              <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Create Agreement
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
                      Editing a saved agreement — saving updates it in place.
                    </p>
                    <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 rounded-lg text-xs">
                      Start a new one
                    </Button>
                  </div>
                )}

                <div className="max-w-xs space-y-2">
                  <Label htmlFor="agreementDate" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Agreement Date
                  </Label>
                  <Input type="date" id="agreementDate" name="agreementDate" value={form.agreementDate}
                    onChange={handleChange}
                    className="rounded-xl h-11 bg-background/50 border-white/10" />
                </div>

                <div>
                  <SectionLabel>Manga Automobile</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyRep" className="text-xs text-muted-foreground">Represented by</Label>
                      <Input id="companyRep" name="companyRep" value={form.companyRep} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyPhone" className="text-xs text-muted-foreground">Office phone</Label>
                      <Input id="companyPhone" name="companyPhone" value={form.companyPhone} onChange={handleChange}
                        placeholder={COMPANY.tel}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="companyAddress" className="text-xs text-muted-foreground">Office address</Label>
                      <Input id="companyAddress" name="companyAddress" value={form.companyAddress} onChange={handleChange}
                        placeholder={COMPANY.addressLines.join(" ")}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>The Car Owner</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ownerName" className="text-xs text-muted-foreground">Full name *</Label>
                      <Input id="ownerName" name="ownerName" value={form.ownerName} onChange={handleChange}
                        placeholder="As written on the ID"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ownerPhone" className="text-xs text-muted-foreground">Phone no</Label>
                      <Input id="ownerPhone" name="ownerPhone" value={form.ownerPhone} onChange={handleChange}
                        placeholder="080..."
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ownerAddress" className="text-xs text-muted-foreground">Address</Label>
                      <Input id="ownerAddress" name="ownerAddress" value={form.ownerAddress} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ownerIdNumber" className="text-xs text-muted-foreground">NIN / ID no</Label>
                      <Input id="ownerIdNumber" name="ownerIdNumber" value={form.ownerIdNumber} onChange={handleChange}
                        placeholder="e.g. NIN 1234 5678 901"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="md:col-span-2">
                      <CustomerMatchHint
                        name={form.ownerName}
                        phone={form.ownerPhone}
                        onPick={(c) => setForm((prev) => ({
                          ...prev,
                          ownerName: c.name ?? prev.ownerName,
                          ownerPhone: c.phone ?? prev.ownerPhone,
                          ownerAddress: c.address ?? prev.ownerAddress,
                        }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Vehicle Details</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vehicleMakeModel" className="text-xs text-muted-foreground">Car make / model *</Label>
                      <Input id="vehicleMakeModel" name="vehicleMakeModel" value={form.vehicleMakeModel} onChange={handleChange}
                        placeholder="Toyota Camry"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleYear" className="text-xs text-muted-foreground">Year</Label>
                      <Input id="vehicleYear" name="vehicleYear" value={form.vehicleYear} onChange={handleChange}
                        placeholder="2015"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleColor" className="text-xs text-muted-foreground">Colour</Label>
                      <Input id="vehicleColor" name="vehicleColor" value={form.vehicleColor} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Chassis no</Label>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${form.vehicleChassis.length === VIN_FULL_LENGTH ? "bg-emerald-500 text-white" : "bg-teal-500/10 text-teal-500"}`}>
                          {form.vehicleChassis.length} / {VIN_FULL_LENGTH}
                        </span>
                      </div>
                      <Input
                        value={form.vehicleChassis}
                        maxLength={VIN_FULL_LENGTH}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            vehicleChassis: e.target.value
                              .toUpperCase().replace(/\s+/g, "").slice(0, VIN_FULL_LENGTH),
                          }))
                        }
                        className="rounded-xl h-11 bg-background/50 border-white/10 font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="agreedPrice" className="text-xs text-muted-foreground">Owner's agreed selling price (₦)</Label>
                      <CurrencyInput
                        id="agreedPrice" name="agreedPrice"
                        value={form.agreedPrice}
                        onChange={handleChange}
                        placeholder="0"
                        className="rounded-xl h-11 bg-background/50 border-white/10 font-bold"
                      />
                      {form.agreedPrice && (
                        <p className="text-[11px] italic text-teal-500">
                          {numberToWords(form.agreedPrice)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Terms</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="commissionAmount" className="text-xs text-muted-foreground">
                        Company commission, deducted after the sale (₦)
                      </Label>
                      <CurrencyInput
                        id="commissionAmount" name="commissionAmount"
                        value={form.commissionAmount}
                        onChange={handleChange}
                        placeholder="0"
                        className="rounded-xl h-11 bg-background/50 border-white/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commissionNote" className="text-xs text-muted-foreground">Commission wording (optional)</Label>
                      <Input id="commissionNote" name="commissionNote" value={form.commissionNote} onChange={handleChange}
                        placeholder="e.g. for receipts and paperwork"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdrawalDays" className="text-xs text-muted-foreground">Free display days before a charge</Label>
                      <Input type="number" min={0} id="withdrawalDays" name="withdrawalDays" value={form.withdrawalDays}
                        onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdrawalCharge" className="text-xs text-muted-foreground">
                        Withdrawal / display charge (₦)
                      </Label>
                      <CurrencyInput
                        id="withdrawalCharge" name="withdrawalCharge"
                        value={form.withdrawalCharge}
                        onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="notes" className="text-xs text-muted-foreground">Note (optional)</Label>
                      <Textarea id="notes" name="notes" value={form.notes} onChange={handleChange}
                        placeholder="Anything agreed in addition to the printed terms..."
                        className="rounded-xl min-h-[80px] bg-background/50 border-white/10" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Clauses 1, 3 and 5 are the house terms and print exactly as written on the paper form.
                  </p>
                </div>

                <div>
                  <SectionLabel>Signatures</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        For {COMPANY.name} {COMPANY.nameSuffix}
                      </Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Company"
                          value={form.companySignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, companySignature: v }))}
                        />
                      </div>
                      <Input type="date" name="companySignDate" value={form.companySignDate}
                        onChange={handleChange}
                        className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Car owner</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Car owner"
                          value={form.ownerSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, ownerSignature: v }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input name="ownerSignName" value={form.ownerSignName} onChange={handleChange}
                          placeholder="Name as signed"
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                        <Input type="date" name="ownerSignDate" value={form.ownerSignDate}
                          onChange={handleChange}
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Witness</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50 md:w-1/2">
                        <SignaturePad
                          label="Witness"
                          value={form.witnessSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, witnessSignature: v }))}
                        />
                      </div>
                      <Input name="witnessName" value={form.witnessName} onChange={handleChange}
                        placeholder="Witness full name"
                        className="rounded-xl h-10 bg-background/50 border-white/10 text-sm md:w-1/2" />
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
                    className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white border-0 shadow-lg shadow-teal-500/20"
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    {saveMutation.isPending ? "Saving..." : "Save & Preview Agreement"}
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
                placeholder="Search no., owner, phone, vehicle or chassis..."
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
                  className={`h-8 w-8 rounded-lg ${view === "cards" ? "bg-teal-500/15 text-teal-500" : ""}`}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Table view"
                  onClick={() => setView("table")}
                  className={`h-8 w-8 rounded-lg ${view === "table" ? "bg-teal-500/15 text-teal-500" : ""}`}>
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
              <div className="bg-teal-500/10 p-5 rounded-full mb-4">
                <Warehouse className="h-9 w-9 text-teal-500" />
              </div>
              <h2 className="text-lg font-bold mb-1">No consignment agreements yet</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Agreements you save appear here, ready to preview, print or edit.
              </p>
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map((r) => (
                <div key={r.id} className="bento-card p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-teal-500 mb-0.5">
                        No. {r.document_no || "—"}
                      </p>
                      <p className="font-bold text-sm truncate">{r.owner_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.vehicle_make_model} {r.vehicle_year}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-500">
                      {shortDate(r.agreement_date)}
                    </span>
                  </div>
                  <p className="text-base font-bold text-foreground">
                    {formatNaira(r.agreed_price || 0)}
                  </p>
                  {r.vehicle_chassis && (
                    <p className="text-[11px] font-mono text-muted-foreground bg-foreground/5 px-2 py-1 rounded-md w-fit">
                      {r.vehicle_chassis}
                    </p>
                  )}
                  <RecordActions
                    menuLabel={`More actions for ${r.owner_name}`}
                    primary={[
                      { label: "Preview", icon: Eye, onClick: () => openPreview(r) },
                      { label: "Edit", icon: Pencil, onClick: () => openEdit(r), show: mayEdit },
                    ]}
                    menu={[
                      {
                        label: "Delete agreement", icon: Trash2,
                        onClick: () => setDeleteId(r.id), destructive: true, show: mayDelete,
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="bento-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader className="bg-foreground/5">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="px-6 font-semibold">No.</TableHead>
                      <TableHead className="font-semibold">Owner</TableHead>
                      <TableHead className="font-semibold">Phone</TableHead>
                      <TableHead className="font-semibold">Vehicle</TableHead>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">Agreed price</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="text-right px-6 font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.id} className="border-border/10 hover:bg-white/5">
                        <TableCell className="px-6 font-mono text-xs font-bold text-teal-500">
                          {r.document_no || "—"}
                        </TableCell>
                        <TableCell className="font-semibold text-sm">{r.owner_name}</TableCell>
                        <TableCell className="text-sm">{r.owner_phone || "—"}</TableCell>
                        <TableCell className="text-sm">{r.vehicle_make_model} {r.vehicle_year}</TableCell>
                        <TableCell className="font-mono text-xs">{r.vehicle_chassis || "—"}</TableCell>
                        <TableCell className="text-sm font-semibold">
                          {formatNaira(r.agreed_price || 0)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {shortDate(r.agreement_date)}
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <RecordActions
                            inline
                            menuLabel={`More actions for ${r.owner_name}`}
                            primary={[
                              { label: "Preview", icon: Eye, onClick: () => openPreview(r) },
                            ]}
                            menu={[
                              { label: "Edit agreement", icon: Pencil, onClick: () => openEdit(r), show: mayEdit },
                              {
                                label: "Delete agreement", icon: Trash2, destructive: true,
                                onClick: () => setDeleteId(r.id), show: mayDelete,
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
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agreement?</AlertDialogTitle>
            <AlertDialogDescription>
              The consignment agreement will be removed from history. This cannot be undone.
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
