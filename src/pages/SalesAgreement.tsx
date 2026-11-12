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
import { RecordActions } from "@/components/RecordActions";
import { PrintSheet } from "@/components/PrintSheet";
import {
  COMPANY, DocField, DocSectionTitle, InlineRuled, ModernSignSlot, PrintHeader,
  PrintWatermark, MODERN_FONT, ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { firstWorkingSelect, omitKeys, warnOnce, withSchemaFallback } from "@/lib/dbCompat";
import { logAction } from "@/lib/logger";
import { VIN_FULL_LENGTH } from "@/lib/constants";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import {
  ALL_TIME, ALL_WEEKS, longDate, matchesPeriod, monthOptions, shortDate, WEEK_OPTIONS,
} from "@/lib/historyFilters";

const PAGE_KEY = "sales-agreement" as const;
const ENTITY = "Sales Agreement";

/**
 * The columns 20261112100000_sales_agreement_paper_form.sql adds. Until that
 * migration is applied the page still saves and still prints — it just leaves
 * these blanks empty rather than refusing the whole statement.
 */
const PAPER_COLUMNS = [
  "document_no", "seller_title", "buyer_title", "effective_date",
  "new_owner_details", "seller_sign_date", "buyer_sign_date",
  "seller_witness_date", "buyer_witness_date",
];

const PAPER_SELECT = PAPER_COLUMNS.join(", ");

const today = () => new Date().toISOString().split("T")[0];

/**
 * The seller on this agreement is the dealership: Manga Automobiles sells the
 * vehicle and the customer buys it, so the "This is to certify that I …" half
 * of the form is always the company's own details.
 *
 * Pre-filled rather than hard-coded. The office sometimes signs a car over on
 * an owner's behalf, and when it does the clerk types that owner in; the
 * "Use Manga Automobiles" button puts the company back.
 */
const COMPANY_SELLER = {
  sellerTitle: "",
  sellerName: `${COMPANY.name} ${COMPANY.nameSuffix}`,
  sellerAddress: COMPANY.addressLines.join(" ").replace(/,$/, ""),
  sellerPhone: COMPANY.tel,
  sellerIdType: "",
};

const EMPTY_FORM = {
  agreementDate: today(),
  /** The serial pre-printed on the leaf of the book this is written on. */
  documentNo: "",
  ...COMPANY_SELLER,
  buyerTitle: "",
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
  /** "...with effect from today's date ____" */
  effectiveDate: today(),
  /** "...change the ownership to new owners name and address:" */
  newOwnerDetails: "",
  sellerSignature: "",
  sellerSignDate: today(),
  sellerWitnessName: "",
  sellerWitnessSignature: "",
  sellerWitnessDate: "",
  buyerSignature: "",
  buyerSignDate: today(),
  buyerWitnessName: "",
  buyerWitnessSignature: "",
  buyerWitnessDate: "",
  repName: "",
  repSignature: "",
  repSignatureDate: today(),
};

export type SAForm = typeof EMPTY_FORM;

/** The blank form, exported for tests. */
export const BLANK_AGREEMENT: SAForm = EMPTY_FORM;

const rowToForm = (row: any): SAForm => ({
  agreementDate: row.agreement_date || "",
  documentNo: row.document_no || "",
  sellerTitle: row.seller_title || "",
  sellerName: row.seller_name || "",
  sellerAddress: row.seller_address || "",
  sellerPhone: row.seller_phone || "",
  sellerIdType: row.seller_id_type || "",
  buyerTitle: row.buyer_title || "",
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
  effectiveDate: row.effective_date || "",
  newOwnerDetails: row.new_owner_details || "",
  sellerSignature: row.seller_signature || "",
  sellerSignDate: row.seller_sign_date || "",
  sellerWitnessName: row.seller_witness_name || "",
  sellerWitnessSignature: row.seller_witness_signature || "",
  sellerWitnessDate: row.seller_witness_date || "",
  buyerSignature: row.buyer_signature || "",
  buyerSignDate: row.buyer_sign_date || "",
  buyerWitnessName: row.buyer_witness_name || "",
  buyerWitnessSignature: row.buyer_witness_signature || "",
  buyerWitnessDate: row.buyer_witness_date || "",
  repName: row.rep_name || "",
  repSignature: row.rep_signature || "",
  repSignatureDate: row.rep_signature_date || "",
});

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500 mb-3">{children}</p>
);

/** The banner on the printed book is red, unlike the navy letterhead strip. */
const BANNER_RED = "#e01f26";

/**
 * The body of the printed book is set in a serif face — only the letterhead and
 * the red banner are sans. Matching it is most of what makes the output read as
 * the same document rather than a re-typing of it.
 */
const PAPER_FONT = "'Times New Roman', Times, Georgia, serif";

const TITLES = ["Alh.", "Mall.", "Mr.", "Mrs.", "Miss", "Dr.", "Engr.", "Chief"];

/** "Mr." + "Musa Bello" → "Mr. Musa Bello", with neither half required. */
const withTitle = (title?: string | null, name?: string | null) =>
  [title, name].filter((part) => (part || "").trim()).join(" ").trim();

/**
 * The one description of the car that the paper form asks for twice — once as
 * "sold my vehicle", once as "the said vehicle". Composed from the structured
 * columns so history and search keep working on them.
 */
const vehicleDescription = (data: SAForm) =>
  [data.vehicleMake, data.vehicleYearModel, data.vehicleColor]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");

const naira = (value: string) => parseFloat((value || "0").replace(/,/g, "")) || 0;

// ─── The document ────────────────────────────────────────────────────────────
// A facsimile of the pre-printed MANGA AUTOMOBILES sales agreement book: the
// same sentences, in the same order, on the same ruled lines. Anything the
// office keeps on file but the paper does not carry (phone, ID, payment
// method, notes) is deliberately absent here.

/** A value sitting on a ruled line that runs to the right margin. */
const Fill = ({
  children,
  grow = 1,
}: {
  children?: React.ReactNode;
  grow?: number;
}) => (
  <span
    className="min-w-0 px-1 pb-[1px] text-[12px] font-semibold text-black break-words"
    style={{ borderBottom: RULE, flex: `${grow} 1 0%` }}
  >
    {children || " "}
  </span>
);

/** One printed sentence: its fixed wording, then the blank it is written on. */
const FormLine = ({
  label,
  value,
  grow,
}: {
  label: string;
  value?: React.ReactNode;
  grow?: number;
}) => (
  <div className="flex items-end gap-1.5">
    <span className="shrink-0 pb-[2px] text-[11.5px] leading-[1.3] text-black">{label}</span>
    <Fill grow={grow}>{value}</Fill>
  </div>
);

/** A labelled blank inside the signature block, e.g. "Witness Name: ______". */
const SignLine = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex items-end gap-1.5">
    <span className="shrink-0 pb-[2px] text-[10.5px] text-black">{label}</span>
    <span
      className="flex-1 min-w-0 px-1 pb-[1px] text-[10.5px] font-semibold text-black break-words"
      style={{ borderBottom: RULE }}
    >
      {value || " "}
    </span>
  </div>
);

/** A drawn signature resting on its line, as on the paper. */
const SignOnLine = ({
  signature,
  caption,
}: {
  signature?: string | null;
  caption: string;
}) => (
  <div>
    <div className="h-[46px] flex items-end justify-center pb-[2px]" style={{ borderBottom: RULE }}>
      {signature ? (
        <img src={signature} alt="" className="max-h-[42px] object-contain" style={{ filter: "brightness(0)" }} />
      ) : null}
    </div>
    <p className="text-center text-[11.5px] text-black mt-[3px]">{caption}</p>
  </div>
);

/** Exported so a test can assert the printed wording without a save. */
export function AgreementDocument({ data }: { data: SAForm }) {
  const price = naira(data.salePrice);
  const kobo = Math.round((price - Math.floor(price)) * 100);
  const seller = withTitle(data.sellerTitle, data.sellerName);
  const buyer = withTitle(data.buyerTitle, data.buyerName);
  const vehicle = vehicleDescription(data);

  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[20mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        {/* The serial is printed under the address, where the book puts it */}
        <PrintHeader docNumber={data.documentNo} />

        {/* The red banner sits at the left, on a rule that runs to the margin */}
        <div className="flex items-end gap-0 mb-[14px]">
          <div
            className="shrink-0 px-3 py-[3.5px] skew-x-[-10deg]"
            style={{ backgroundColor: BANNER_RED }}
          >
            <span className="inline-block skew-x-[10deg] text-[13.5px] font-black uppercase tracking-[0.04em] text-white">
              Vehicle Sales Agreement
            </span>
          </div>
          <span className="flex-1" style={{ borderBottom: RULE }} />
        </div>

        {/* ── The certificate ───────────────────────────────────────────── */}
        <div className="space-y-[13px]" style={{ fontFamily: PAPER_FONT }}>
          <FormLine label="This is to certify that I, Alh./Mall/Mr./Mrs." value={seller} grow={2} />
          <FormLine label="Of" value={data.sellerAddress} />
          <FormLine label="Here by agrees and sold my vehicle" value={vehicle} />
          <FormLine label="Registration No" value={data.vehiclePlateNumber} />
          <FormLine label="Engine No" value={data.vehicleEngineNumber} />
          <FormLine label="Chasis No" value={data.vehicleChassis} />
          <FormLine label="To" value={buyer} />
          <FormLine label="of" value={data.buyerAddress} />
          <FormLine label="For the sum of" value={price > 0 ? numberToWords(price) : ""} />

          <div className="flex items-end gap-1.5 text-[11px] text-black">
            <span className="shrink-0 pb-[2px]">(N</span>
            <span
              className="min-w-[90px] px-1 pb-[1px] text-center text-[11.5px] font-bold text-black"
              style={{ borderBottom: RULE }}
            >
              {price > 0 ? Math.floor(price).toLocaleString() : " "}
            </span>
            <span className="shrink-0 pb-[2px]">: K</span>
            <span
              className="min-w-[44px] px-1 pb-[1px] text-center text-[11.5px] font-bold text-black"
              style={{ borderBottom: RULE }}
            >
              {price > 0 ? String(kobo).padStart(2, "0") : " "}
            </span>
            <span className="shrink-0 pb-[2px]">
              ) He/She had fully paid the total amount with effect from
            </span>
          </div>

          <FormLine label="today's date" value={longDate(data.effectiveDate)} />
          <FormLine label="Alh/Mal/Mr/Mrs" value={buyer} />
          <FormLine label="Is now the rightful owner of the said vehicle" value={vehicle} />
        </div>

        <p className="text-[11.5px] text-black mt-[13px] mb-[5px]" style={{ fontFamily: PAPER_FONT }}>
          Please change the ownership of the vehicle to new owners name and address:
        </p>
        <p
          className="text-[11.5px] font-semibold text-black min-h-[16px] px-1 pb-[1px] whitespace-pre-wrap break-words"
          style={{ borderBottom: RULE }}
        >
          {data.newOwnerDetails || [buyer, data.buyerAddress].filter(Boolean).join(", ") || " "}
        </p>

        {/* ── Signatures ────────────────────────────────────────────────── */}
        <div
          className="grid grid-cols-2 gap-x-10 gap-y-[9px] mt-7"
          style={{ fontFamily: PAPER_FONT }}
        >
          <SignOnLine signature={data.sellerSignature} caption="Seller's Sign" />
          <SignOnLine signature={data.buyerSignature} caption="Buyer's sign" />

          <SignLine label="Date:" value={longDate(data.sellerSignDate)} />
          <SignLine label="Date:" value={longDate(data.buyerSignDate)} />

          <SignLine label="Witness Name:" value={data.sellerWitnessName} />
          <SignLine label="Witness Name:" value={data.buyerWitnessName} />

          <div className="flex items-end gap-1.5">
            <span className="shrink-0 pb-[2px] text-[10.5px] text-black">Signature:</span>
            <span className="flex-1 min-w-0 h-[26px] flex items-end justify-center pb-[1px]" style={{ borderBottom: RULE }}>
              {data.sellerWitnessSignature ? (
                <img src={data.sellerWitnessSignature} alt="" className="max-h-[24px] object-contain" style={{ filter: "brightness(0)" }} />
              ) : null}
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="shrink-0 pb-[2px] text-[10.5px] text-black">Signature:</span>
            <span className="flex-1 min-w-0 h-[26px] flex items-end justify-center pb-[1px]" style={{ borderBottom: RULE }}>
              {data.buyerWitnessSignature ? (
                <img src={data.buyerWitnessSignature} alt="" className="max-h-[24px] object-contain" style={{ filter: "brightness(0)" }} />
              ) : null}
            </span>
          </div>

          <SignLine label="Date:" value={longDate(data.sellerWitnessDate)} />
          <SignLine label="Date:" value={longDate(data.buyerWitnessDate)} />
        </div>

        {/* ── The office's own signature and stamp ──────────────────────── */}
        <div className="mt-8 flex justify-center" style={{ fontFamily: PAPER_FONT }}>
          <div className="w-[78%]">
            <div className="h-[48px] flex items-end justify-center pb-[2px]" style={{ borderBottom: RULE }}>
              {data.repSignature ? (
                <img src={data.repSignature} alt="" className="max-h-[44px] object-contain" style={{ filter: "brightness(0)" }} />
              ) : null}
            </div>
            <p className="text-center text-[10.5px] text-black mt-[3px]">
              (Signature and Stamp of Authorised representative of the{" "}
              <span className="font-bold">Manga Automobile</span>)
            </p>
            {data.repName ? (
              <p className="text-center text-[10px] font-semibold text-black mt-[2px]">{data.repName}</p>
            ) : null}
          </div>
        </div>
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
      const BASE = "id, created_at, agreement_date, seller_name, seller_address, seller_phone, seller_id_type, buyer_name, buyer_address, buyer_phone, buyer_id_type, vehicle_make, vehicle_year_model, vehicle_color, vehicle_engine_number, vehicle_chassis, vehicle_plate_number, sale_price, payment_method, note, seller_witness_name, buyer_witness_name, rep_name, rep_signature_date";

      // Newest shape first; the last attempt asks for nothing new, so it always
      // works on a database that is a migration behind.
      return await firstWorkingSelect<any[]>(
        [
          () => supabase.from("sales_agreements")
            .select(`${BASE}, ${PAPER_SELECT}`)
            .order("created_at", { ascending: false }),
          () => supabase.from("sales_agreements")
            .select(BASE)
            .order("created_at", { ascending: false }),
        ],
        PAPER_COLUMNS,
        () => warnOnce("sa-paper-columns", () =>
          console.warn("[Sales Agreement] paper-form columns are missing; run 20261112100000_sales_agreement_paper_form.sql")
        )
      );
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
        document_no: form.documentNo.trim() || null,
        seller_title: form.sellerTitle.trim() || null,
        seller_name: form.sellerName.trim(),
        seller_address: form.sellerAddress.trim() || null,
        seller_phone: form.sellerPhone.trim() || null,
        seller_id_type: form.sellerIdType.trim() || null,
        buyer_title: form.buyerTitle.trim() || null,
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
        effective_date: form.effectiveDate || null,
        new_owner_details: form.newOwnerDetails.trim() || null,
        seller_signature: form.sellerSignature || null,
        seller_sign_date: form.sellerSignDate || null,
        seller_witness_name: form.sellerWitnessName.trim() || null,
        seller_witness_signature: form.sellerWitnessSignature || null,
        seller_witness_date: form.sellerWitnessDate || null,
        buyer_signature: form.buyerSignature || null,
        buyer_sign_date: form.buyerSignDate || null,
        buyer_witness_name: form.buyerWitnessName.trim() || null,
        buyer_witness_signature: form.buyerWitnessSignature || null,
        buyer_witness_date: form.buyerWitnessDate || null,
        rep_name: form.repName.trim() || null,
        rep_signature: form.repSignature || null,
        rep_signature_date: form.repSignatureDate || null,
        created_by: user?.id ?? null,
      };

      const onMissing = () =>
        warnOnce("sa-paper-write", () =>
          toast.warning("Saved, but the new form fields need the latest migration")
        );

      if (editingId) {
        await withSchemaFallback(
          () => supabase.from("sales_agreements").update(payload).eq("id", editingId).select("id"),
          () => supabase.from("sales_agreements")
            .update(omitKeys(payload, PAPER_COLUMNS)).eq("id", editingId).select("id"),
          PAPER_COLUMNS,
          onMissing
        );
        await logAction("UPDATE", ENTITY, editingId);
        return { id: editingId, document_no: form.documentNo || null };
      }

      const inserted = await withSchemaFallback<{ id: string; document_no?: string | null }>(
        () => supabase.from("sales_agreements").insert(payload)
          .select("id, document_no").single(),
        () => supabase.from("sales_agreements")
          .insert(omitKeys(payload, PAPER_COLUMNS)).select("id").single(),
        PAPER_COLUMNS,
        onMissing
      );
      await logAction("CREATE", ENTITY, inserted.id);
      return inserted;
    },
    onSuccess: ({ id, document_no }) => {
      // Left blank, the serial is assigned by the database; typed in, it is the
      // number pre-printed in the physical book and comes straight back.
      const saved = { ...form, documentNo: document_no || form.documentNo };
      setEditingId(id);
      setPreviewId(id);
      setForm(saved);
      setPreviewData(saved);
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
        (r.document_no || "").toLowerCase().includes(q) ||
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

  /** True while the seller side still holds the dealership's own details. */
  const isCompanySeller =
    form.sellerName.trim() === COMPANY_SELLER.sellerName &&
    form.sellerAddress.trim() === COMPANY_SELLER.sellerAddress;

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
        <PrintSheet ref={documentRef}>
          <AgreementDocument data={previewData} />
        </PrintSheet>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="documentNo" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Document No
                    </Label>
                    <Input id="documentNo" name="documentNo" value={form.documentNo}
                      onChange={handleChange} placeholder="e.g. 1003"
                      className="rounded-xl h-11 bg-background/50 border-white/10 font-bold" />
                    <p className="text-[11px] text-muted-foreground">
                      The serial printed on the leaf of the book. Leave it blank and
                      one is assigned on save.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agreementDate" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Agreement Date
                    </Label>
                    <Input id="agreementDate" type="date" name="agreementDate" value={form.agreementDate}
                      onChange={handleChange}
                      className="rounded-xl h-11 bg-background/50 border-white/10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effectiveDate" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Paid In Full From
                    </Label>
                    <Input id="effectiveDate" type="date" name="effectiveDate" value={form.effectiveDate}
                      onChange={handleChange}
                      className="rounded-xl h-11 bg-background/50 border-white/10" />
                    <p className="text-[11px] text-muted-foreground">
                      Prints as “with effect from today's date”.
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground -mt-4">
                  Phone, ID, payment method and notes are kept on file for your records —
                  the printed form carries only what is on the paper agreement.
                </p>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-500">
                      Seller's Information — Manga Automobiles
                    </p>
                    {!isCompanySeller && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setForm((prev) => ({ ...prev, ...COMPANY_SELLER }))}
                        className="h-7 rounded-lg text-xs text-emerald-500 hover:bg-emerald-500/10"
                      >
                        Use Manga Automobiles
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1 mb-3">
                    The dealership is the seller, so this side is filled in with the company's
                    own details. Change it only when the office is signing a car over on an
                    owner's behalf.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid grid-cols-[110px_1fr] gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Title</Label>
                        <Select
                          value={form.sellerTitle}
                          onValueChange={(v) => setForm((prev) => ({ ...prev, sellerTitle: v }))}
                        >
                          <SelectTrigger aria-label="Seller title" className="rounded-xl h-11 bg-background/50 border-white/10">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="glass-panel border-white/10 rounded-xl">
                            {TITLES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sellerName" className="text-xs text-muted-foreground">Full name *</Label>
                        <Input id="sellerName" name="sellerName" value={form.sellerName} onChange={handleChange}
                          className="rounded-xl h-11 bg-background/50 border-white/10" />
                      </div>
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
                      <Label className="text-xs text-muted-foreground">RC / ID number</Label>
                      <Input name="sellerIdType" value={form.sellerIdType} onChange={handleChange}
                        placeholder="Company RC no, or the owner's ID"
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
                    <div className="grid grid-cols-[110px_1fr] gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Title</Label>
                        <Select
                          value={form.buyerTitle}
                          onValueChange={(v) => setForm((prev) => ({ ...prev, buyerTitle: v }))}
                        >
                          <SelectTrigger aria-label="Buyer title" className="rounded-xl h-11 bg-background/50 border-white/10">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="glass-panel border-white/10 rounded-xl">
                            {TITLES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="buyerName" className="text-xs text-muted-foreground">Full name *</Label>
                        <Input id="buyerName" name="buyerName" value={form.buyerName} onChange={handleChange}
                          className="rounded-xl h-11 bg-background/50 border-white/10" />
                      </div>
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${form.vehicleChassis.length === VIN_FULL_LENGTH ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-500"}`}>
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
                              .toUpperCase()
                              .replace(/\s+/g, "")
                              .slice(0, VIN_FULL_LENGTH),
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
                      <Label htmlFor="newOwnerDetails" className="text-xs text-muted-foreground">
                        New owner's name &amp; address (for the change of ownership)
                      </Label>
                      <Textarea id="newOwnerDetails" name="newOwnerDetails" value={form.newOwnerDetails}
                        onChange={handleChange}
                        placeholder="Leave blank to use the buyer's name and address"
                        className="rounded-xl min-h-[70px] bg-background/50 border-white/10" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="note" className="text-xs text-muted-foreground">
                        Note — kept on file, not printed (optional)
                      </Label>
                      <Textarea id="note" name="note" value={form.note} onChange={handleChange}
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
                        <SignaturePad
                          label="Seller" value={form.sellerSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, sellerSignature: v }))} />
                      </div>
                      <Input type="date" aria-label="Seller signature date" name="sellerSignDate"
                        value={form.sellerSignDate} onChange={handleChange}
                        className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Buyer</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Buyer" value={form.buyerSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, buyerSignature: v }))} />
                      </div>
                      <Input type="date" aria-label="Buyer signature date" name="buyerSignDate"
                        value={form.buyerSignDate} onChange={handleChange}
                        className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Seller's witness</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Seller's witness" value={form.sellerWitnessSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, sellerWitnessSignature: v }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input name="sellerWitnessName" value={form.sellerWitnessName} onChange={handleChange}
                          placeholder="Witness full name"
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                        <Input type="date" aria-label="Seller's witness date" name="sellerWitnessDate"
                          value={form.sellerWitnessDate} onChange={handleChange}
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Buyer's witness</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50">
                        <SignaturePad
                          label="Buyer's witness" value={form.buyerWitnessSignature}
                          onChange={(v) => setForm((prev) => ({ ...prev, buyerWitnessSignature: v }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input name="buyerWitnessName" value={form.buyerWitnessName} onChange={handleChange}
                          placeholder="Witness full name"
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                        <Input type="date" aria-label="Buyer's witness date" name="buyerWitnessDate"
                          value={form.buyerWitnessDate} onChange={handleChange}
                          className="rounded-xl h-10 bg-background/50 border-white/10 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Company representative</Label>
                      <div className="rounded-2xl overflow-hidden border border-white/10 bg-background/50 md:w-1/2">
                        <SignaturePad
                          label="Company representative" value={form.repSignature}
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
                placeholder="Search document no, seller, buyer, vehicle or chassis..."
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
                      {r.document_no ? (
                        <p className="text-[10px] font-bold text-muted-foreground mb-0.5">
                          No. {r.document_no}
                        </p>
                      ) : null}
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
                  <RecordActions
                    menuLabel={`More actions for document ${r.document_no || r.seller_name}`}
                    primary={[
                      { label: "Preview", icon: Eye, onClick: () => openPreview(r) },
                      { label: "Edit", icon: Pencil, onClick: () => openEdit(r), show: mayEdit },
                    ]}
                    menu={[
                      {
                        label: "Delete document", icon: Trash2,
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
                          <RecordActions
                            inline
                            menuLabel={`More actions for document ${r.document_no || r.seller_name}`}
                            primary={[
                              { label: "Preview", icon: Eye, onClick: () => openPreview(r) },
                            ]}
                            menu={[
                              { label: "Edit document", icon: Pencil, onClick: () => openEdit(r), show: mayEdit },
                              {
                                label: "Delete document", icon: Trash2, destructive: true,
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
