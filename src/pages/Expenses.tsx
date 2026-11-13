import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, CopyPlus, Download, FileSpreadsheet, FileText, Layers, Pencil, PlusCircle,
  Receipt, Search, Trash2, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/exportHelpers";
import { DocumentToolbar } from "@/components/DocumentToolbar";
import { PrintSheet } from "@/components/PrintSheet";
import { ExpenseSheetDocument } from "@/components/ExpenseSheetDocument";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { logAction } from "@/lib/logger";
import { formatNaira } from "@/lib/numberToWords";
import {
  carryGroupsForward, expenseAmount, groupCount, groupMatches, groupShare,
  groupTotal, monthTotals, numberedItems, sortedGroups,
  type ExpenseGroup, type ExpenseItem,
} from "@/lib/expenses";
import {
  dateToPeriod, latestPeriodBefore, nextPeriod, periodKey, periodLabel,
  periodOptions, periodShortLabel, periodToDate, previousPeriod,
} from "@/lib/periods";

const PAGE_KEY = "expenses" as const;
const ENTITY = "Expense Group";

const GROUP_SELECT =
  "id, period, name, notes, sort_order, " +
  "expense_items(id, group_id, description, amount, spent_on, paid_to, payment_method, reference, notes, sort_order)";

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "POS", "Cheque", "Mobile"];

/** A blank entry. Every group starts with one, because a group with no entry costs nothing. */
const blankItem = (sort_order: number): ExpenseItem => ({
  description: "",
  amount: "",
  spent_on: "",
  paid_to: "",
  payment_method: "",
  reference: "",
  sort_order,
});

type Draft = {
  id: string | null;
  name: string;
  notes: string;
  items: ExpenseItem[];
};

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  notes: "",
  items: [blankItem(0)],
});

const StatTile = ({ label, value, sub, tone = "text-foreground" }: {
  label: string; value: string; sub?: string; tone?: string;
}) => (
  <div className="bento-card p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
  </div>
);

/**
 * The monthly expense sheet.
 *
 * Spending is recorded in **groups**: a group is one thing money went on —
 * fuel, office supplies, a particular repair — and inside it sit the numbered
 * entries that make it up. The editor opens with entry 1 and an "Add another
 * expense" button; the office keeps adding until the group is complete.
 *
 * Every total on the page is summed from the entries by `@/lib/expenses` and
 * none of them is stored, so the tiles, the group headers and the export can
 * never drift apart from each other or from the entries they describe.
 */
export default function Expenses() {
  const { user, role, profile } = useAuth();
  const { permissions } = usePermissions();
  const mayCreate = canCreate(role, PAGE_KEY, permissions);
  const mayEdit = canEdit(role, PAGE_KEY, permissions);
  const mayDelete = canDelete(role, PAGE_KEY, permissions);

  const [period, setPeriod] = useState(periodKey());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [deleteGroup, setDeleteGroup] = useState<ExpenseGroup | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  // Every month that has a sheet, so the picker can offer a month typed ahead
  // of time and "copy from" knows what there is to copy.
  const { data: knownPeriods = [] } = useQuery({
    queryKey: ["expense_periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_groups")
        .select("period")
        .order("period", { ascending: false });
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => dateToPeriod(r.period)))];
    },
  });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["expense_groups", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_groups")
        .select(GROUP_SELECT)
        .eq("period", periodToDate(period))
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseGroup[];
    },
  });

  const visible = useMemo(
    () => sortedGroups(groups).filter((g) => groupMatches(g, search)),
    [groups, search]
  );
  const totals = useMemo(() => monthTotals(groups), [groups]);
  const months = useMemo(() => periodOptions(knownPeriods), [knownPeriods]);
  const copyFrom = useMemo(
    () => latestPeriodBefore(period, knownPeriods),
    [period, knownPeriods]
  );

  const draftTotal = draft.items.reduce((sum, i) => sum + expenseAmount(i.amount), 0);

  // ── Editing ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (group: ExpenseGroup) => {
    setDraft({
      id: group.id ?? null,
      name: group.name,
      notes: group.notes ?? "",
      items: numberedItems(group).map(({ no, ...item }) => ({
        ...item,
        amount: item.amount != null ? String(item.amount) : "",
      })),
    });
    setDialogOpen(true);
  };

  const setItem = (index: number, patch: Partial<ExpenseItem>) =>
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const addItem = () =>
    setDraft((prev) => ({ ...prev, items: [...prev.items, blankItem(prev.items.length)] }));

  /** Removing an entry renumbers the rest — the sheet never shows a gap. */
  const removeItem = (index: number) =>
    setDraft((prev) => {
      const items = prev.items.filter((_, i) => i !== index);
      return {
        ...prev,
        items: (items.length ? items : [blankItem(0)]).map((item, i) => ({ ...item, sort_order: i })),
      };
    });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const groupRow = {
        period: periodToDate(period),
        name: draft.name.trim(),
        notes: draft.notes.trim() || null,
        sort_order: draft.id
          ? (groups.find((g) => g.id === draft.id)?.sort_order ?? 0)
          : groups.length,
        created_by: user?.id ?? null,
      };

      let groupId = draft.id;
      if (groupId) {
        const { error } = await supabase
          .from("expense_groups").update(groupRow).eq("id", groupId);
        if (error) throw error;
        await logAction("UPDATE", ENTITY, groupId);
      } else {
        const { data, error } = await supabase
          .from("expense_groups").insert(groupRow).select("id").single();
        if (error) throw error;
        groupId = data.id;
        await logAction("CREATE", ENTITY, groupId);
      }

      // Entries are deleted and re-inserted: the simplest correct path when a
      // row can be added, edited, removed and reordered in one sitting.
      await supabase.from("expense_items").delete().eq("group_id", groupId as string);

      const rows = draft.items
        .filter((i) => (i.description || "").trim() || expenseAmount(i.amount) > 0)
        .map((item, index) => ({
          group_id: groupId as string,
          description: (item.description || "").trim() || null,
          amount: expenseAmount(item.amount),
          spent_on: item.spent_on || null,
          paid_to: (item.paid_to || "").trim() || null,
          payment_method: (item.payment_method || "").trim() || null,
          reference: (item.reference || "").trim() || null,
          notes: (item.notes || "").trim() || null,
          sort_order: index,
        }));

      if (rows.length) {
        const { error } = await supabase.from("expense_items").insert(rows);
        if (error) throw error;
      }

      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["expense_groups"] });
      queryClient.invalidateQueries({ queryKey: ["expense_periods"] });
      setDialogOpen(false);
      toast.success(
        draft.id
          ? "Expense group updated"
          : `Expense group saved with ${count} ${count === 1 ? "entry" : "entries"}`
      );
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save the expense group"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (group: ExpenseGroup) => {
      // expense_items cascade with the group
      const { error } = await supabase.from("expense_groups").delete().eq("id", group.id!);
      if (error) throw error;
      await logAction("DELETE", ENTITY, group.id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_groups"] });
      queryClient.invalidateQueries({ queryKey: ["expense_periods"] });
      setDeleteGroup(null);
      toast.success("Expense group deleted");
    },
    onError: () => toast.error("Failed to delete the expense group"),
  });

  /** Last month's group names, each with one blank entry. Amounts never copy. */
  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!copyFrom) throw new Error("There is no earlier month to copy from");

      const { data, error } = await supabase
        .from("expense_groups")
        .select(GROUP_SELECT)
        .eq("period", periodToDate(copyFrom))
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const skeleton = carryGroupsForward((data ?? []) as unknown as ExpenseGroup[]);
      if (!skeleton.length) throw new Error(`${periodShortLabel(copyFrom)} has no groups to copy`);

      const { error: insertError } = await supabase.from("expense_groups").insert(
        skeleton.map((g) => ({
          period: periodToDate(period),
          name: g.name,
          notes: g.notes ?? null,
          sort_order: g.sort_order ?? 0,
          created_by: user?.id ?? null,
        }))
      );
      if (insertError) throw insertError;
      return skeleton.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["expense_groups"] });
      queryClient.invalidateQueries({ queryKey: ["expense_periods"] });
      toast.success(`Copied ${count} group${count === 1 ? "" : "s"} — the amounts are yours to fill in`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not copy the groups"),
  });

  const exportMonth = () => {
    const rows = sortedGroups(groups).flatMap((group) =>
      numberedItems(group).map((item) => ({
        Group: group.name,
        No: item.no,
        Description: item.description || "",
        Amount: expenseAmount(item.amount),
        Date: item.spent_on || "",
        "Paid to": item.paid_to || "",
        Method: item.payment_method || "",
        Reference: item.reference || "",
      }))
    );
    if (!rows.length) {
      toast.error("Nothing to export for this month");
      return;
    }
    exportToCSV(rows, `expenses-${period}`);
    logAction("EXPORT", ENTITY, undefined, { period, rows: rows.length });
  };

  const canSave = !!draft.name.trim() && !saveMutation.isPending;

  // ── Letterhead statement: preview, PDF / PNG / JPEG, print ────────────────
  if (showSheet) {
    return (
      <div className="animate-fade-in">
        <DocumentToolbar
          documentRef={sheetRef}
          filename={`expenses-${period}`}
          entity={ENTITY}
          backLabel="Back to Expenses"
          accentClass="bg-rose-500 hover:bg-rose-600 shadow-rose-500/20"
          onBack={() => setShowSheet(false)}
        />
        <PrintSheet ref={sheetRef}>
          <ExpenseSheetDocument period={period} groups={groups} preparedBy={profile?.display_name ?? null} />
        </PrintSheet>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-rose-500/10 shrink-0">
            <Receipt className="h-6 w-6 text-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground mt-1">
              What the office spent in {periodLabel(period)}, grouped by what it went on.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-white/10 bg-background/50">
            <Button
              variant="ghost" size="icon" aria-label="Previous month"
              onClick={() => setPeriod(previousPeriod(period))}
              className="h-10 w-9 rounded-l-xl"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger aria-label="Month" className="h-10 w-[150px] border-0 bg-transparent text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-panel border-white/10 rounded-xl max-h-72">
                {months.map((m) => (
                  <SelectItem key={m} value={m} className="text-sm">{periodShortLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost" size="icon" aria-label="Next month"
              onClick={() => setPeriod(nextPeriod(period))}
              className="h-10 w-9 rounded-r-xl"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl border-white/10 hover:bg-white/5">
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel border-white/10 rounded-xl">
              <DropdownMenuItem onClick={() => setShowSheet(true)} className="cursor-pointer">
                <FileText className="h-4 w-4 mr-2" /> Statement — PDF, PNG, JPEG or print
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMonth} className="cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Spreadsheet (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {mayCreate && copyFrom && groups.length === 0 && (
            <Button
              variant="outline"
              onClick={() => copyMutation.mutate()}
              disabled={copyMutation.isPending}
              className="rounded-xl border-white/10 hover:bg-white/5"
            >
              <CopyPlus className="h-4 w-4 mr-2" />
              Copy {periodShortLabel(copyFrom)} groups
            </Button>
          )}

          {mayCreate && (
            <Button onClick={openCreate}
              className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white border-0 shadow-lg shadow-rose-500/20">
              <PlusCircle className="h-4 w-4 mr-2" /> New Expense Group
            </Button>
          )}
        </div>
      </div>

      {/* ── Tiles ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total spent"
          value={formatNaira(totals.total)}
          sub={periodLabel(period)}
          tone="text-rose-500"
        />
        <StatTile label="Expense groups" value={String(totals.groups)} />
        <StatTile label="Entries" value={String(totals.entries)} sub="Across every group" />
        <StatTile
          label="Largest group"
          value={totals.largest ? formatNaira(totals.largest.total) : "—"}
          sub={totals.largest?.name ?? "Nothing recorded yet"}
        />
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <div className="glass-panel rounded-2xl border border-white/5 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search a group, an entry, who it was paid to..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 rounded-xl bg-background/50 border-white/10"
            />
          </div>
        </div>
      )}

      {/* ── The month ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center text-center">
          <div className="bg-rose-500/10 p-5 rounded-full mb-4">
            <Wallet className="h-9 w-9 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">Nothing recorded for {periodLabel(period)}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Start a group for the first thing money went on — fuel, office supplies, a repair —
            then add expense 1, 2, 3 and as many more as it takes.
          </p>
          {mayCreate && (
            <Button onClick={openCreate}
              className="mt-5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white border-0">
              <PlusCircle className="h-4 w-4 mr-2" /> New Expense Group
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="bento-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing in {periodLabel(period)} matches “{search}”.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((group) => {
            const total = groupTotal(group);
            const share = groupShare(group, groups);
            return (
              <div key={group.id} className="bento-card overflow-hidden">
                {/* Group header */}
                <div className="p-5 flex flex-wrap items-start justify-between gap-4 border-b border-white/5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-rose-500 shrink-0" />
                      <h3 className="font-bold text-base truncate">{group.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {groupCount(group)} {groupCount(group) === 1 ? "entry" : "entries"}
                      {totals.total > 0 && ` · ${share.toFixed(0)}% of the month`}
                    </p>
                    {group.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{group.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-bold tabular-nums">{formatNaira(total)}</p>
                    {mayEdit && (
                      <Button variant="ghost" size="icon" aria-label={`Edit ${group.name}`}
                        onClick={() => openEdit(group)}
                        className="h-8 w-8 rounded-lg hover:bg-foreground/10">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {mayDelete && (
                      <Button variant="ghost" size="icon" aria-label={`Delete ${group.name}`}
                        onClick={() => setDeleteGroup(group)}
                        className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Its numbered entries */}
                {groupCount(group) === 0 ? (
                  <div className="p-5 text-center">
                    <p className="text-xs text-muted-foreground">
                      No entries yet{mayEdit ? " — open the group to add expense 1." : "."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {numberedItems(group).map((item) => (
                      <div key={item.id ?? item.no}
                        className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02]">
                        <span className="shrink-0 h-6 w-6 rounded-md bg-rose-500/10 text-rose-500 text-[11px] font-bold grid place-items-center">
                          {item.no}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {item.description || "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[
                              item.spent_on,
                              item.paid_to && `to ${item.paid_to}`,
                              item.payment_method,
                              item.reference && `ref ${item.reference}`,
                            ].filter(Boolean).join(" · ") || "No details"}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatNaira(expenseAmount(item.amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* The month's total, under everything, as a sheet carries it */}
          <div className="bento-card p-5 flex items-center justify-between gap-4 border-rose-500/20">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total for {periodLabel(period)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totals.groups} group{totals.groups === 1 ? "" : "s"} · {totals.entries}{" "}
                {totals.entries === 1 ? "entry" : "entries"}
              </p>
            </div>
            <p className="text-3xl font-bold text-rose-500 tabular-nums">
              {formatNaira(totals.total)}
            </p>
          </div>
        </div>
      )}

      {/* ── The editor ──────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-panel border-white/10 rounded-3xl max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Edit expense group" : "New expense group"}
            </DialogTitle>
            <DialogDescription>
              One group is one thing the money went on. Add as many expenses inside it as you need.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="groupName" className="text-xs text-muted-foreground">
                  Group name *
                </Label>
                <Input
                  id="groupName"
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Fuel, Office supplies, Car stand repairs..."
                  className="rounded-xl h-11 bg-background/50 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupNotes" className="text-xs text-muted-foreground">
                  Note (optional)
                </Label>
                <Input
                  id="groupNotes"
                  value={draft.notes}
                  onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                  className="rounded-xl h-11 bg-background/50 border-white/10"
                />
              </div>
            </div>

            {/* The numbered entries */}
            <div className="space-y-3">
              {draft.items.map((item, index) => (
                <div key={index} className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-500">
                      Expense {index + 1}
                    </p>
                    {draft.items.length > 1 && (
                      <Button
                        variant="ghost" size="icon"
                        aria-label={`Remove expense ${index + 1}`}
                        onClick={() => removeItem(index)}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">What it was for</Label>
                      <Input
                        aria-label={`Expense ${index + 1} description`}
                        value={item.description ?? ""}
                        onChange={(e) => setItem(index, { description: e.target.value })}
                        placeholder="Diesel for the generator"
                        className="rounded-xl h-10 bg-background/50 border-white/10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Amount (₦)</Label>
                      <CurrencyInput
                        aria-label={`Expense ${index + 1} amount`}
                        value={String(item.amount ?? "")}
                        onChange={(e) => setItem(index, { amount: e.target.value })}
                        placeholder="0"
                        className="rounded-xl h-10 bg-background/50 border-white/10 font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Date spent</Label>
                      <Input
                        type="date"
                        aria-label={`Expense ${index + 1} date`}
                        value={item.spent_on ?? ""}
                        onChange={(e) => setItem(index, { spent_on: e.target.value })}
                        className="rounded-xl h-10 bg-background/50 border-white/10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Paid to</Label>
                      <Input
                        aria-label={`Expense ${index + 1} paid to`}
                        value={item.paid_to ?? ""}
                        onChange={(e) => setItem(index, { paid_to: e.target.value })}
                        className="rounded-xl h-10 bg-background/50 border-white/10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Method</Label>
                      <Select
                        value={item.payment_method || ""}
                        onValueChange={(v) => setItem(index, { payment_method: v })}
                      >
                        <SelectTrigger
                          aria-label={`Expense ${index + 1} method`}
                          className="rounded-xl h-10 bg-background/50 border-white/10"
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent className="glass-panel border-white/10 rounded-xl">
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">
                        Receipt / transfer reference
                      </Label>
                      <Input
                        aria-label={`Expense ${index + 1} reference`}
                        value={item.reference ?? ""}
                        onChange={(e) => setItem(index, { reference: e.target.value })}
                        className="rounded-xl h-10 bg-background/50 border-white/10"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                onClick={addItem}
                className="w-full rounded-xl border-dashed border-white/15 hover:bg-white/5"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Add expense {draft.items.length + 1}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-500">
                Group total
              </p>
              <p className="text-2xl font-bold tabular-nums">{formatNaira(draftTotal)}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}
                className="rounded-xl border-white/10 hover:bg-white/5">
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave}
                className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white border-0"
              >
                {saveMutation.isPending
                  ? "Saving..."
                  : draft.id ? "Save changes" : "Save expense group"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGroup} onOpenChange={() => setDeleteGroup(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteGroup?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {deleteGroup ? groupCount(deleteGroup) : 0} entries, worth{" "}
              {formatNaira(deleteGroup ? groupTotal(deleteGroup) : 0)}, go with it.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroup && deleteMutation.mutate(deleteGroup)}
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
