import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { CustomPagination } from "@/components/CustomPagination";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CurrencyInput } from "@/components/CurrencyInput";
import { SignaturePad } from "@/components/SignaturePad";
import {
  Printer, FileText, CheckCircle2, History, Search, ArrowLeft, Trash2,
  PlusCircle, Users, Pencil, Download, ChevronRight, ChevronLeft,
  Building2, ClipboardList, Stamp, Info, Clock, XCircle, MapPin,
} from "lucide-react";
import { downloadAsPNG, downloadAsPDF, triggerPrint } from "@/lib/exportHelpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PrintHeader, PrintWatermark, getPrintHeaderHTML, getPrintWatermarkHTML } from "@/components/PrintHeader";
import { PrintFooter, getPrintFooterHTML } from "@/components/PrintFooter";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type PropertyIntake = {
  id: string;
  created_at: string;
  form_number: string | null;
  form_date: string | null;
  full_name: string;
  phone_number: string | null;
  residential_address: string | null;
  property_type: string | null;
  property_type_other: string | null;
  property_location: string | null;
  ownership_documents: string[] | null;
  ownership_document_other: string | null;
  property_specifications: string | null;
  property_size: string | null;
  plot_number: string | null;
  price: number | null;
  owner_relationship: string | null;
  owner_relationship_other: string | null;
  advert_placement: string[] | null;
  inspected: string | null;
  inspection_date: string | null;
  inspection_time: string | null;
  officer_assigned: string | null;
  payment_status: string | null;
  amount_paid: number | null;
  receipt_number: string | null;
  condition_remarks: string | null;
  decision: string | null;
  decline_reason: string | null;
  manager_comments: string | null;
  approved_by_name: string | null;
  approved_by_signature: string | null;
  approved_date: string | null;
  agreement: string | null;
  sign_one: string | null;
  sign_two: string | null;
  created_by: string | null;
};

// ── Option lists (mirror the printed form) ──────────────────────────────────
const PROPERTY_TYPES = [
  { value: "land", label: "Land" },
  { value: "house", label: "House" },
  { value: "shop", label: "Shop" },
  { value: "office", label: "Office" },
  { value: "other", label: "Other" },
];

const OWNERSHIP_DOCS = [
  { value: "c_of_o", label: "Certificate Of Occupancy (C of O)" },
  { value: "r_of_o", label: "Right of Occupancy (R of O)" },
  { value: "deed", label: "Deed Of Assignment" },
  { value: "allocation", label: "Letter Of Allocation" },
  { value: "survey", label: "Survey Plan" },
  { value: "other", label: "Other" },
];

const RELATIONSHIPS = [
  { value: "owner", label: "Owner" },
  { value: "family_rep", label: "Family Representative" },
  { value: "agent", label: "Agent" },
  { value: "attorney", label: "Attorney" },
  { value: "other", label: "Other" },
];

const ADVERT_PLACEMENTS = [
  { value: "handling", label: "Handling Property" },
  { value: "online", label: "Online Advert" },
  { value: "video", label: "Advert Video" },
  { value: "website", label: "Website" },
];

const EMPTY_FORM = {
  formDate: new Date().toISOString().split("T")[0],
  fullName: "",
  phoneNumber: "",
  residentialAddress: "",
  propertyType: "",
  propertyTypeOther: "",
  propertyLocation: "",
  ownershipDocuments: [] as string[],
  ownershipDocumentOther: "",
  propertySpecifications: "",
  propertySize: "",
  plotNumber: "",
  price: "",
  ownerRelationship: "",
  ownerRelationshipOther: "",
  advertPlacement: [] as string[],
  inspected: "",
  inspectionDate: "",
  inspectionTime: "",
  officerAssigned: "",
  paymentStatus: "",
  amountPaid: "",
  receiptNumber: "",
  conditionRemarks: "",
  decision: "",
  declineReason: "",
  managerComments: "",
  approvedByName: "",
  approvedDate: new Date().toISOString().split("T")[0],
  agreement: "",
};

type FormState = typeof EMPTY_FORM;

const labelFor = (options: { value: string; label: string }[], value: string | null) =>
  options.find((o) => o.value === value)?.label ?? "";

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

const formatNaira = (value: string | number | null | undefined) =>
  value === "" || value === null || value === undefined ? "" : `₦${Number(value).toLocaleString()}`;

export default function PropertyIntake() {
  const [activeTab, setActiveTab] = useState("create");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [currentStep, setCurrentStep] = useState(1);
  const documentRef = useRef<HTMLDivElement>(null);
  const { user, role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, "property-intake", permissions);
  const hasEdit = canEdit(role, "property-intake", permissions);
  const hasDelete = canDelete(role, "property-intake", permissions);

  const [editingId, setEditingId] = useState<string | null>(null);
  // The paper form is long, so it is mirrored into localStorage as it is filled:
  // an accidental tab close picks up exactly where it left off.
  const [formData, setFormData, clearFormDraft] = useFormPersistence<FormState>(
    "manga_property_intake_draft", EMPTY_FORM, !!editingId, editingId
  );
  const [sigs, setSigs, clearSigDraft] = useFormPersistence(
    "manga_property_intake_sigs", { approver: "", one: "", two: "" }, !!editingId, editingId
  );
  const approverSignature = sigs.approver;
  const signOne = sigs.one;
  const signTwo = sigs.two;
  const setApproverSignature = (v: string) => setSigs((prev) => ({ ...prev, approver: v }));
  const setSignOne = (v: string) => setSigs((prev) => ({ ...prev, one: v }));
  const setSignTwo = (v: string) => setSigs((prev) => ({ ...prev, two: v }));
  const [formNumber, setFormNumber] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const queryClient = useQueryClient();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const setField = (name: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /** Adds or removes a value from one of the multi-select checkbox groups. */
  const toggleInList = (name: "ownershipDocuments" | "advertPlacement", value: string) => {
    setFormData((prev) => {
      const list = prev[name];
      return {
        ...prev,
        [name]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  };

  // ── Print / export template ───────────────────────────────────────────────
  const box = (checked: boolean) => (checked ? "☑" : "☐");

  const optionLineHTML = (
    options: { value: string; label: string }[],
    selected: string[],
    otherText?: string,
  ) =>
    options
      .map((o) => {
        const isOn = selected.includes(o.value);
        const suffix = o.value === "other" && isOn && otherText ? `: ${otherText}` : "";
        return `<div class="opt">${box(isOn)} ${o.label}${suffix}</div>`;
      })
      .join("");

  const getIntakeHTML = (data: FormState, approverSig: string, sig1: string, sig2: string, number: string | null) => {
    return `<html><head><meta charset="utf-8" /><title>Property Intake - ${data.fullName}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.5; }
      .title { text-align: center; margin: 24px 0 18px; font-size: 19px; font-weight: 800; text-transform: uppercase; text-decoration: underline; letter-spacing: 1px; }
      .meta { display: flex; gap: 40px; font-size: 14px; font-weight: 700; margin-bottom: 20px; }
      .section { margin-bottom: 22px; page-break-inside: avoid; }
      .section-title { font-weight: 800; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 5px; letter-spacing: 0.5px; }
      .field { display: flex; border-bottom: 1px solid #f0f0f0; padding: 6px 0; font-size: 13px; }
      .label { font-weight: 700; width: 240px; color: #555; }
      .value { flex: 1; font-weight: 600; }
      .opts { display: flex; flex-wrap: wrap; gap: 6px 22px; padding: 6px 0 8px; }
      .opt { font-size: 13px; font-weight: 600; }
      .stack .opt { width: 100%; }
      .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
      .sig-box { border-bottom: 1px solid #333; height: 70px; display: flex; align-items: flex-end; margin-bottom: 8px; }
      .sig-img { max-height: 62px; object-fit: contain; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    ${getPrintWatermarkHTML()}
    ${getPrintHeaderHTML()}
    <div class="title">Property Intake &amp; Inspection Form</div>
    <div class="meta">
      <span>Form No.: ${number || "________"}</span>
      <span>Date: ${formatDate(data.formDate) || "________"}</span>
    </div>

    <div class="section">
      <div class="section-title">Information</div>
      <div class="field"><span class="label">1. Full Name:</span> <span class="value">${data.fullName}</span></div>
      <div class="field"><span class="label">2. Phone Number:</span> <span class="value">${data.phoneNumber}</span></div>
      <div class="field"><span class="label">3. Residential Address:</span> <span class="value">${data.residentialAddress}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Property Information</div>
      <div class="field"><span class="label">4. Property Type:</span></div>
      <div class="opts">${optionLineHTML(PROPERTY_TYPES, data.propertyType ? [data.propertyType] : [], data.propertyTypeOther)}</div>
      <div class="field"><span class="label">5. Property Location/Address:</span> <span class="value">${data.propertyLocation}</span></div>
      <div class="field"><span class="label">6. Ownership Documents Sighted:</span></div>
      <div class="opts stack">${optionLineHTML(OWNERSHIP_DOCS, data.ownershipDocuments, data.ownershipDocumentOther)}</div>
      <div class="field"><span class="label">7. Property Specifications:</span> <span class="value">${data.propertySpecifications}</span></div>
      <div class="field"><span class="label">8. Land/Property Size:</span> <span class="value">${data.propertySize}</span></div>
      <div class="field"><span class="label">9. Plot Number:</span> <span class="value">${data.plotNumber}</span></div>
      <div class="field"><span class="label">10. Price (₦):</span> <span class="value">${formatNaira(data.price)}</span></div>
      <div class="field"><span class="label">11. Relationship with Property Owner:</span></div>
      <div class="opts stack">${optionLineHTML(RELATIONSHIPS, data.ownerRelationship ? [data.ownerRelationship] : [], data.ownerRelationshipOther)}</div>
      <div class="field"><span class="label">12. Advert Placement:</span></div>
      <div class="opts stack">${optionLineHTML(ADVERT_PLACEMENTS, data.advertPlacement)}</div>
    </div>

    <div class="section">
      <div class="section-title">Company Use</div>
      <div class="field"><span class="label">1. Property/Land Inspected?</span>
        <span class="value">${box(data.inspected === "yes")} Yes &nbsp;&nbsp; ${box(data.inspected === "no")} No</span>
      </div>
      <div class="field"><span class="label">2. Appointment Date for Inspection:</span> <span class="value">${formatDate(data.inspectionDate)}</span></div>
      <div class="field"><span class="label">Time:</span> <span class="value">${data.inspectionTime}</span></div>
      <div class="field"><span class="label">Officer Assigned:</span> <span class="value">${data.officerAssigned}</span></div>
      <div class="field"><span class="label">3. Payment Status:</span>
        <span class="value">${box(data.paymentStatus === "paid")} Paid &nbsp;&nbsp; ${box(data.paymentStatus === "pending")} Pending</span>
      </div>
      <div class="field"><span class="label">Amount Paid:</span> <span class="value">${formatNaira(data.amountPaid)}</span></div>
      <div class="field"><span class="label">Receipt No.:</span> <span class="value">${data.receiptNumber}</span></div>
      <div class="field"><span class="label">4. Condition/Remarks:</span> <span class="value">${data.conditionRemarks}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Official Use Only</div>
      <div class="field"><span class="label">1. Property Accepted by Company?</span>
        <span class="value">${box(data.decision === "approved")} Approved &nbsp;&nbsp; ${box(data.decision === "declined")} Declined</span>
      </div>
      <div class="field"><span class="label">2. Reason (if declined):</span> <span class="value">${data.declineReason}</span></div>
      <div class="field"><span class="label">3. Manager's Comments:</span> <span class="value">${data.managerComments}</span></div>
      <div class="field"><span class="label">4. Approved By (C.E.O/Manager):</span> <span class="value">${data.approvedByName}</span></div>
      <div class="field"><span class="label">Date:</span> <span class="value">${formatDate(data.approvedDate)}</span></div>
      <div class="field" style="border:none; padding-top:10px;"><span class="label">Agreement:</span> <span class="value">${data.agreement}</span></div>
    </div>

    <div class="signature-area">
      <div>
        <div class="sig-box">${approverSig ? `<img src="${approverSig}" class="sig-img" />` : ""}</div>
        <div style="font-size: 12px; font-weight: 700;">Approved By (C.E.O/Manager)</div>
        <div style="font-size: 12px;">Name: ${data.approvedByName}</div>
      </div>
      <div></div>
      <div>
        <div class="sig-box">${sig1 ? `<img src="${sig1}" class="sig-img" />` : ""}</div>
        <div style="font-size: 12px; font-weight: 700;">Sign:</div>
      </div>
      <div>
        <div class="sig-box">${sig2 ? `<img src="${sig2}" class="sig-img" />` : ""}</div>
        <div style="font-size: 12px; font-weight: 700;">Sign:</div>
      </div>
    </div>

    ${getPrintFooterHTML()}
    </body></html>`;
  };

  const handlePrint = () => {
    triggerPrint(getIntakeHTML(formData, approverSignature, signOne, signTwo, formNumber));
  };

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["property-intakes"],
    queryFn: async () => {
      // The three signature columns hold base64 PNGs and are not shown in the
      // list, so they are fetched when a form is opened or edited instead.
      const { data, error } = await supabase
        .from("property_intakes")
        .select(
          "id, created_at, form_number, form_date, full_name, phone_number, residential_address, " +
          "property_type, property_type_other, property_location, property_size, plot_number, " +
          "price, owner_relationship, payment_status, amount_paid, receipt_number, decision, " +
          "approved_by_name, approved_date"
        )
        .order("form_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PropertyIntake[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: TablesInsert<"property_intakes">) => {
      const { data, error } = await supabase
        .from("property_intakes")
        .upsert([payload])
        .select()
        .single();
      if (error) throw error;
      return data as PropertyIntake;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["property-intakes"] });
      setEditingId(data.id);
      setFormNumber(data.form_number);
      clearFormDraft();
      clearSigDraft();
      toast.success(`Form ${data.form_number ?? ""} saved`);
    },
    onError: (e: Error & { details?: string }) => {
      console.error("Property Intake Save Error:", e);
      toast.error(`Failed to save: ${e.message || e.details || JSON.stringify(e)}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_intakes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-intakes"] });
      toast.success("Record deleted");
    },
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        item.full_name?.toLowerCase().includes(q) ||
        item.property_location?.toLowerCase().includes(q) ||
        item.plot_number?.toLowerCase().includes(q) ||
        item.form_number?.toLowerCase().includes(q);
      const matchesDate = !dateFilter || item.form_date === dateFilter;
      return matchesSearch && matchesDate;
    });
  }, [history, search, dateFilter]);

  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const pagedHistory = filteredHistory.slice(
    safeHistoryPage * historyPageSize,
    (safeHistoryPage + 1) * historyPageSize
  );

  const stats = useMemo(() => {
    const total = history.length;
    const approved = history.filter((i) => i.decision === "approved").length;
    const awaitingInspection = history.filter((i) => i.inspected !== "yes").length;
    return { total, approved, awaitingInspection };
  }, [history]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.fullName.trim()) {
      toast.warning("Please enter the applicant's full name before saving.");
      return;
    }
    const payload = {
      ...(editingId ? { id: editingId } : {}),
      form_date: formData.formDate || new Date().toISOString().split("T")[0],
      full_name: formData.fullName,
      phone_number: formData.phoneNumber,
      residential_address: formData.residentialAddress,
      property_type: formData.propertyType || null,
      property_type_other: formData.propertyTypeOther,
      property_location: formData.propertyLocation,
      ownership_documents: formData.ownershipDocuments,
      ownership_document_other: formData.ownershipDocumentOther,
      property_specifications: formData.propertySpecifications,
      property_size: formData.propertySize,
      plot_number: formData.plotNumber,
      price: formData.price === "" ? null : Number(formData.price),
      owner_relationship: formData.ownerRelationship || null,
      owner_relationship_other: formData.ownerRelationshipOther,
      advert_placement: formData.advertPlacement,
      inspected: formData.inspected || null,
      inspection_date: formData.inspectionDate || null,
      inspection_time: formData.inspectionTime,
      officer_assigned: formData.officerAssigned,
      payment_status: formData.paymentStatus || null,
      amount_paid: formData.amountPaid === "" ? null : Number(formData.amountPaid),
      receipt_number: formData.receiptNumber,
      condition_remarks: formData.conditionRemarks,
      decision: formData.decision || null,
      decline_reason: formData.declineReason,
      manager_comments: formData.managerComments,
      approved_by_name: formData.approvedByName,
      approved_by_signature: approverSignature,
      approved_date: formData.approvedDate || null,
      agreement: formData.agreement,
      sign_one: signOne,
      sign_two: signTwo,
      created_by: user?.id,
    };

    try {
      await saveMutation.mutateAsync(payload);
      setMode("preview");
    } catch (e) {
      // Error surfaced by the mutation
    }
  };

  const loadItem = (item: PropertyIntake) => {
    setFormData({
      formDate: item.form_date || new Date().toISOString().split("T")[0],
      fullName: item.full_name || "",
      phoneNumber: item.phone_number || "",
      residentialAddress: item.residential_address || "",
      propertyType: item.property_type || "",
      propertyTypeOther: item.property_type_other || "",
      propertyLocation: item.property_location || "",
      ownershipDocuments: item.ownership_documents || [],
      ownershipDocumentOther: item.ownership_document_other || "",
      propertySpecifications: item.property_specifications || "",
      propertySize: item.property_size || "",
      plotNumber: item.plot_number || "",
      price: item.price === null || item.price === undefined ? "" : String(item.price),
      ownerRelationship: item.owner_relationship || "",
      ownerRelationshipOther: item.owner_relationship_other || "",
      advertPlacement: item.advert_placement || [],
      inspected: item.inspected || "",
      inspectionDate: item.inspection_date || "",
      inspectionTime: item.inspection_time || "",
      officerAssigned: item.officer_assigned || "",
      paymentStatus: item.payment_status || "",
      amountPaid: item.amount_paid === null || item.amount_paid === undefined ? "" : String(item.amount_paid),
      receiptNumber: item.receipt_number || "",
      conditionRemarks: item.condition_remarks || "",
      decision: item.decision || "",
      declineReason: item.decline_reason || "",
      managerComments: item.manager_comments || "",
      approvedByName: item.approved_by_name || "",
      approvedDate: item.approved_date || new Date().toISOString().split("T")[0],
      agreement: item.agreement || "",
    });
    setApproverSignature(item.approved_by_signature || "");
    setSignOne(item.sign_one || "");
    setSignTwo(item.sign_two || "");
    setEditingId(item.id);
    setFormNumber(item.form_number);
  };

  /** The whole record, signatures and all — needed to view or edit the form. */
  const fetchFullItem = async (item: PropertyIntake) => {
    const { data } = await supabase
      .from("property_intakes")
      .select("*")
      .eq("id", item.id)
      .maybeSingle();
    return (data ? { ...item, ...data } : item) as PropertyIntake;
  };

  const viewHistoryItem = async (item: PropertyIntake) => {
    loadItem(await fetchFullItem(item));
    setMode("preview");
  };

  const handleEdit = async (item: PropertyIntake) => {
    loadItem(await fetchFullItem(item));
    setMode("edit");
    setCurrentStep(1);
    setActiveTab("create");
  };

  const clearForm = () => {
    clearFormDraft();
    clearSigDraft();
    setFormData(EMPTY_FORM);
    setApproverSignature("");
    setSignOne("");
    setSignTwo("");
    setEditingId(null);
    setFormNumber(null);
    setCurrentStep(1);
  };

  // ── Helper Components ─────────────────────────────────────────────────────
  const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 py-2 sm:py-1 border-b border-gray-200">
      <span className="font-bold text-[13px] sm:text-sm text-gray-800 shrink-0">{label}:</span>
      <span className="flex-1 text-[13px] sm:text-sm text-gray-900 font-medium break-words leading-relaxed">
        {value || <span className="text-transparent select-none">{"_".repeat(15)}</span>}
      </span>
    </div>
  );

  const OptionList = ({
    label,
    options,
    selected,
    otherText,
    inline,
  }: {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    otherText?: string;
    inline?: boolean;
  }) => (
    <div className="py-1 border-b border-gray-200">
      <span className="font-bold text-[13px] sm:text-sm text-gray-800">{label}:</span>
      <div className={cn("mt-1", inline ? "flex flex-wrap gap-x-6 gap-y-1" : "space-y-0.5")}>
        {options.map((o) => {
          const isOn = selected.includes(o.value);
          return (
            <div key={o.value} className="text-[13px] text-gray-900 font-medium">
              <span className="mr-1.5">{isOn ? "☑" : "☐"}</span>
              {o.label}
              {o.value === "other" && isOn && otherText ? `: ${otherText}` : ""}
            </div>
          );
        })}
      </div>
    </div>
  );

  const DocumentPreview = () => (
    <div className="w-full bg-white text-black p-6 sm:p-10 shadow-2xl rounded-2xl border border-border/5 overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-5 print:hidden">
        <Building2 className="w-40 h-40" />
      </div>
      <PrintWatermark />
      <PrintHeader />
      <div className="text-center my-6">
        <h1 className="text-xl font-black text-black uppercase tracking-widest underline underline-offset-4">
          Property Intake &amp; Inspection Form
        </h1>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-1 mb-6 border-b border-gray-300 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-sm">Form No.:</span>
          <span className="text-sm font-black tracking-widest">{formNumber || "————"}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-sm">Date:</span>
          <span className="text-sm font-medium">{formatDate(formData.formDate)}</span>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="font-black text-sm uppercase tracking-wide mb-1 flex items-center gap-2"><Users className="w-3 h-3" /> Information</h2>
        <div className="space-y-1">
          <Field label="1. Full Name" value={formData.fullName} />
          <Field label="2. Phone Number" value={formData.phoneNumber} />
          <Field label="3. Residential Address" value={formData.residentialAddress} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-black text-sm uppercase tracking-wide mb-1 flex items-center gap-2"><Building2 className="w-3 h-3" /> Property Information</h2>
        <div className="space-y-1">
          <OptionList
            label="4. Property Type"
            options={PROPERTY_TYPES}
            selected={formData.propertyType ? [formData.propertyType] : []}
            otherText={formData.propertyTypeOther}
            inline
          />
          <Field label="5. Property Location/Address" value={formData.propertyLocation} />
          <OptionList
            label="6. Ownership Documents Sighted"
            options={OWNERSHIP_DOCS}
            selected={formData.ownershipDocuments}
            otherText={formData.ownershipDocumentOther}
          />
          <Field label="7. Property Specifications" value={formData.propertySpecifications} />
          <Field label="8. Land/Property Size" value={formData.propertySize} />
          <Field label="9. Plot Number" value={formData.plotNumber} />
          <Field label="10. Price (₦)" value={formatNaira(formData.price)} />
          <OptionList
            label="11. Relationship with Property Owner"
            options={RELATIONSHIPS}
            selected={formData.ownerRelationship ? [formData.ownerRelationship] : []}
            otherText={formData.ownerRelationshipOther}
          />
          <OptionList label="12. Advert Placement" options={ADVERT_PLACEMENTS} selected={formData.advertPlacement} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-black text-sm uppercase tracking-wide mb-1 flex items-center gap-2"><ClipboardList className="w-3 h-3" /> Company Use</h2>
        <div className="space-y-1">
          <OptionList
            label="1. Property/Land Inspected?"
            options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
            selected={formData.inspected ? [formData.inspected] : []}
            inline
          />
          <Field label="2. Appointment Date for Inspection" value={formatDate(formData.inspectionDate)} />
          <Field label="Time" value={formData.inspectionTime} />
          <Field label="Officer Assigned" value={formData.officerAssigned} />
          <OptionList
            label="3. Payment Status"
            options={[{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }]}
            selected={formData.paymentStatus ? [formData.paymentStatus] : []}
            inline
          />
          <Field label="Amount Paid" value={formatNaira(formData.amountPaid)} />
          <Field label="Receipt No." value={formData.receiptNumber} />
          <Field label="4. Condition/Remarks" value={formData.conditionRemarks} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-black text-sm uppercase tracking-wide mb-1 flex items-center gap-2"><Stamp className="w-3 h-3" /> Official Use Only</h2>
        <div className="space-y-1">
          <OptionList
            label="1. Property Accepted by Company?"
            options={[{ value: "approved", label: "Approved" }, { value: "declined", label: "Declined" }]}
            selected={formData.decision ? [formData.decision] : []}
            inline
          />
          <Field label="2. Reason (if declined)" value={formData.declineReason} />
          <Field label="3. Manager's Comments" value={formData.managerComments} />
          <Field label="4. Approved By (C.E.O/Manager)" value={formData.approvedByName} />
          <Field label="Date" value={formatDate(formData.approvedDate)} />
        </div>
        <div className="mt-3">
          <span className="font-bold text-[13px] sm:text-sm text-gray-800">Agreement:</span>
          <p className="text-[13px] text-gray-800 italic border-b border-gray-300 pb-2 min-h-[30px] mt-1 whitespace-pre-wrap">
            {formData.agreement || "—"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-8">
        <div>
          <p className="text-[11px] font-bold text-gray-600 mb-1">Signature (C.E.O/Manager):</p>
          <div className="h-16 border-b border-gray-800 mb-1 flex items-end">
            {approverSignature && <img src={approverSignature} alt="Approver" className="max-h-14 object-contain" />}
          </div>
          <p className="text-[11px] font-medium truncate">{formData.approvedByName}</p>
        </div>
        <div />
        <div>
          <p className="text-[11px] font-bold text-gray-600 mb-1">Sign:</p>
          <div className="h-16 border-b border-gray-800 mb-1 flex items-end">
            {signOne && <img src={signOne} alt="Sign one" className="max-h-14 object-contain" />}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold text-gray-600 mb-1">Sign:</p>
          <div className="h-16 border-b border-gray-800 mb-1 flex items-end">
            {signTwo && <img src={signTwo} alt="Sign two" className="max-h-14 object-contain" />}
          </div>
        </div>
      </section>
      <PrintFooter />
    </div>
  );

  const inputClass = "h-12 bg-background/50 border-white/10 rounded-xl px-4";
  const labelClass = "text-xs font-bold uppercase tracking-wider text-muted-foreground px-1";

  // ══════════════════════════════════════════════════════════════
  //  PREVIEW MODE
  // ══════════════════════════════════════════════════════════════
  if (mode === "preview") {
    const fileSlug = `property_intake_${(formNumber || formData.fullName).toString().replace(/\s+/g, "_")}`;
    return (
      <div className="animate-fade-up max-w-5xl mx-auto pb-12 px-4 print:p-0 print:m-0">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <Button variant="ghost" onClick={() => setMode("edit")} className="rounded-xl gap-2 hover:bg-background/80">
            <ArrowLeft className="w-4 h-4" /> Back to Editor
          </Button>
          <div className="flex gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-xl gap-2 bg-teal-500 hover:bg-teal-600 text-white shadow-lg shadow-teal-500/20 font-semibold px-6">
                  <Download className="w-4 h-4" /> Export Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-xl glass-panel p-2 shadow-2xl border-white/10" align="end">
                <DropdownMenuItem
                  onClick={() => downloadAsPDF(getIntakeHTML(formData, approverSignature, signOne, signTwo, formNumber), fileSlug)}
                  className="rounded-lg cursor-pointer font-bold"
                >
                  <FileText className="mr-2 h-4 w-4 text-teal-500" /> Download PDF (Direct)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint} className="rounded-lg cursor-pointer text-muted-foreground mt-1 pt-2 border-t border-white/5">
                  <Printer className="mr-2 h-4 w-4" /> Print / Save PDF (Dialog)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => downloadAsPNG(getIntakeHTML(formData, approverSignature, signOne, signTwo, formNumber), fileSlug)}
                  className="rounded-lg cursor-pointer text-muted-foreground"
                >
                  <Download className="mr-2 h-4 w-4" /> Download as Image (PNG)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="max-w-4xl mx-auto" ref={documentRef}>
          <DocumentPreview />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  MAIN UI
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto pb-10 px-4 sm:px-6 animate-fade-up">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2 opacity-70">
            <div className="p-1.5 bg-teal-500/10 rounded-lg"><Building2 className="w-4 h-4 text-teal-500" /></div>
            <span className="text-xs font-bold uppercase tracking-widest text-teal-500">Property Management</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-black text-foreground tracking-tight">Property Intake</h1>
          <p className="text-muted-foreground mt-2 text-base max-w-lg">
            Capture every column of the Property Intake &amp; Inspection Form — from applicant details to management approval.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className="bg-card/40 border border-white/10 p-1 rounded-2xl w-full sm:w-fit grid grid-cols-2 sm:flex">
          <TabsTrigger value="create" className="rounded-xl px-2 sm:px-8 py-2.5 font-bold data-[state=active]:bg-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-teal-500/20 transition-all text-xs sm:text-sm">
            <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> {editingId ? "Edit" : "New"} Intake Form
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl px-2 sm:px-8 py-2.5 font-bold data-[state=active]:bg-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-teal-500/20 transition-all text-xs sm:text-sm">
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> Submitted Forms
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Column */}
            <div className="lg:col-span-7 space-y-6">
              <Card className="bento-card border-white/10 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 bg-foreground/5">
                  <div className="flex justify-between items-center mb-6">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        {currentStep === 1 && <><Users className="w-5 h-5 text-teal-500" /> Information</>}
                        {currentStep === 2 && <><Building2 className="w-5 h-5 text-teal-500" /> Property Information</>}
                        {currentStep === 3 && <><ClipboardList className="w-5 h-5 text-teal-500" /> Company Use</>}
                        {currentStep === 4 && <><Stamp className="w-5 h-5 text-teal-500" /> Official Use Only</>}
                      </h2>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        Step {currentStep} of 4 {formNumber && `· Form No. ${formNumber}`}
                      </p>
                    </div>
                    <div className="w-24">
                      <Progress value={(currentStep / 4) * 100} className="h-1.5 bg-teal-500/10" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((s) => (
                      <div
                        key={s}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-all duration-500",
                          currentStep >= s ? "bg-teal-500" : "bg-white/5"
                        )}
                      />
                    ))}
                  </div>
                </div>

                <CardContent className="p-8">
                  {/* Step 1: Information */}
                  {currentStep === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="space-y-2">
                        <Label className={labelClass}>Form Date</Label>
                        <Input name="formDate" type="date" value={formData.formDate} onChange={handleChange} className={inputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>1. Full Name</Label>
                        <Input name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Full Legal Name" className={inputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>2. Phone Number</Label>
                        <Input name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="e.g. 0803..." className={inputClass} />
                      </div>
                      <div className="space-y-2">
                        <Label className={labelClass}>3. Residential Address</Label>
                        <Textarea name="residentialAddress" value={formData.residentialAddress} onChange={handleChange} placeholder="Current residential address" className="bg-background/50 border-white/10 rounded-xl min-h-[80px]" />
                      </div>
                      <CustomerMatchHint
                        name={formData.fullName}
                        phone={formData.phoneNumber}
                        onPick={(c) => setFormData((prev) => ({
                          ...prev,
                          fullName: c.name ?? prev.fullName,
                          phoneNumber: c.phone ?? prev.phoneNumber,
                          residentialAddress: c.address ?? prev.residentialAddress,
                        }))}
                      />
                    </div>
                  )}

                  {/* Step 2: Property Information */}
                  {currentStep === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="space-y-3">
                        <Label className={labelClass}>4. Property Type</Label>
                        <RadioGroup
                          value={formData.propertyType}
                          onValueChange={(v) => setField("propertyType", v)}
                          className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                        >
                          {PROPERTY_TYPES.map((o) => (
                            <label key={o.value} htmlFor={`ptype-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-4 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <RadioGroupItem value={o.value} id={`ptype-${o.value}`} />
                              <span className="text-sm font-medium">{o.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                        {formData.propertyType === "other" && (
                          <Input name="propertyTypeOther" value={formData.propertyTypeOther} onChange={handleChange} placeholder="Specify other property type" className={inputClass} />
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className={labelClass}>5. Property Location / Address</Label>
                        <Textarea name="propertyLocation" value={formData.propertyLocation} onChange={handleChange} placeholder="Where the property is located" className="bg-background/50 border-white/10 rounded-xl min-h-[80px]" />
                      </div>

                      <div className="space-y-3">
                        <Label className={labelClass}>6. Ownership Documents Sighted</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {OWNERSHIP_DOCS.map((o) => (
                            <label key={o.value} htmlFor={`doc-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-4 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <Checkbox
                                id={`doc-${o.value}`}
                                checked={formData.ownershipDocuments.includes(o.value)}
                                onCheckedChange={() => toggleInList("ownershipDocuments", o.value)}
                              />
                              <span className="text-sm font-medium leading-tight">{o.label}</span>
                            </label>
                          ))}
                        </div>
                        {formData.ownershipDocuments.includes("other") && (
                          <Input name="ownershipDocumentOther" value={formData.ownershipDocumentOther} onChange={handleChange} placeholder="Specify other document" className={inputClass} />
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="sm:col-span-2 space-y-2">
                          <Label className={labelClass}>7. Property Specifications</Label>
                          <Textarea name="propertySpecifications" value={formData.propertySpecifications} onChange={handleChange} placeholder="e.g. 3 bedroom bungalow, fenced, 2 toilets" className="bg-background/50 border-white/10 rounded-xl min-h-[80px]" />
                        </div>
                        <div className="space-y-2">
                          <Label className={labelClass}>8. Land / Property Size</Label>
                          <Input name="propertySize" value={formData.propertySize} onChange={handleChange} placeholder="e.g. 648 sqm" className={inputClass} />
                        </div>
                        <div className="space-y-2">
                          <Label className={labelClass}>9. Plot Number</Label>
                          <Input name="plotNumber" value={formData.plotNumber} onChange={handleChange} placeholder="e.g. Plot 1245" className={inputClass} />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <Label className={labelClass}>10. Price (₦)</Label>
                          <CurrencyInput name="price" value={formData.price} onChange={handleChange} placeholder="0" className={inputClass} />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className={labelClass}>11. Relationship with Property Owner</Label>
                        <RadioGroup
                          value={formData.ownerRelationship}
                          onValueChange={(v) => setField("ownerRelationship", v)}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                        >
                          {RELATIONSHIPS.map((o) => (
                            <label key={o.value} htmlFor={`rel-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-4 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <RadioGroupItem value={o.value} id={`rel-${o.value}`} />
                              <span className="text-sm font-medium">{o.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                        {formData.ownerRelationship === "other" && (
                          <Input name="ownerRelationshipOther" value={formData.ownerRelationshipOther} onChange={handleChange} placeholder="Specify relationship" className={inputClass} />
                        )}
                      </div>

                      <div className="space-y-3">
                        <Label className={labelClass}>12. Advert Placement</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {ADVERT_PLACEMENTS.map((o) => (
                            <label key={o.value} htmlFor={`adv-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-4 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <Checkbox
                                id={`adv-${o.value}`}
                                checked={formData.advertPlacement.includes(o.value)}
                                onCheckedChange={() => toggleInList("advertPlacement", o.value)}
                              />
                              <span className="text-sm font-medium">{o.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Company Use */}
                  {currentStep === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="space-y-3">
                        <Label className={labelClass}>1. Property / Land Inspected?</Label>
                        <RadioGroup
                          value={formData.inspected}
                          onValueChange={(v) => setField("inspected", v)}
                          className="flex gap-3"
                        >
                          {[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }].map((o) => (
                            <label key={o.value} htmlFor={`insp-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-5 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <RadioGroupItem value={o.value} id={`insp-${o.value}`} />
                              <span className="text-sm font-medium">{o.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-white/5">
                        <div className="sm:col-span-2">
                          <Label className={labelClass}>2. Appointment Date for Inspection</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Date</Label>
                          <Input name="inspectionDate" type="date" value={formData.inspectionDate} onChange={handleChange} className={inputClass} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Time</Label>
                          <Input name="inspectionTime" type="time" value={formData.inspectionTime} onChange={handleChange} className={inputClass} />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Officer Assigned</Label>
                          <Input name="officerAssigned" value={formData.officerAssigned} onChange={handleChange} placeholder="Name of assigned officer" className={inputClass} />
                        </div>
                      </div>

                      <div className="space-y-3 pt-2 border-t border-white/5">
                        <Label className={labelClass}>3. Payment Status</Label>
                        <RadioGroup
                          value={formData.paymentStatus}
                          onValueChange={(v) => setField("paymentStatus", v)}
                          className="flex gap-3"
                        >
                          {[{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }].map((o) => (
                            <label key={o.value} htmlFor={`pay-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-5 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <RadioGroupItem value={o.value} id={`pay-${o.value}`} />
                              <span className="text-sm font-medium">{o.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Amount Paid (₦)</Label>
                            <CurrencyInput name="amountPaid" value={formData.amountPaid} onChange={handleChange} placeholder="0" className={inputClass} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Receipt No.</Label>
                            <Input name="receiptNumber" value={formData.receiptNumber} onChange={handleChange} placeholder="e.g. 00012" className={inputClass} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <Label className={labelClass}>4. Condition / Remarks</Label>
                        <Textarea name="conditionRemarks" value={formData.conditionRemarks} onChange={handleChange} placeholder="Condition of the property and any remarks..." className="bg-background/50 border-white/10 rounded-xl min-h-[100px]" />
                      </div>
                    </div>
                  )}

                  {/* Step 4: Official Use Only */}
                  {currentStep === 4 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                      <div className="space-y-3">
                        <Label className={labelClass}>1. Property Accepted by Company?</Label>
                        <RadioGroup
                          value={formData.decision}
                          onValueChange={(v) => setField("decision", v)}
                          className="flex gap-3"
                        >
                          {[{ value: "approved", label: "Approved" }, { value: "declined", label: "Declined" }].map((o) => (
                            <label key={o.value} htmlFor={`dec-${o.value}`} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-background/50 px-5 py-3 cursor-pointer hover:border-teal-500/40 transition-colors">
                              <RadioGroupItem value={o.value} id={`dec-${o.value}`} />
                              <span className="text-sm font-medium">{o.label}</span>
                            </label>
                          ))}
                        </RadioGroup>
                      </div>

                      {formData.decision === "declined" && (
                        <div className="space-y-2">
                          <Label className={labelClass}>2. Reason (if declined)</Label>
                          <Textarea name="declineReason" value={formData.declineReason} onChange={handleChange} placeholder="Why the property was declined" className="bg-background/50 border-white/10 rounded-xl min-h-[80px]" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className={labelClass}>3. Manager's Comments</Label>
                        <Textarea name="managerComments" value={formData.managerComments} onChange={handleChange} placeholder="Comments from the manager" className="bg-background/50 border-white/10 rounded-xl min-h-[80px]" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                        <div className="sm:col-span-2">
                          <Label className={labelClass}>4. Approved By (C.E.O / Manager)</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Name</Label>
                          <Input name="approvedByName" value={formData.approvedByName} onChange={handleChange} placeholder="Approver's name" className={inputClass} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Date</Label>
                          <Input name="approvedDate" type="date" value={formData.approvedDate} onChange={handleChange} className={inputClass} />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs font-bold uppercase tracking-wider text-teal-500">Signature (C.E.O / Manager)</Label>
                          {approverSignature && <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-bold flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> READY</span>}
                        </div>
                        <div className="bg-card/40 p-3 rounded-2xl border border-white/5">
                          <SignaturePad
                          label="Approving officer" value={approverSignature} onChange={setApproverSignature} />
                        </div>
                      </div>

                      <div className="space-y-2 pt-4 border-t border-white/5">
                        <Label className={labelClass}>Agreement</Label>
                        <Textarea name="agreement" value={formData.agreement} onChange={handleChange} placeholder="Terms agreed between the company and the client..." className="bg-background/50 border-white/10 rounded-xl min-h-[100px]" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-bold uppercase tracking-wider text-teal-500">Sign (1)</Label>
                            {signOne && <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-bold flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> READY</span>}
                          </div>
                          <div className="bg-card/40 p-3 rounded-2xl border border-white/5">
                            <SignaturePad
                          label="Signature one" value={signOne} onChange={setSignOne} />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-bold uppercase tracking-wider text-teal-500">Sign (2)</Label>
                            {signTwo && <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-bold flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> READY</span>}
                          </div>
                          <div className="bg-card/40 p-3 rounded-2xl border border-white/5">
                            <SignaturePad
                          label="Signature two" value={signTwo} onChange={setSignTwo} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>

                <div className="p-8 border-t border-white/5 bg-foreground/5 flex justify-between items-center">
                  <Button
                    variant="ghost"
                    onClick={() => (currentStep > 1 ? setCurrentStep(currentStep - 1) : clearForm())}
                    className="rounded-xl h-12 px-6 gap-2"
                  >
                    {currentStep > 1 ? <><ChevronLeft className="w-4 h-4" /> Back</> : "Clear Form"}
                  </Button>

                  {currentStep < 4 ? (
                    <Button
                      onClick={() => setCurrentStep(currentStep + 1)}
                      className="bg-teal-500 hover:bg-teal-600 text-white rounded-xl h-12 px-8 gap-2 font-bold shadow-lg shadow-teal-500/20"
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSave}
                      disabled={!formData.fullName || saveMutation.isPending}
                      className="bg-teal-500 hover:bg-teal-600 text-white rounded-xl h-12 px-10 font-bold shadow-lg shadow-teal-500/20"
                    >
                      {saveMutation.isPending ? "Saving..." : "Save & View Form"}
                    </Button>
                  )}
                </div>
              </Card>
            </div>

            {/* Preview Column (Hidden on Mobile) */}
            <div className="lg:col-span-5 sticky top-28 hidden lg:block">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-teal-500/20 to-emerald-500/20 rounded-3xl blur opacity-75 transition duration-1000 group-hover:duration-200" />
                <div className="relative transform scale-[0.8] origin-top bg-white rounded-3xl shadow-2xl max-h-[70vh] overflow-y-auto overflow-x-hidden">
                  <DocumentPreview />
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-teal-500 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Real-time Preview
                </div>
              </div>

              <div className="mt-8 glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-teal-500 mb-1">
                  <Info className="w-4 h-4" />
                  <h4 className="text-xs font-bold uppercase tracking-widest">Form Tips</h4>
                </div>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-500/50 mt-1 shrink-0" />
                    The Form No. is issued automatically on save — it follows the paper booklet sequence.
                  </li>
                  <li className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-500/50 mt-1 shrink-0" />
                    Tick every ownership document you physically sighted — it is the company's proof of due diligence.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-8">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bento-card p-6 flex flex-col justify-between">
                <div className="p-2 bg-teal-500/10 rounded-xl w-fit"><FileText className="w-5 h-5 text-teal-500" /></div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">{stats.total}</h3>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-1">Total Forms</p>
                </div>
              </div>
              <div className="bento-card p-6 flex flex-col justify-between">
                <div className="p-2 bg-emerald-500/10 rounded-xl w-fit"><CheckCircle2 className="w-5 h-5 text-emerald-500" /></div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">{stats.approved}</h3>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-1">Approved</p>
                </div>
              </div>
              <div className="bento-card p-6 flex flex-col justify-between">
                <div className="p-2 bg-amber-500/10 rounded-xl w-fit"><Clock className="w-5 h-5 text-amber-500" /></div>
                <div className="mt-4">
                  <h3 className="text-3xl font-black">{stats.awaitingInspection}</h3>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-1">Awaiting Inspection</p>
                </div>
              </div>
            </div>

            {/* History Table */}
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-teal-500 transition-colors" />
                  <Input
                    placeholder="Search by name, form no., location or plot..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-12 h-14 rounded-2xl bg-background/50 border-white/10 focus-visible:ring-teal-500/50 text-base"
                  />
                </div>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="h-14 rounded-2xl bg-background/50 border-white/10 w-full md:w-56"
                />
              </div>

              <div className="bento-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-foreground/5">
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="font-bold uppercase tracking-widest text-[10px] py-6 px-6">Form No.</TableHead>
                        <TableHead className="font-bold uppercase tracking-widest text-[10px]">Applicant</TableHead>
                        <TableHead className="font-bold uppercase tracking-widest text-[10px]">Property</TableHead>
                        <TableHead className="font-bold uppercase tracking-widest text-[10px]">Status</TableHead>
                        <TableHead className="font-bold uppercase tracking-widest text-[10px]">Date</TableHead>
                        <TableHead className="text-right font-bold uppercase tracking-widest text-[10px] px-6">Manage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 text-muted-foreground font-medium italic">
                            Loading forms...
                          </TableCell>
                        </TableRow>
                      ) : filteredHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-20 text-muted-foreground font-medium italic">
                            No matching intake forms found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pagedHistory.map((item) => (
                          <TableRow key={item.id} className="border-border/10 hover:bg-white/5 group transition-colors">
                            <TableCell className="px-6 py-5 font-black tracking-widest text-sm">
                              {item.form_number || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-500">
                                  <Users className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="font-bold text-foreground leading-none mb-1">{item.full_name}</p>
                                  <p className="text-[10px] text-muted-foreground font-medium">{item.phone_number}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div>
                                  <p className="font-semibold text-sm leading-none mb-1">
                                    {labelFor(PROPERTY_TYPES, item.property_type) || "—"}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground font-medium max-w-[200px] truncate">
                                    {item.property_location}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.decision === "approved" ? (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3 h-3" /> Approved
                                </span>
                              ) : item.decision === "declined" ? (
                                <span className="text-[10px] bg-destructive/10 text-destructive px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5">
                                  <XCircle className="w-3 h-3" /> Declined
                                </span>
                              ) : (
                                <span className="text-[10px] bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" /> Pending
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {item.form_date
                                ? new Date(item.form_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right px-6">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => viewHistoryItem(item)} className="h-9 w-9 rounded-xl hover:bg-teal-500/20 hover:text-teal-500">
                                  <Printer className="w-4 h-4" />
                                </Button>
                                {hasEdit && (
                                  <Button variant="ghost" size="icon" aria-label="Edit form" onClick={() => handleEdit(item)} className="h-9 w-9 rounded-xl hover:bg-teal-500/20 hover:text-teal-500">
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                )}
                                {hasDelete && (
                                  <Button variant="ghost" size="icon" aria-label="Delete form" onClick={() => deleteMutation.mutate(item.id)} className="h-9 w-9 rounded-xl hover:bg-destructive/20 hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="p-4 border-t border-white/5">
                    <CustomPagination
                      page={safeHistoryPage}
                      pageCount={historyPageCount}
                      pageSize={historyPageSize}
                      total={filteredHistory.length}
                      onPageChange={setHistoryPage}
                      onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(0); }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
