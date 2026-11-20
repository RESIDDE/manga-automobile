import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Eye, HandCoins, History, Link2, Pencil, PlusCircle, Search, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/CurrencyInput";
import { SignaturePad } from "@/components/SignaturePad";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { PrintSheet } from "@/components/PrintSheet";
import { RecordActions } from "@/components/RecordActions";
import { DeleteConfirmDialog } from "@/components/DeleteConfirm";
import { LoanGuide } from "@/components/LoanGuide";
import {
  BRAND_NAVY, MODERN_FONT, PrintHeader, PrintWatermark, RULE,
} from "@/components/PrintHeader";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import {
  DECISIONS, decisionLabel, isApproved, lengthOfService, monthLabel, monthsToRepay, repaymentSchedule, scheduleShortfall,
  type LoanDecision,
} from "@/lib/loans";
import { cn } from "@/lib/utils";

const db = supabase as any;
const ENTITY = "Staff Loan Application";
const NONE = "__none__";

const today = () => new Date().toISOString().slice(0, 10);
const money = (v: string) => {
  const n = parseFloat((v || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const int = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const longDate = (d?: string | null) => {
  if (!d) return "";
  const p = new Date(d);
  return Number.isNaN(p.getTime()) ? d : p.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

// ─── The form ────────────────────────────────────────────────────────────────

const EMPTY = {
  documentNo: "",
  // A. Staff information
  staffId: "",
  fullName: "",
  staffFileNo: "",
  jobTitle: "",
  department: "",
  dateOfEmployment: "",
  phone: "",
  residentialAddress: "",
  nextOfKin: "",
  // B. Loan request
  amountRequested: "",
  purpose: "",
  preferredMonths: "",
  proposedDeduction: "",
  requestedDisbursementDate: "",
  // C. Declaration
  applicantName: "",
  applicantSignature: "",
  applicantSignDate: today(),
  reviewerName: "",
  reviewerSignature: "",
  reviewerDate: "",
  // D. Management decision
  decision: "pending" as LoanDecision,
  approvedAmount: "",
  repaymentMonths: "",
  monthlyDeduction: "",
  firstDeductionMonth: "", // yyyy-mm
  conditions: "",
  managerName: "",
  managerSignature: "",
  decisionDate: "",
  // Checklist
  chkStaffId: false,
  chkPayslip: false,
  chkSupporting: false,
};
type LoanForm = typeof EMPTY;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const fromRow = (r: any): LoanForm => ({
  documentNo: str(r.document_no),
  staffId: str(r.staff_id),
  fullName: str(r.full_name),
  staffFileNo: str(r.staff_file_no),
  jobTitle: str(r.job_title),
  department: str(r.department),
  dateOfEmployment: str(r.date_of_employment),
  phone: str(r.phone),
  residentialAddress: str(r.residential_address),
  nextOfKin: str(r.next_of_kin),
  amountRequested: str(r.amount_requested),
  purpose: str(r.purpose),
  preferredMonths: str(r.preferred_months),
  proposedDeduction: str(r.proposed_deduction),
  requestedDisbursementDate: str(r.requested_disbursement_date),
  applicantName: str(r.applicant_name),
  applicantSignature: str(r.applicant_signature),
  applicantSignDate: str(r.applicant_sign_date),
  reviewerName: str(r.reviewer_name),
  reviewerSignature: str(r.reviewer_signature),
  reviewerDate: str(r.reviewer_date),
  decision: (r.decision || "pending") as LoanDecision,
  approvedAmount: str(r.approved_amount),
  repaymentMonths: str(r.repayment_months),
  monthlyDeduction: str(r.monthly_deduction),
  firstDeductionMonth: r.first_deduction_month ? String(r.first_deduction_month).slice(0, 7) : "",
  conditions: str(r.conditions),
  managerName: str(r.manager_name),
  managerSignature: str(r.manager_signature),
  decisionDate: str(r.decision_date),
  chkStaffId: !!r.chk_staff_id,
  chkPayslip: !!r.chk_payslip,
  chkSupporting: !!r.chk_supporting,
});

function toPayload(f: LoanForm, includeDecision: boolean) {
  const base: Record<string, unknown> = {
    staff_id: f.staffId || null,
    full_name: f.fullName.trim(),
    staff_file_no: f.staffFileNo.trim() || null,
    job_title: f.jobTitle.trim() || null,
    department: f.department.trim() || null,
    date_of_employment: f.dateOfEmployment || null,
    phone: f.phone.trim() || null,
    residential_address: f.residentialAddress.trim() || null,
    next_of_kin: f.nextOfKin.trim() || null,
    amount_requested: money(f.amountRequested) ?? 0,
    purpose: f.purpose.trim() || null,
    preferred_months: int(f.preferredMonths),
    proposed_deduction: money(f.proposedDeduction),
    requested_disbursement_date: f.requestedDisbursementDate || null,
    applicant_name: f.applicantName.trim() || null,
    applicant_signature: f.applicantSignature || null,
    applicant_sign_date: f.applicantSignDate || null,
    reviewer_name: f.reviewerName.trim() || null,
    reviewer_signature: f.reviewerSignature || null,
    reviewer_date: f.reviewerDate || null,
    chk_staff_id: f.chkStaffId,
    chk_payslip: f.chkPayslip,
    chk_supporting: f.chkSupporting,
  };
  if (!includeDecision) return base;
  return {
    ...base,
    decision: f.decision,
    approved_amount: money(f.approvedAmount),
    repayment_months: int(f.repaymentMonths),
    monthly_deduction: money(f.monthlyDeduction),
    first_deduction_month: f.firstDeductionMonth ? `${f.firstDeductionMonth}-01` : null,
    conditions: f.conditions.trim() || null,
    manager_name: f.managerName.trim() || null,
    manager_signature: f.managerSignature || null,
    decision_date: f.decisionDate || null,
  };
}

// ─── The printed form ───────────────────────────────────────────────────────
// Laid out like the paper: a boxed table per section, label on the left, the
// entry on the right.

const Cell = ({ children, className = "", style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <td className={cn("px-2 py-[3.5px] align-top text-[10.5px] text-black", className)} style={{ border: RULE, ...style }}>
    {children}
  </td>
);

const Row = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <tr>
    <Cell className="w-[36%] font-semibold">{label}</Cell>
    <Cell className="font-semibold">{children || " "}</Cell>
  </tr>
);

const Box = ({ on, label }: { on: boolean; label: string }) => (
  <span className="inline-flex items-center gap-1 mr-4 whitespace-nowrap">
    <span className="inline-grid place-items-center w-[11px] h-[11px] text-[9px] leading-none" style={{ border: "1px solid #000" }}>
      {on ? "✓" : ""}
    </span>
    {label}
  </span>
);

const Sig = ({ src }: { src?: string | null }) =>
  src ? <img src={src} alt="" className="h-[30px] object-contain inline-block" style={{ filter: "brightness(0)" }} /> : null;

const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-black uppercase tracking-[0.06em] text-black mt-3 mb-1">{children}</p>
);

export function StaffLoanDocument({ data }: { data: LoanForm }) {
  const amount = money(data.amountRequested) ?? 0;
  const approved = money(data.approvedAmount) ?? 0;
  const monthly = money(data.monthlyDeduction) ?? 0;
  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:px-[14mm] md:pt-[11mm] md:pb-[12mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        <PrintHeader docNumber={data.documentNo} />
        <div className="h-[3px] w-full mb-3" style={{ backgroundColor: BRAND_NAVY }} />

        <div className="text-center mb-3">
          <p className="text-[15px] font-black uppercase tracking-[0.08em] text-black">Manga Automobiles</p>
          <p className="text-[13px] font-black uppercase tracking-[0.06em] text-black">Staff Loan Application Form</p>
          <p className="text-[9.5px] italic text-neutral-600 mt-[2px]">Confidential – For staff and management use only</p>
        </div>

        <SectionHead>A. Staff Information</SectionHead>
        <table className="w-full border-collapse">
          <tbody>
            <Row label="Full Name">{data.fullName}</Row>
            <Row label="Staff ID / File No.">{data.staffFileNo}</Row>
            <tr>
              <Cell className="w-[36%] font-semibold">Job Title / Position</Cell>
              <Cell className="font-semibold">
                <span className="inline-block min-w-[40%]">{data.jobTitle || " "}</span>
                <span className="font-normal text-neutral-600 ml-2">Department:</span> {data.department}
              </Cell>
            </tr>
            <tr>
              <Cell className="w-[36%] font-semibold">Date of Employment</Cell>
              <Cell className="font-semibold">
                <span className="inline-block min-w-[40%]">{longDate(data.dateOfEmployment) || " "}</span>
                <span className="font-normal text-neutral-600 ml-2">Length of Service:</span> {lengthOfService(data.dateOfEmployment)}
              </Cell>
            </tr>
            <Row label="Phone Number">{data.phone}</Row>
            <Row label="Residential Address">{data.residentialAddress}</Row>
            <Row label="Next of Kin & Phone">{data.nextOfKin}</Row>
          </tbody>
        </table>

        <SectionHead>B. Loan Request</SectionHead>
        <table className="w-full border-collapse">
          <tbody>
            <Row label="Amount Requested (₦)">{amount ? formatNaira(amount) : ""}</Row>
            <Row label="Amount in Words">{amount ? numberToWords(amount) : ""}</Row>
            <Row label="Purpose of Loan">{data.purpose}</Row>
            <Row label="Preferred Repayment Period">{data.preferredMonths ? `${data.preferredMonths} months` : "       months"}</Row>
            <Row label="Proposed Monthly Deduction (₦)">{money(data.proposedDeduction) ? formatNaira(money(data.proposedDeduction)!) : ""}</Row>
            <Row label="Requested Disbursement Date">{longDate(data.requestedDisbursementDate)}</Row>
          </tbody>
        </table>

        <SectionHead>C. Applicant's Declaration and Consent</SectionHead>
        <p className="text-[9.5px] leading-[1.5] text-black mb-1.5">
          I declare that the information supplied in this form is true and complete. I understand that this
          application is subject to Manga Automobiles' approval and applicable company policy. If approved, I
          consent to the agreed salary deductions stated in the separate loan approval/repayment agreement,
          subject to applicable law and any required written authorization. I understand that submitting this
          form does not guarantee approval.
        </p>
        <table className="w-full border-collapse">
          <tbody>
            <Row label="Applicant's Name">{data.applicantName || data.fullName}</Row>
            <tr>
              <Cell className="w-[36%] font-semibold">Signature</Cell>
              <Cell className="font-semibold">
                <span className="inline-block min-w-[45%] align-middle"><Sig src={data.applicantSignature} /></span>
                <span className="font-normal text-neutral-600 ml-2">Date:</span> {longDate(data.applicantSignDate)}
              </Cell>
            </tr>
            <tr>
              <Cell className="w-[36%] font-semibold">Reviewer Name / Signature / Date</Cell>
              <Cell className="font-semibold">
                {[data.reviewerName, longDate(data.reviewerDate)].filter(Boolean).join(" · ")}
                {data.reviewerSignature && <span className="ml-2 align-middle"><Sig src={data.reviewerSignature} /></span>}
                {!data.reviewerName && !data.reviewerSignature && !data.reviewerDate && " "}
              </Cell>
            </tr>
          </tbody>
        </table>

        <SectionHead>D. Management Decision</SectionHead>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <Cell className="w-[36%] font-semibold">Decision</Cell>
              <Cell>
                {DECISIONS.map((d) => <Box key={d.value} on={data.decision === d.value} label={d.label} />)}
              </Cell>
            </tr>
            <Row label="Approved Amount (₦)">{approved ? `${formatNaira(approved)} (${numberToWords(approved)})` : ""}</Row>
            <Row label="Repayment Period">{data.repaymentMonths ? `${data.repaymentMonths} months` : "       months"}</Row>
            <Row label="Monthly Deduction (₦)">{monthly ? formatNaira(monthly) : ""}</Row>
            <Row label="First Deduction Month">{data.firstDeductionMonth ? monthLabel(data.firstDeductionMonth) : ""}</Row>
            <Row label="Conditions / Remarks">{data.conditions}</Row>
            <tr>
              <Cell className="w-[36%] font-semibold">Authorized Manager's Name &amp; Signature</Cell>
              <Cell className="font-semibold">
                <span className="inline-block min-w-[45%]">{data.managerName || " "}</span>
                <span className="align-middle"><Sig src={data.managerSignature} /></span>
              </Cell>
            </tr>
            <Row label="Date">{longDate(data.decisionDate)}</Row>
          </tbody>
        </table>

        <SectionHead>Document Checklist</SectionHead>
        <p className="text-[10.5px] text-black">
          <Box on={data.chkStaffId} label="Staff ID / identification" />
          <Box on={data.chkPayslip} label="Recent payslip" />
          <Box on={data.chkSupporting} label="Supporting document for loan purpose (if required)" />
        </p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const inputClass = "rounded-xl h-11 bg-background/50 border-white/10";
const labelClass = "text-xs text-muted-foreground";

const DecisionBadge = ({ decision }: { decision: string }) => (
  <span className={cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
    decision === "approved" && "bg-emerald-500/15 text-emerald-600",
    decision === "approved_with_changes" && "bg-sky-500/15 text-sky-600",
    decision === "declined" && "bg-rose-500/15 text-rose-600",
    (!decision || decision === "pending") && "bg-amber-500/15 text-amber-600",
  )}>
    {decisionLabel(decision)}
  </span>
);

export default function StaffLoans() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const mayCreate = canCreate(role, "loans", permissions);
  const mayEdit = canEdit(role, "loans", permissions);
  const mayDelete = canDelete(role, "loans", permissions);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"create" | "history">(mayCreate ? "create" : "history");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm, clearDraft] = useFormPersistence("manga_staff_loan_draft", EMPTY, !!editingId, editingId);
  const [previewData, setPreviewData] = useState<LoanForm | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const documentRef = useRef<HTMLDivElement>(null);

  // Only someone who may edit loans records the management decision
  const decisionLocked = !mayEdit;

  const set = <K extends keyof LoanForm>(key: K, value: LoanForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  // The salary roster: linking a loan to a person is what puts it on their salary
  const { data: roster = [] } = useQuery({
    queryKey: ["staff", "roster-for-loans"],
    queryFn: async () => {
      const { data, error } = await db.from("staff").select("id, full_name, designation, phone, active").order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; designation: string | null; phone: string | null; active: boolean }[];
    },
  });

  const { data: records = [], isLoading, error: listError } = useQuery({
    queryKey: ["staff_loans"],
    queryFn: async () => {
      // Signatures are base64 images: fetched only when a form is opened
      const { data, error } = await db.from("staff_loans")
        .select("id, document_no, staff_id, full_name, job_title, department, phone, amount_requested, purpose, decision, approved_amount, monthly_deduction, repayment_months, first_deduction_month, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r: any) =>
      [r.full_name, r.document_no, r.job_title, r.department, r.phone, r.purpose].some((v) => (v || "").toLowerCase().includes(q)));
  }, [records, search]);

  const fetchFull = async (id: string) => {
    const { data, error } = await db.from("staff_loans").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.fullName.trim()) throw new Error("Enter the staff member's full name");
      if (!(money(form.amountRequested) ?? 0)) throw new Error("Enter the amount requested");
      if (isApproved(form.decision)) {
        if (!(money(form.approvedAmount) ?? 0)) throw new Error("Enter the approved amount");
        if (!(money(form.monthlyDeduction) ?? 0)) throw new Error("Enter the monthly deduction");
        if (!form.firstDeductionMonth) throw new Error("Choose the first deduction month");
      }
      const payload = toPayload(form, !decisionLocked);
      if (editingId) {
        const { error } = await db.from("staff_loans").update(payload).eq("id", editingId);
        if (error) throw error;
        await logAction("UPDATE", ENTITY, editingId, { decision: form.decision });
        return { id: editingId, document_no: form.documentNo };
      }
      const { data, error } = await db.from("staff_loans").insert(payload).select("id, document_no").single();
      if (error) throw error;
      await logAction("CREATE", ENTITY, data.id);
      return data as { id: string; document_no: string };
    },
    onSuccess: ({ id, document_no }) => {
      const saved = { ...form, documentNo: document_no || form.documentNo };
      setEditingId(id);
      setForm(saved);
      setPreviewData(saved);
      setPreviewId(id);
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["staff_loans"] });
      queryClient.invalidateQueries({ queryKey: ["salary_lines"] });
      toast.success(
        isApproved(saved.decision) && saved.staffId
          ? "Saved — the deductions are now on the Salary Schedule"
          : "Loan application saved",
      );
      setMode("preview");
    },
    onError: (e: any) => {
      const msg = String(e?.message || "");
      toast.error(/staff_loans|does not exist|schema cache/i.test(msg)
        ? "The database needs the Staff Loans update before applications can be saved"
        : msg || "Couldn't save the application");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("staff_loans").delete().eq("id", id);
      if (error) throw error;
      await logAction("DELETE", ENTITY, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff_loans"] });
      queryClient.invalidateQueries({ queryKey: ["salary_lines"] });
      toast.success("Application deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't delete the application"),
  });

  const startNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY, applicantSignDate: today() });
    setMode("edit");
    setTab("create");
  };

  const openPreview = async (row: any) => {
    try {
      const full = fromRow(await fetchFull(row.id));
      setPreviewData(full);
      setPreviewId(row.id);
      setMode("preview");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't open the application");
    }
  };

  const openEdit = async (row: any) => {
    try {
      const full = fromRow(await fetchFull(row.id));
      setEditingId(row.id);
      setForm(full);
      setMode("edit");
      setTab("create");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't open the application");
    }
  };

  const pickStaff = (id: string) => {
    if (id === NONE) return set("staffId", "");
    const p = roster.find((r) => r.id === id);
    if (!p) return;
    setForm((prev) => ({
      ...prev,
      staffId: p.id,
      fullName: prev.fullName || p.full_name,
      applicantName: prev.applicantName || p.full_name,
      jobTitle: prev.jobTitle || p.designation || "",
      phone: prev.phone || p.phone || "",
    }));
  };

  /** Management takes the request as approved, then adjusts. */
  const copyRequest = () =>
    setForm((prev) => ({
      ...prev,
      approvedAmount: prev.approvedAmount || prev.amountRequested,
      monthlyDeduction: prev.monthlyDeduction || prev.proposedDeduction,
      repaymentMonths: prev.repaymentMonths || prev.preferredMonths
        || String(monthsToRepay(prev.amountRequested, prev.proposedDeduction) || ""),
    }));

  const schedule = isApproved(form.decision)
    ? repaymentSchedule(form.approvedAmount, form.monthlyDeduction, form.firstDeductionMonth, int(form.repaymentMonths))
    : [];
  const shortfall = isApproved(form.decision)
    ? scheduleShortfall(form.approvedAmount, form.monthlyDeduction, int(form.repaymentMonths))
    : 0;

  // ── Preview ──────────────────────────────────────────────────────────────
  if (mode === "preview" && previewData) {
    return (
      <div className="animate-fade-in">
        <DocumentToolbar
          documentRef={documentRef}
          filename={`staff-loan-${(previewData.documentNo || previewData.fullName || "application").replace(/\s+/g, "-").toLowerCase()}`}
          entity={ENTITY}
          recordId={previewId}
          backLabel={tab === "history" ? "Back to History" : "Back to Form"}
          accentClass="bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20"
          archive={{
            type: "Staff Loan Application",
            title: `Staff Loan Application ${previewData.documentNo || ""} — ${previewData.fullName}`.replace(/\s+/g, " "),
            number: previewData.documentNo || null,
            docDate: previewData.applicantSignDate || null,
            person: previewData.fullName || null,
            phone: previewData.phone || null,
            details: {
              staff: {
                name: previewData.fullName, file_no: previewData.staffFileNo, job_title: previewData.jobTitle,
                department: previewData.department, employed: previewData.dateOfEmployment, phone: previewData.phone,
                address: previewData.residentialAddress, next_of_kin: previewData.nextOfKin,
              },
              request: {
                amount: previewData.amountRequested, purpose: previewData.purpose, months: previewData.preferredMonths,
                monthly: previewData.proposedDeduction, disbursement: previewData.requestedDisbursementDate,
              },
              decision: {
                decision: decisionLabel(previewData.decision), approved_amount: previewData.approvedAmount,
                months: previewData.repaymentMonths, monthly: previewData.monthlyDeduction,
                first_month: previewData.firstDeductionMonth, conditions: previewData.conditions, manager: previewData.managerName,
              },
            },
          }}
          onBack={() => setMode("edit")}
        />
        <PrintSheet ref={documentRef}>
          <StaffLoanDocument data={previewData} />
        </PrintSheet>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-indigo-500/10 shrink-0"><HandCoins className="h-6 w-6 text-indigo-500" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Staff Loans</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Loan applications and decisions. Approved loans are deducted on the Salary Schedule automatically.
            </p>
          </div>
        </div>
        {mayCreate && (
          <Button onClick={startNew} className="rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white">
            <PlusCircle className="h-4 w-4 mr-2" /> New application
          </Button>
        )}
      </div>

      <LoanGuide />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="rounded-xl">
          {(mayCreate || editingId) && <TabsTrigger value="create" className="rounded-lg">{editingId ? "Edit application" : "New application"}</TabsTrigger>}
          <TabsTrigger value="history" className="rounded-lg"><History className="h-4 w-4 mr-1.5" /> History</TabsTrigger>
        </TabsList>

        {/* ── Form ── */}
        <TabsContent value="create" className="space-y-5 mt-5">
          <Card className="rounded-3xl"><CardContent className="p-5 md:p-6 space-y-5">
            <h2 className="font-bold">A. Staff information</h2>
            <div className="space-y-2">
              <Label className={labelClass}>Staff on the salary roster</Label>
              <Select value={form.staffId || NONE} onValueChange={pickStaff}>
                <SelectTrigger className={inputClass}><SelectValue placeholder="Choose the staff member…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not on the roster</SelectItem>
                  {roster.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}{p.designation ? ` — ${p.designation}` : ""}{!p.active ? " (inactive)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={cn("text-[11px] flex items-start gap-1.5", form.staffId ? "text-emerald-600" : "text-amber-600")}>
                {form.staffId
                  ? <><Link2 className="h-3.5 w-3.5 shrink-0 mt-px" /> Linked: once approved, deductions appear on this person's salary lines.</>
                  : <><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> Choose the person from the roster so the deductions reach the Salary Schedule.</>}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label className={labelClass}>Full name *</Label>
                <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Staff ID / File no.</Label>
                <Input value={form.staffFileNo} onChange={(e) => set("staffFileNo", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Job title / position</Label>
                <Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Department</Label>
                <Input value={form.department} onChange={(e) => set("department", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Date of employment</Label>
                <Input type="date" value={form.dateOfEmployment} onChange={(e) => set("dateOfEmployment", e.target.value)} className={inputClass} />
                {form.dateOfEmployment && <p className="text-[11px] text-muted-foreground">Length of service: {lengthOfService(form.dateOfEmployment) || "—"}</p>}
              </div>
              <div className="space-y-2"><Label className={labelClass}>Phone number</Label>
                <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Residential address</Label>
                <Input value={form.residentialAddress} onChange={(e) => set("residentialAddress", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Next of kin &amp; phone</Label>
                <Input value={form.nextOfKin} onChange={(e) => set("nextOfKin", e.target.value)} placeholder="Name and phone number" className={inputClass} /></div>
            </div>
          </CardContent></Card>

          <Card className="rounded-3xl"><CardContent className="p-5 md:p-6 space-y-5">
            <h2 className="font-bold">B. Loan request</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Amount requested (₦) *</Label>
                <CurrencyInput value={form.amountRequested} onChange={(e) => set("amountRequested", e.target.value)} className={cn(inputClass, "font-bold")} />
                {money(form.amountRequested) ? <p className="text-[11px] italic text-indigo-500">{numberToWords(money(form.amountRequested)!)}</p> : null}
              </div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Purpose of loan</Label>
                <Input value={form.purpose} onChange={(e) => set("purpose", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Preferred repayment period (months)</Label>
                <Input inputMode="numeric" value={form.preferredMonths} onChange={(e) => set("preferredMonths", e.target.value.replace(/\D/g, ""))} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Proposed monthly deduction (₦)</Label>
                <CurrencyInput value={form.proposedDeduction} onChange={(e) => set("proposedDeduction", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Requested disbursement date</Label>
                <Input type="date" value={form.requestedDisbursementDate} onChange={(e) => set("requestedDisbursementDate", e.target.value)} className={inputClass} /></div>
            </div>
          </CardContent></Card>

          <Card className="rounded-3xl"><CardContent className="p-5 md:p-6 space-y-5">
            <h2 className="font-bold">C. Applicant's declaration and consent</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The applicant declares the information is true and complete, and consents to the agreed salary
              deductions if the loan is approved. The full declaration prints on the form.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label className={labelClass}>Applicant's name</Label>
                <Input value={form.applicantName} onChange={(e) => set("applicantName", e.target.value)} placeholder={form.fullName} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Date</Label>
                <Input type="date" value={form.applicantSignDate} onChange={(e) => set("applicantSignDate", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Applicant's signature</Label>
                <div className="rounded-2xl overflow-hidden border max-w-md"><SignaturePad label="Applicant" value={form.applicantSignature} onChange={(v) => set("applicantSignature", v)} /></div></div>
              <div className="space-y-2"><Label className={labelClass}>Reviewer name</Label>
                <Input value={form.reviewerName} onChange={(e) => set("reviewerName", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Review date</Label>
                <Input type="date" value={form.reviewerDate} onChange={(e) => set("reviewerDate", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Reviewer's signature</Label>
                <div className="rounded-2xl overflow-hidden border max-w-md"><SignaturePad label="Reviewer" value={form.reviewerSignature} onChange={(v) => set("reviewerSignature", v)} /></div></div>
            </div>
          </CardContent></Card>

          <Card className={cn("rounded-3xl", decisionLocked && "opacity-80")}><CardContent className="p-5 md:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">D. Management decision</h2>
              {decisionLocked
                ? <span className="text-[11px] text-muted-foreground">Recorded by management (needs Edit on Staff Loans)</span>
                : isApproved(form.decision) && (
                  <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={copyRequest}>Use the requested figures</Button>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Decision">
              {DECISIONS.map((d) => {
                const on = form.decision === d.value;
                return (
                  <button key={d.value} type="button" role="radio" aria-checked={on} disabled={decisionLocked}
                    onClick={() => set("decision", on ? "pending" : d.value)}
                    className={cn("h-11 rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed",
                      on ? (d.value === "declined" ? "bg-rose-500 border-rose-500 text-white" : "bg-emerald-500 border-emerald-500 text-white")
                        : "bg-background/50 border-white/10 text-muted-foreground hover:text-foreground")}>
                    {d.label}
                  </button>
                );
              })}
            </div>
            <fieldset disabled={decisionLocked} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Approved amount (₦){isApproved(form.decision) && " *"}</Label>
                <CurrencyInput value={form.approvedAmount} onChange={(e) => set("approvedAmount", e.target.value)} className={cn(inputClass, "font-bold")} />
                {money(form.approvedAmount) ? <p className="text-[11px] italic text-indigo-500">{numberToWords(money(form.approvedAmount)!)}</p> : null}
              </div>
              <div className="space-y-2"><Label className={labelClass}>Monthly deduction (₦){isApproved(form.decision) && " *"}</Label>
                <CurrencyInput value={form.monthlyDeduction} onChange={(e) => set("monthlyDeduction", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Repayment period (months)</Label>
                <Input inputMode="numeric" value={form.repaymentMonths}
                  placeholder={monthsToRepay(form.approvedAmount, form.monthlyDeduction) ? `${monthsToRepay(form.approvedAmount, form.monthlyDeduction)} needed` : ""}
                  onChange={(e) => set("repaymentMonths", e.target.value.replace(/\D/g, ""))} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>First deduction month{isApproved(form.decision) && " *"}</Label>
                <Input type="month" value={form.firstDeductionMonth} onChange={(e) => set("firstDeductionMonth", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2"><Label className={labelClass}>Decision date</Label>
                <Input type="date" value={form.decisionDate} onChange={(e) => set("decisionDate", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Conditions / remarks</Label>
                <Textarea value={form.conditions} onChange={(e) => set("conditions", e.target.value)} className="rounded-xl bg-background/50 border-white/10" rows={2} /></div>
              <div className="space-y-2"><Label className={labelClass}>Authorized manager's name</Label>
                <Input value={form.managerName} onChange={(e) => set("managerName", e.target.value)} className={inputClass} /></div>
              <div className="space-y-2 md:col-span-2"><Label className={labelClass}>Manager's signature</Label>
                <div className="rounded-2xl overflow-hidden border max-w-md"><SignaturePad label="Manager" disabled={decisionLocked} value={form.managerSignature} onChange={(v) => set("managerSignature", v)} /></div></div>
            </fieldset>

            {isApproved(form.decision) && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-indigo-500" /> Deductions on the Salary Schedule</p>
                {schedule.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Enter the approved amount, monthly deduction and first deduction month to see the schedule.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground text-left">
                        <th className="py-1 pr-3 font-medium">Month</th><th className="py-1 pr-3 font-medium text-right">Owing</th>
                        <th className="py-1 pr-3 font-medium text-right">Deduction</th><th className="py-1 font-medium text-right">Balance</th>
                      </tr></thead>
                      <tbody>
                        {schedule.map((r) => (
                          <tr key={r.month} className="border-t border-white/5">
                            <td className="py-1 pr-3">{monthLabel(r.month)}</td>
                            <td className="py-1 pr-3 text-right">{formatNaira(r.opening)}</td>
                            <td className="py-1 pr-3 text-right font-semibold">{formatNaira(r.deduction)}</td>
                            <td className="py-1 text-right">{formatNaira(r.closing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {shortfall > 0 && (
                  <p className="text-xs text-amber-600 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    {formatNaira(shortfall)} would still be owing after {form.repaymentMonths} months at this deduction.</p>
                )}
                {!form.staffId && (
                  <p className="text-xs text-amber-600 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    Not linked to the roster, so nothing will appear on the Salary Schedule.</p>
                )}
              </div>
            )}
          </CardContent></Card>

          <Card className="rounded-3xl"><CardContent className="p-5 md:p-6 space-y-3">
            <h2 className="font-bold">Document checklist</h2>
            {([
              ["chkStaffId", "Staff ID / identification"],
              ["chkPayslip", "Recent payslip"],
              ["chkSupporting", "Supporting document for loan purpose (if required)"],
            ] as const).map(([key, text]) => (
              <label key={key} className="flex items-center gap-3 text-sm cursor-pointer">
                <Checkbox checked={form[key]} onCheckedChange={(v) => set(key, v === true)} /> {text}
              </label>
            ))}
          </CardContent></Card>

          <div className="flex flex-wrap justify-end gap-3">
            {editingId && <Button variant="outline" className="rounded-xl" onClick={startNew}>Start a new application</Button>}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || (!editingId && !mayCreate) || (!!editingId && !mayEdit)}
              className="rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white min-w-[180px]"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> {saveMutation.isPending ? "Saving…" : "Save & preview"}
            </Button>
          </div>
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history" className="space-y-4 mt-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, form number, department, purpose…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
          </div>
          {listError && (
            <p className="text-sm text-destructive">
              {/staff_loans|does not exist|schema cache/i.test(String((listError as Error).message))
                ? "Staff Loans needs its database update before applications can be listed."
                : (listError as Error).message}
            </p>
          )}
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">{records.length ? "No applications match." : "No loan applications yet."}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((r: any) => (
                <Card key={r.id} className="rounded-2xl"><CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{[r.job_title, r.department].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {r.document_no && <p className="text-[11px] font-mono text-muted-foreground">No. {r.document_no}</p>}
                      <DecisionBadge decision={r.decision} />
                    </div>
                  </div>
                  <p className="text-sm">
                    Requested <span className="font-semibold">{formatNaira(Number(r.amount_requested) || 0)}</span>
                    {isApproved(r.decision) && r.approved_amount != null && (
                      <> · approved <span className="font-semibold">{formatNaira(Number(r.approved_amount))}</span>
                        {r.monthly_deduction ? <> at {formatNaira(Number(r.monthly_deduction))}/month</> : null}
                        {r.first_deduction_month ? <> from {monthLabel(String(r.first_deduction_month).slice(0, 7))}</> : null}</>
                    )}
                  </p>
                  {isApproved(r.decision) && !r.staff_id && (
                    <p className="text-[11px] text-amber-600">Not linked to the salary roster</p>
                  )}
                  <RecordActions
                    primary={[{ label: "Preview", icon: Eye, onClick: () => openPreview(r) }]}
                    menu={[
                      { label: "Edit", icon: Pencil, onClick: () => openEdit(r), show: mayEdit },
                      { label: "Delete", icon: Trash2, destructive: true, onClick: () => setDeleteRow(r), show: mayDelete },
                    ]}
                  />
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={!!deleteRow}
        onOpenChange={(open) => { if (!open) setDeleteRow(null); }}
        title={`Delete ${deleteRow?.full_name ?? "this"}'s loan application?`}
        description={isApproved(deleteRow?.decision)
          ? "The application is removed, and its deductions come off the Salary Schedule."
          : "The application is removed permanently."}
        confirmLabel="Delete application"
        onConfirm={() => { if (deleteRow) deleteMutation.mutate(deleteRow.id); }}
      />
    </div>
  );
}
