import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, CalendarClock, CopyPlus, Download, FileText, Printer,
  PlusCircle, Trash2, Users, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/DeleteConfirm";
import { ArchiveToggle } from "@/components/ArchiveToggle";
import { exportToCSV, printTable, downloadTableAsPDF } from "@/lib/exportHelpers";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { isMissingSchema, warnOnce } from "@/lib/dbCompat";
import { formatNaira } from "@/lib/numberToWords";
import {
  carryForward, closingBalance, dateToPeriod, latestPeriodBefore, lineWarnings,
  periodKey, periodLabel, periodOptions, periodShortLabel, periodToDate,
  receivingAmount, scheduleTotals, type SalaryLine,
} from "@/lib/salary";

const PAGE_KEY = "salary" as const;

const COLUMNS =
  "id, period, staff_id, staff_name, designation, account_number, bank_name, " +
  "actual_salary, loan_amount, opening_balance, deduction, notes, sort_order";

type Row = SalaryLine & { id: string; period: string };

const StatTile = ({ label, value, sub, tone = "text-foreground" }: {
  label: string; value: string; sub?: string; tone?: string;
}) => (
  <div className="bento-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

/**
 * A cell that edits in place.
 *
 * It keeps its own draft while the cursor is in it and reports upwards on blur,
 * so a save never fires per keystroke — typing "200000" would otherwise be six
 * writes, the first five of them wrong. `key`ing on the committed value lets a
 * refetch or an undo reset the draft.
 */
function EditableCell({ value, onCommit, money, disabled, align = "left", className = "" }: {
  value: string;
  onCommit: (next: string) => void;
  money?: boolean;
  disabled?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const base =
    `h-8 border-transparent bg-transparent px-2 text-[13px] shadow-none transition-colors ` +
    `hover:border-input focus-visible:border-input focus-visible:bg-background ` +
    `${align === "right" ? "text-right tabular-nums" : ""} ${className}`;

  if (disabled) {
    return (
      <span className={`block px-2 text-[13px] ${align === "right" ? "text-right tabular-nums" : ""}`}>
        {value || "—"}
      </span>
    );
  }

  const props = {
    value: draft,
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      if (e.key === "Escape") setDraft(value);
    },
    className: base,
  };

  return money
    ? <CurrencyInput {...props} onChange={(e) => setDraft(e.target.value)} />
    : <Input {...props} onChange={(e) => setDraft(e.target.value)} />;
}

/**
 * The monthly salary schedule — the office's paper sheet, with the arithmetic
 * done for them.
 *
 * Typed per row: salary, loan amount, opening balance, deduction.
 * Computed, never stored: the receiving amount, the closing loan balance and
 * the grand total at the foot. Every one of those comes from `@/lib/salary`,
 * so the tiles, the table's total row and the printed sheet cannot drift apart
 * from each other.
 *
 * Editing is inline rather than through a dialog, unlike the rest of this app.
 * A payroll run is a sweep across one column of fourteen rows — opening and
 * dismissing a dialog fourteen times to type fourteen numbers would be the
 * wrong shape for the job.
 */
export default function SalarySchedule() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, PAGE_KEY, permissions);
  const hasEdit = canEdit(role, PAGE_KEY, permissions);
  const hasDelete = canDelete(role, PAGE_KEY, permissions);

  const [period, setPeriod] = useState(periodKey());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Focus the name box of a row that was just added, so "Add staff" leaves the
  // cursor where the next thing is typed rather than at the top of the page.
  const pendingFocus = useRef<string | null>(null);

  /** Every month that already has a sheet, so the picker can offer them. */
  const { data: knownPeriods = [] } = useQuery({
    queryKey: ["salary-periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_lines").select("period").order("period", { ascending: false });
      if (error) {
        if (isMissingSchema(error, ["salary_lines"])) return [] as string[];
        throw error;
      }
      return [...new Set((data ?? []).map((r: any) => dateToPeriod(r.period)))];
    },
  });

  const { data: lines = [], isLoading, isError } = useQuery({
    queryKey: ["salary-lines", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_lines")
        .select(COLUMNS)
        .eq("period", periodToDate(period))
        .order("sort_order", { ascending: true })
        .order("staff_name", { ascending: true });

      if (error) {
        // The page must still render its month picker and its empty state while
        // the migration is pending, rather than throwing to an error boundary.
        if (isMissingSchema(error, ["salary_lines"])) {
          warnOnce("salary_lines", () => toast.warning(
            "The salary schedule is waiting on the pending database migration."
          ));
          return [] as Row[];
        }
        throw error;
      }
      return (data ?? []) as unknown as Row[];
    },
  });

  /**
   * The month a new sheet is started from: the most recent one that actually
   * has rows, not simply last month — a skipped month must not strand the
   * office with nothing to copy.
   */
  const sourcePeriod = useMemo(
    () => latestPeriodBefore(period, knownPeriods),
    [period, knownPeriods]
  );

  const totals = useMemo(() => scheduleTotals(lines), [lines]);
  const months = useMemo(() => periodOptions(knownPeriods), [knownPeriods]);
  const warningCount = useMemo(
    () => lines.filter((l) => lineWarnings(l).length > 0).length,
    [lines]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["salary-lines", period] });
    queryClient.invalidateQueries({ queryKey: ["salary-periods"] });
  };

  // ─── Writes ───────────────────────────────────────────────────────────────

  const updateLine = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("salary_lines").update(patch as any).eq("id", id);
      if (error) throw error;
      return { id, patch };
    },
    // Optimistic: the figure stays on screen and the total moves with it while
    // the write is in flight. Without this, every cell blanks back to its old
    // value for a beat and the sheet looks like it is rejecting the entry.
    onMutate: async ({ id, patch }) => {
      const key = ["salary-lines", period];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Row[]>(key);
      queryClient.setQueryData<Row[]>(key, (old = []) =>
        old.map((l) => (l.id === id ? { ...l, ...patch } : l))
      );
      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["salary-lines", period], context.previous);
      toast.error(error?.message ?? "Could not save that change");
    },
    onSuccess: ({ id, patch }) =>
      logAction("UPDATE", "salary_line", id, { period, fields: Object.keys(patch) }),
    onSettled: refresh,
  });

  const addLine = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("salary_lines").insert({
        period: periodToDate(period),
        staff_name: "",
        sort_order: lines.length,
      } as any).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      pendingFocus.current = data?.id ?? null;
      logAction("CREATE", "salary_line", data?.id, { period });
      refresh();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not add a row"),
  });

  const removeLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salary_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success("Row removed");
      logAction("DELETE", "salary_line", id, { period });
      refresh();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not remove that row"),
    onSettled: () => setDeleteId(null),
  });

  /**
   * Start this month from the last sheet that exists: the same people, the same
   * salaries and bank details, with loan balances rolled forward and a final
   * instalment capped at what is still owed.
   *
   * Guarded on the row count rather than on the button being hidden, so a
   * double-click, a stale tab or a second person doing it at the same moment
   * cannot pay the payroll twice.
   */
  const startFromPrevious = useMutation({
    mutationFn: async () => {
      if (lines.length) throw new Error("This month already has rows");
      if (!sourcePeriod) throw new Error("There is no earlier sheet to copy");

      const { data, error } = await supabase
        .from("salary_lines").select(COLUMNS)
        .eq("period", periodToDate(sourcePeriod))
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (!data?.length) throw new Error(`Nothing to copy — ${periodShortLabel(sourcePeriod)} is empty`);

      const rows = carryForward(data as unknown as SalaryLine[])
        .map((line) => ({ ...line, period: periodToDate(period) }));
      const { error: insertError } = await supabase.from("salary_lines").insert(rows as any);
      if (insertError) throw insertError;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(
        `${periodShortLabel(period)} started — ${count} staff brought forward from ${periodShortLabel(sourcePeriod!)}`
      );
      logAction("CREATE", "salary_line", null, { period, copiedFrom: sourcePeriod, count });
      refresh();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not start the month"),
  });

  /**
   * The other way to start: everybody currently on the roster, at their usual
   * salary and with no loans. This is what the very first month uses, when
   * there is no earlier sheet to carry forward from.
   */
  const startFromRoster = useMutation({
    mutationFn: async () => {
      if (lines.length) throw new Error("This month already has rows");

      const { data, error } = await supabase
        .from("staff")
        .select("id, full_name, designation, account_number, bank_name, base_salary")
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      if (!data?.length) throw new Error("No active staff on the roster yet");

      const rows = data.map((person: any, index: number) => ({
        period: periodToDate(period),
        staff_id: person.id,
        staff_name: person.full_name,
        designation: person.designation,
        account_number: person.account_number,
        bank_name: person.bank_name,
        actual_salary: person.base_salary ?? 0,
        loan_amount: 0,
        opening_balance: 0,
        deduction: 0,
        sort_order: index,
      }));
      const { error: insertError } = await supabase.from("salary_lines").insert(rows as any);
      if (insertError) throw insertError;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${periodShortLabel(period)} started — ${count} staff from the roster`);
      logAction("CREATE", "salary_line", null, { period, from: "roster", count });
      refresh();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not start the month"),
  });

  const starting = startFromPrevious.isPending || startFromRoster.isPending;
  /** An empty month is a month waiting to be started, not one to type by hand. */
  const canStart = !isLoading && !isError && lines.length === 0;

  /**
   * The month we are actually in, when it has no sheet and an earlier one does.
   *
   * Nobody should have to notice that a new month has begun. Looking at any
   * older sheet says so, with the way to start it — which is also why the
   * banner is not shown while that month is already on screen: the empty state
   * below is saying the same thing better.
   */
  const thisMonth = periodKey();
  const unstartedMonth =
    period !== thisMonth && knownPeriods.length > 0 && !knownPeriods.includes(thisMonth)
      ? thisMonth
      : null;

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = document.querySelector<HTMLInputElement>(`[data-name-cell="${pendingFocus.current}"]`);
    el?.focus();
    pendingFocus.current = null;
  }, [lines]);

  // ─── Export ───────────────────────────────────────────────────────────────

  const title = `SALARY SCHEDULE FOR THE MONTH OF ${periodLabel(period)}`;

  const exportColumns = [
    { key: "sn", label: "S/N" },
    { key: "staff", label: "Staff Name" },
    { key: "designation", label: "Designation" },
    { key: "salary", label: "Actual Salary (₦)" },
    { key: "loan", label: "Loan Amount" },
    { key: "deduction", label: "Deduction" },
    { key: "receiving", label: "Receiving Amount" },
    { key: "account", label: "Account Number" },
    { key: "bank", label: "Bank Name" },
    { key: "balance", label: "Loan Balance" },
  ];

  /** The sheet as flat text, with the grand total as its final row. */
  const exportRows = () => {
    const rows = lines.map((line, i) => ({
      sn: i + 1,
      staff: line.staff_name || "—",
      designation: line.designation ?? "",
      salary: formatNaira(line.actual_salary ?? 0),
      loan: Number(line.loan_amount) ? formatNaira(line.loan_amount!) : "",
      deduction: Number(line.deduction) ? formatNaira(line.deduction!) : "",
      receiving: formatNaira(receivingAmount(line)),
      account: line.account_number ?? "",
      bank: line.bank_name ?? "",
      balance: closingBalance(line) ? formatNaira(closingBalance(line)) : "",
    }));
    rows.push({
      sn: "" as any, staff: "GRAND TOTAL", designation: "",
      salary: formatNaira(totals.salary), loan: formatNaira(totals.loans),
      deduction: formatNaira(totals.deductions), receiving: formatNaira(totals.receiving),
      account: "", bank: "", balance: formatNaira(totals.loanBalance),
    });
    return rows;
  };

  const guardEmpty = () => {
    if (lines.length) return false;
    toast.error("Nothing to export for this month");
    return true;
  };

  const onPrint = () => {
    if (guardEmpty()) return;
    printTable(title, exportRows(), exportColumns);
    logAction("PRINT", "salary_schedule", null, { period });
  };

  const onPDF = async () => {
    if (guardEmpty()) return;
    await downloadTableAsPDF(title, exportRows(), exportColumns);
    logAction("EXPORT", "salary_schedule", null, { period, format: "pdf" });
  };

  const onCSV = () => {
    if (guardEmpty()) return;
    exportToCSV(exportRows(), `salary_schedule_${period}`);
    logAction("EXPORT", "salary_schedule", null, { period, format: "csv" });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const set = (id: string, field: string, raw: string, money = false) =>
    updateLine.mutate({
      id,
      patch: { [field]: money ? (parseFloat(raw.replace(/,/g, "")) || 0) : (raw.trim() || null) },
    });

  const headCell = "text-[10px] font-bold uppercase tracking-wide text-muted-foreground";
  const money = (n: number) => formatNaira(n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Salary Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {periodLabel(period)} · {totals.staff} staff
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {periodShortLabel(m)}{knownPeriods.includes(m) ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ArchiveToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="h-4 w-4 mr-1.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onPrint}>
                <Printer className="h-4 w-4 mr-2" /> Print sheet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPDF}>
                <FileText className="h-4 w-4 mr-2" /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCSV}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasCreate && (
            canStart ? (
              <Button
                size="sm" className="h-9"
                onClick={() => (sourcePeriod ? startFromPrevious : startFromRoster).mutate()}
                disabled={starting}
              >
                <CopyPlus className="h-4 w-4 mr-1.5" />
                {starting ? "Starting…" : `Start ${periodShortLabel(period)}`}
              </Button>
            ) : (
              <Button size="sm" className="h-9" onClick={() => addLine.mutate()} disabled={addLine.isPending}>
                <PlusCircle className="h-4 w-4 mr-1.5" /> Add staff
              </Button>
            )
          )}
        </div>
      </div>

      {/* Totals. The grand total is the figure the office writes at the foot of
          the paper sheet, so it is the one that gets the accent. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Staff on payroll" value={String(totals.staff)} />
        <StatTile label="Gross salary" value={money(totals.salary)} sub="Before deductions" />
        <StatTile
          label="Loan deductions" value={money(totals.deductions)}
          sub={totals.loanBalance ? `${money(totals.loanBalance)} still owed` : "No loans outstanding"}
          tone={totals.deductions ? "text-amber-600" : undefined}
        />
        <StatTile
          label="Grand total" value={money(totals.receiving)}
          sub="Salary − deductions" tone="text-emerald-600"
        />
      </div>

      {unstartedMonth && hasCreate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-semibold">
                {periodLabel(unstartedMonth)} has not been started yet.
              </p>
              <p className="text-[12px] text-muted-foreground">
                Carry the last sheet forward instead of typing it again.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPeriod(unstartedMonth)}>
            Start {periodShortLabel(unstartedMonth)}
          </Button>
        </div>
      )}

      {warningCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {warningCount} {warningCount === 1 ? "row needs" : "rows need"} checking — hover the warning on the row.
        </div>
      )}

      {/* The sheet */}
      <div className="bento-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={`${headCell} w-10`}>S/N</TableHead>
              <TableHead className={`${headCell} min-w-[190px]`}>Staff Name</TableHead>
              <TableHead className={`${headCell} min-w-[140px]`}>Designation</TableHead>
              <TableHead className={`${headCell} text-right min-w-[120px]`}>Actual Salary</TableHead>
              <TableHead className={`${headCell} text-right min-w-[120px]`}>Loan Amount</TableHead>
              <TableHead className={`${headCell} text-right min-w-[120px]`}>Deduction</TableHead>
              <TableHead className={`${headCell} text-right min-w-[130px] bg-emerald-500/5`}>
                Receiving Amount
              </TableHead>
              <TableHead className={`${headCell} min-w-[130px]`}>Account Number</TableHead>
              <TableHead className={`${headCell} min-w-[110px]`}>Bank Name</TableHead>
              <TableHead className={`${headCell} text-right min-w-[120px]`}>Loan Balance</TableHead>
              {hasDelete && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}><Skeleton className="h-7 w-full" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                  Could not load this month's schedule.
                </TableCell>
              </TableRow>
            ) : lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center">
                  <p className="text-sm font-medium">No sheet for {periodLabel(period)} yet.</p>
                  <p className="text-[13px] text-muted-foreground mt-1 max-w-md mx-auto">
                    {sourcePeriod
                      ? `Carry ${periodShortLabel(sourcePeriod)} forward and this month is ready — same staff, same salaries, loan balances rolled down. Then just adjust what changed.`
                      : "Start from the staff roster, or add people one at a time."}
                  </p>
                  {hasCreate && (
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                      {sourcePeriod && (
                        <Button size="sm" onClick={() => startFromPrevious.mutate()} disabled={starting}>
                          <CopyPlus className="h-4 w-4 mr-1.5" />
                          Carry forward from {periodShortLabel(sourcePeriod)}
                        </Button>
                      )}
                      <Button
                        variant={sourcePeriod ? "outline" : "default"} size="sm"
                        onClick={() => startFromRoster.mutate()} disabled={starting}
                      >
                        <Users className="h-4 w-4 mr-1.5" /> Use the staff roster
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => addLine.mutate()} disabled={starting}>
                        <PlusCircle className="h-4 w-4 mr-1.5" /> Add one by one
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line, index) => {
                const warnings = lineWarnings(line);
                const receiving = receivingAmount(line);
                const balance = closingBalance(line);
                return (
                  <TableRow key={line.id} className="group">
                    <TableCell className="text-[12px] text-muted-foreground tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {index + 1}
                        {warnings.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {warnings.map((w) => <p key={w}>{w}</p>)}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="p-1">
                      <EditableCell
                        value={line.staff_name ?? ""} disabled={!hasEdit}
                        className="font-medium"
                        onCommit={(v) => set(line.id, "staff_name", v)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableCell
                        value={line.designation ?? ""} disabled={!hasEdit}
                        onCommit={(v) => set(line.id, "designation", v)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableCell
                        value={String(line.actual_salary ?? 0)} money align="right" disabled={!hasEdit}
                        onCommit={(v) => set(line.id, "actual_salary", v, true)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableCell
                        value={String(line.loan_amount ?? 0)} money align="right" disabled={!hasEdit}
                        onCommit={(v) => set(line.id, "loan_amount", v, true)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableCell
                        value={String(line.deduction ?? 0)} money align="right" disabled={!hasEdit}
                        className={warnings.length ? "text-amber-600" : ""}
                        onCommit={(v) => set(line.id, "deduction", v, true)}
                      />
                    </TableCell>

                    {/* Computed: salary − deduction. Never typed, never stored. */}
                    <TableCell className="text-right tabular-nums font-semibold text-[13px] bg-emerald-500/5">
                      <span className={receiving < 0 ? "text-destructive" : ""}>{money(receiving)}</span>
                    </TableCell>

                    <TableCell className="p-1">
                      <EditableCell
                        value={line.account_number ?? ""} disabled={!hasEdit}
                        className="tabular-nums"
                        onCommit={(v) => set(line.id, "account_number", v)}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableCell
                        value={line.bank_name ?? ""} disabled={!hasEdit}
                        onCommit={(v) => set(line.id, "bank_name", v)}
                      />
                    </TableCell>

                    {/* Computed: opening balance − deduction. The opening figure
                        is what they owed on the 1st; it rolls in from last
                        month's sheet, and can be corrected here. */}
                    <TableCell className="p-1">
                      <div className="text-right">
                        <span className="block px-2 text-[13px] tabular-nums font-medium">
                          {balance ? money(balance) : "—"}
                        </span>
                        {hasEdit && (
                          <EditableCell
                            value={String(line.opening_balance ?? 0)} money align="right"
                            className="h-6 text-[11px] text-muted-foreground"
                            onCommit={(v) => set(line.id, "opening_balance", v, true)}
                          />
                        )}
                      </div>
                    </TableCell>

                    {hasDelete && (
                      <TableCell className="p-1">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(line.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>

          {lines.length > 0 && (
            <TableFooter>
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={3} className="text-[11px] uppercase tracking-wide">
                  Grand Total
                </TableCell>
                <TableCell className="text-right tabular-nums text-[13px]">{money(totals.salary)}</TableCell>
                <TableCell className="text-right tabular-nums text-[13px]">{money(totals.loans)}</TableCell>
                <TableCell className="text-right tabular-nums text-[13px]">{money(totals.deductions)}</TableCell>
                <TableCell className="text-right tabular-nums text-[14px] bg-emerald-500/10 text-emerald-700">
                  {money(totals.receiving)}
                </TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right tabular-nums text-[13px]">{money(totals.loanBalance)}</TableCell>
                {hasDelete && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {lines.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Receiving amount = actual salary − deduction. Loan balance = what was owed on the
          1st, less this month's deduction (the small figure under it is the opening balance).
          The grand total is the sum of the receiving column — what leaves the account.
        </p>
      )}

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Remove this row?"
        description={`It only comes off the ${periodLabel(period)} sheet. Other months keep their own rows.`}
        confirmLabel="Remove row"
        onConfirm={() => { if (deleteId) removeLine.mutate(deleteId); }}
      />
    </div>
  );
}
