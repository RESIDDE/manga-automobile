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
  ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";
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
import { isMissingSchema, omitKeys, warnOnce } from "@/lib/dbCompat";
import { VIN_MAX_LENGTH } from "@/lib/constants";
import {
  ALL_TIME, ALL_WEEKS, longDate, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

const PAGE_KEY = "authority-to-sell" as const;
const ENTITY = "Authority to Sell";

const EMPTY_FORM = {
  agreementDate: new Date().toISOString().split("T")[0],
  customerName: "",
  ownerRepName: "",
  customerAddress: "",
  customerPhone: "",
  customerIdType: "",
  vehicleMake: "",
  vehicleYearModel: "",
  vehicleColor: "",
  vehicleEngineNumber: "",
  vehicleChassis: "",
  validUntil: "",
  note: "",
  signature: "",
  repName: "",
  repSignature: "",
  repSignatureDate: new Date().toISOString().split("T")[0],
};

type ATSForm = typeof EMPTY_FORM;

const rowToForm = (row: any): ATSForm => ({
  agreementDate: row.agreement_date || "",
  customerName: row.customer_name || "",
  ownerRepName: row.owner_rep_name || "",
  customerAddress: row.customer_address || "",
  customerPhone: row.customer_phone || "",
  customerIdType: row.customer_id_type || "",
  vehicleMake: row.vehicle_make || "",
  vehicleYearModel: row.vehicle_year_model || "",
  vehicleColor: row.vehicle_color || "",
  vehicleEngineNumber: row.vehicle_engine_number || "",
  vehicleChassis: row.vehicle_chassis || "",
  validUntil: row.valid_until || "",
  note: row.note || "",
  signature: row.signature || "",
  repName: row.rep_name || "",
  repSignature: row.rep_signature || "",
  repSignatureDate: row.rep_signature_date || "",
});

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500 mb-3">{children}</p>
);

// ─── The document ────────────────────────────────────────────────────────────
// One component for the on-screen preview, the print output and the exported
// file. There is deliberately no separate print HTML — two renderers drift.

function AuthorityDocument({ data }: { data: ATSForm }) {
  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[20mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        <PrintHeader />

        <h1 className="text-center text-[17px] font-black uppercase tracking-[0.12em] text-black underline underline-offset-4 mb-5">
          Authority to Sell Vehicle
        </h1>

        <div className="mb-5 flex items-baseline gap-2" style={{ borderBottom: RULE }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Date:</span>
          <span className="text-[11.5px] font-bold text-black">{longDate(data.agreementDate)}</span>
        </div>

        <section className="mb-5">
          <DocSectionTitle>Owner's Information</DocSectionTitle>
          <div className="space-y-[7px]">
            <DocField label="Full Name" value={data.customerName} />
            <DocField label="Address" value={data.customerAddress} />
            <DocField label="Contact Number" value={data.customerPhone} />
            <DocField label="Valid ID Type & Number" value={data.customerIdType} />
          </div>
        </section>

        <section className="mb-5">
          <DocSectionTitle>Vehicle Information</DocSectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-[7px]">
            <DocField label="Make / Brand" value={data.vehicleMake} />
            <DocField label="Year Model" value={data.vehicleYearModel} />
            <DocField label="Colour" value={data.vehicleColor} />
            <DocField label="Engine Number" value={data.vehicleEngineNumber} />
            <DocField label="Chassis Number" value={data.vehicleChassis} className="col-span-2" />
          </div>
        </section>

        <section className="mb-5">
          <DocSectionTitle>Authority Given</DocSectionTitle>
          <p className="text-[11px] leading-[1.75] text-black text-justify">
            I, <InlineRuled>{data.customerName}</InlineRuled>
            {data.ownerRepName ? (
              <> (Represented by <InlineRuled>{data.ownerRepName}</InlineRuled>)</>
            ) : null}
            , hereby authorize{" "}
            <span className="font-bold">{COMPANY.name} {COMPANY.nameSuffix}</span>{" "}
            to sell the vehicle described above on my behalf. This authority includes:
            negotiating with potential buyers, accepting payment, signing necessary sale
            documents, and releasing the vehicle and its title documents.
          </p>
          <p
            className="mt-3 text-[11px] font-semibold text-black pb-[2px]"
            style={{ borderBottom: ROW_RULE }}
          >
            This authority is valid until:{" "}
            <span className="font-bold">{longDate(data.validUntil) || "—"}</span>
          </p>
        </section>

        {data.note ? (
          <section className="mb-5">
            <DocSectionTitle>Note</DocSectionTitle>
            <p className="text-[11px] leading-[1.7] text-black whitespace-pre-wrap">{data.note}</p>
          </section>
        ) : null}

        <section className="mt-7">
          <DocSectionTitle>Signatures</DocSectionTitle>
          <div className="grid grid-cols-2 gap-8">
            <ModernSignSlot
              signature={data.signature}
              caption="Owner / Representative Signature"
              name={data.ownerRepName ? `${data.customerName} (by ${data.ownerRepName})` : data.customerName}
              date={longDate(data.agreementDate)}
            />
            <ModernSignSlot
              signature={data.repSignature}
              caption="Company Representatives Signature"
              name={data.repName}
              date={longDate(data.repSignatureDate)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AuthorityToSell() {
  const { user, role } = useAuth();
  const { permissions } = usePermissions();
  const mayCreate = canCreate(role, PAGE_KEY, permissions);
  const mayEdit = canEdit(role, PAGE_KEY, permissions);
  const mayDelete = canDelete(role, PAGE_KEY, permissions);

  const [activeTab, setActiveTab] = useState(mayCreate ? "create" : "history");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewData, setPreviewData] = useState<ATSForm | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(ALL_TIME);
  const [week, setWeek] = useState(ALL_WEEKS);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [form, setForm, clearDraft] = useFormPersistence<ATSForm>(
    "manga_ats_draft", EMPTY_FORM, !!editingId, editingId
  );

  const documentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const months = useMemo(() => monthOptions(), []);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["authority_to_sell"],
    queryFn: async () => {
      // Signature columns hold base64 PNGs, so the history list leaves them out
      // and the full row is fetched when a document is previewed or edited.
      const { data, error } = await supabase
        .from("authority_to_sell")
        .select("id, created_at, agreement_date, customer_name, customer_address, customer_phone, customer_id_type, vehicle_make, vehicle_year_model, vehicle_color, vehicle_engine_number, vehicle_chassis, valid_until, note, rep_name, rep_signature_date")
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
        customer_name: form.customerName.trim(),
        owner_rep_name: form.ownerRepName.trim() || null,
        customer_address: form.customerAddress.trim() || null,
        customer_phone: form.customerPhone.trim() || null,
        customer_id_type: form.customerIdType.trim() || null,
        vehicle_make: form.vehicleMake.trim(),
        vehicle_year_model: form.vehicleYearModel.trim() || null,
        vehicle_color: form.vehicleColor.trim() || null,
        vehicle_engine_number: form.vehicleEngineNumber.trim() || null,
        vehicle_chassis: form.vehicleChassis.trim() || null,
        valid_until: form.validUntil || null,
        note: form.note.trim() || null,
        signature: form.signature || null,
        rep_name: form.repName.trim() || null,
        rep_signature: form.repSignature || null,
        rep_signature_date: form.repSignatureDate || null,
        created_by: user?.id ?? null,
      };

      if (editingId) {
        let { error } = await supabase
          .from("authority_to_sell")
          .update(payload)
          .eq("id", editingId);
        if (error && isMissingSchema(error, ["owner_rep_name"])) {
          warnOnce("ats_owner_rep", () => toast.warning(
            "Saved without the representative name — the database migration is still pending."
          ));
          ({ error } = await supabase
            .from("authority_to_sell")
            .update(omitKeys(payload, ["owner_rep_name"]))
            .eq("id", editingId));
        }
        if (error) throw error;
        await logAction("UPDATE", ENTITY, editingId);
        return editingId;
      }

      let { data, error } = await supabase
        .from("authority_to_sell")
        .insert(payload)
        .select("id")
        .single();
      if (error && isMissingSchema(error, ["owner_rep_name"])) {
        warnOnce("ats_owner_rep", () => toast.warning(
          "Saved without the representative name — the database migration is still pending."
        ));
        ({ data, error } = await supabase
          .from("authority_to_sell")
          .insert(omitKeys(payload, ["owner_rep_name"]))
          .select("id")
          .single());
      }
      if (error) throw error;
      await logAction("CREATE", ENTITY, data.id);
      return data.id as string;
    },
    onSuccess: (id) => {
      // Keep the id so a second save updates this row instead of duplicating it
      setEditingId(id);
      setPreviewId(id);
      setPreviewData({ ...form });
      queryClient.invalidateQueries({ queryKey: ["authority_to_sell"] });
      clearDraft();
      toast.success("Document saved to history");
      setMode("preview");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save the document"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("authority_to_sell").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", ENTITY, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authority_to_sell"] });
      toast.success("Document deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete the document"),
  });

  /** The whole row, signatures included — only needed for a document or an edit. */
  const fetchFullRow = async (row: any) => {
    const { data } = await supabase
      .from("authority_to_sell")
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
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.vehicle_make || "").toLowerCase().includes(q) ||
        (r.vehicle_chassis || "").toLowerCase().includes(q);
      return matchesSearch && matchesPeriod(r.agreement_date || r.created_at, month, week);
    });
  }, [records, search, month, week]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const canSubmit =
    !!form.customerName.trim() && !!form.vehicleMake.trim() && !saveMutation.isPending;

  // ── Preview mode replaces the whole page ──────────────────────────────────
  if (mode === "preview" && previewData) {
    return (
      <div className="p-4 md:p-8 animate-fade-in">
        <DocumentToolbar
          documentRef={documentRef}
          filename={`authority-to-sell-${(previewData.customerName || "document").replace(/\s+/g, "-").toLowerCase()}`}
          entity={ENTITY}
          recordId={previewId}
          accentClass="bg-sky-500 hover:bg-sky-600 shadow-sky-500/20"
          onBack={() => setMode("edit")}
        />
        <div className="print-pages-container">
          <div ref={documentRef}>
            <AuthorityDocument data={previewData} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-sky-500/10 shrink-0">
          <ShieldCheck className="h-6 w-6 text-sky-500" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Authority to Sell</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The owner's written authority for {COMPANY.name} {COMPANY.nameSuffix} to sell a vehicle on their behalf.
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
                  <Input
                    type="date" name="agreementDate" value={form.agreementDate}
                    onChange={handleChange}
                    className="rounded-xl h-11 bg-background/50 border-white/10"
                  />
                </div>

                <div>
                  <SectionLabel>Owner's Information</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Owner full name *</Label>
                      <Input name="customerName" value={form.customerName} onChange={handleChange}
                        placeholder="As written on the ID"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Representative name (optional)</Label>
                      <Input name="ownerRepName" value={form.ownerRepName} onChange={handleChange}
                        placeholder="Person acting for the owner"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Input name="customerAddress" value={form.customerAddress} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Contact number</Label>
                      <Input name="customerPhone" value={form.customerPhone} onChange={handleChange}
                        placeholder="080..." className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Valid ID type &amp; number</Label>
                      <Input name="customerIdType" value={form.customerIdType} onChange={handleChange}
                        placeholder="e.g. NIN 1234 5678 901"
                        className="rounded-xl h-11 bg-background/50 border-white/10" />
                    </div>
                    <div className="md:col-span-2">
                      <CustomerMatchHint
                        name={form.customerName}
                        phone={form.customerPhone}
                        onPick={(c) => setForm((prev) => ({
                          ...prev,
                          customerName: c.name ?? prev.customerName,
                          customerPhone: c.phone ?? prev.customerPhone,
                          customerAddress: c.address ?? prev.customerAddress,
                        }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Vehicle Information</SectionLabel>
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
                      <Label className="text-xs text-muted-foreground">Engine number</Label>
                      <Input name="vehicleEngineNumber" value={form.vehicleEngineNumber} onChange={handleChange}
                        className="rounded-xl h-11 bg-background/50 border-white/10 font-mono" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Chassis number (VIN)</Label>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${form.vehicleChassis.length === VIN_MAX_LENGTH ? "bg-emerald-500 text-white" : "bg-sky-500/10 text-sky-500"}`}>
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
                  <SectionLabel>Authority Terms</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Authority valid until</Label>
                      <Input type="date" name="validUntil" value={form.validUntil} onChange={handleChange}
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
                  <SectionLabel>Signatures</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Owner / Representative</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Owner / Representative"
                          value={form.signature}
                          onChange={(v) => setForm((prev) => ({ ...prev, signature: v }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Company Representative</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Company Representative"
                          value={form.repSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, repSignature: v }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
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
                    className="rounded-xl bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-lg shadow-sky-500/20"
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
                placeholder="Search owner, vehicle or chassis..."
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
                <Button
                  variant="ghost" size="icon" aria-label="Cards view"
                  onClick={() => setView("cards")}
                  className={`h-8 w-8 rounded-lg ${view === "cards" ? "bg-sky-500/15 text-sky-500" : ""}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" aria-label="Table view"
                  onClick={() => setView("table")}
                  className={`h-8 w-8 rounded-lg ${view === "table" ? "bg-sky-500/15 text-sky-500" : ""}`}
                >
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
              <div className="bg-sky-500/10 p-5 rounded-full mb-4">
                <ShieldCheck className="h-9 w-9 text-sky-500" />
              </div>
              <h2 className="text-lg font-bold mb-1">No documents yet</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Saved authorities appear here, ready to preview, print or edit.
              </p>
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map((r) => (
                <div key={r.id} className="bento-card p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{r.customer_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.vehicle_make} {r.vehicle_year_model}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-500">
                      {shortDate(r.agreement_date)}
                    </span>
                  </div>
                  {r.vehicle_chassis && (
                    <p className="text-[11px] font-mono text-muted-foreground bg-foreground/5 px-2 py-1 rounded-md w-fit">
                      {r.vehicle_chassis}
                    </p>
                  )}
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
                      <TableHead className="px-6 font-semibold">Owner</TableHead>
                      <TableHead className="font-semibold">Vehicle</TableHead>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="text-right px-6 font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.id} className="border-border/10 hover:bg-white/5">
                        <TableCell className="px-6 font-semibold text-sm">{r.customer_name}</TableCell>
                        <TableCell className="text-sm">{r.vehicle_make} {r.vehicle_year_model}</TableCell>
                        <TableCell className="font-mono text-xs">{r.vehicle_chassis || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{shortDate(r.agreement_date)}</TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Preview document"
                              onClick={() => openPreview(r)} className="h-8 w-8 rounded-lg hover:bg-sky-500/10 hover:text-sky-500">
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
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              The authority will be removed from history. This cannot be undone.
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
