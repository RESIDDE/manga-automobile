import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Archive, ArrowLeft, Download, Eye, FileImage, FileSpreadsheet, FileText, Filter, Loader2, Lock,
  Printer, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMPANY_COPY, archiveSrcDoc, type ArchiveRecord } from "@/lib/archive";
import { captureDocumentElement, captureOptions, saveBlob, type DocFormat } from "@/lib/documentExport";
import { exportToCSV } from "@/lib/exportHelpers";
import { logAction } from "@/lib/logger";
import { cn } from "@/lib/utils";

const db = supabase as any;
const PAGE_SIZE = 25;
const BULK_LIMIT = 100;
const LIST_COLUMNS =
  "id, doc_type, title, doc_number, doc_date, person_name, person_phone, person_nin, vehicle_summary, html_kind, details, action, created_by_name, created_at";

type Filters = {
  q: string;
  type: string;
  person: string;
  by: string;
  dateField: "doc_date" | "created_at";
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { q: "", type: "all", person: "", by: "all", dateField: "doc_date", from: "", to: "" };

/** Applies the filters to a document_archive query. Every word of the search must match. */
function applyFilters(query: any, f: Filters) {
  let q = query;
  for (const word of f.q.toLowerCase().split(/\s+/).filter(Boolean)) {
    q = q.ilike("search_text", `%${word.replace(/[%_]/g, "")}%`);
  }
  if (f.type !== "all") q = q.eq("doc_type", f.type);
  if (f.person.trim()) q = q.ilike("person_name", `%${f.person.trim().replace(/[%_]/g, "")}%`);
  if (f.by !== "all") q = q.eq("created_by_name", f.by);
  if (f.from) q = q.gte(f.dateField, f.dateField === "created_at" ? `${f.from}T00:00:00` : f.from);
  if (f.to) q = q.lte(f.dateField, f.dateField === "created_at" ? `${f.to}T23:59:59.999` : f.to);
  return q;
}

const fmtDate = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy") : "—");

/** Tab order: the main documents first, anything else after, alphabetically. */
const TAB_ORDER = [
  "Receipt", "Sales Agreement", "Consignment Agreement", "Proforma Invoice",
  "Property Intake", "Sales Report", "Expense Statement",
];
const tabLabel = (type: string) => (type.endsWith("y") ? `${type.slice(0, -1)}ies` : type.endsWith("s") ? type : `${type}s`);

function CompanyCopyTag() {
  return (
    <span className="rounded-full border border-rose-500/50 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-[0.14em] px-2 py-0.5">
      {COMPANY_COPY}
    </span>
  );
}

// ─── Rendering an archived copy ─────────────────────────────────────────────

/** Loads an archived copy into a sandboxed iframe and resolves once it has rendered. */
function loadFrame(frame: HTMLIFrameElement, record: ArchiveRecord, includeDetails: boolean): Promise<Document> {
  return new Promise((resolve, reject) => {
    const done = () => {
      const doc = frame.contentDocument;
      if (!doc) return reject(new Error("Could not open the archived copy"));
      resolve(doc);
    };
    frame.onload = done;
    frame.srcdoc = archiveSrcDoc(record, includeDetails);
  });
}

/** The node to capture: the sheets for app documents, the whole page for older printouts. */
const captureRoot = (doc: Document, record: ArchiveRecord): HTMLElement =>
  (record.html_kind === "sheet" ? doc.querySelector<HTMLElement>(".archive-wrap") : null) ?? doc.body;

function ArchiveViewer({ record, onBack }: { record: ArchiveRecord; onBack: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [height, setHeight] = useState(1200);
  const [busy, setBusy] = useState(false);

  const { data: full, isLoading } = useQuery({
    queryKey: ["document-archive", "record", record.id],
    staleTime: Infinity,
    queryFn: async (): Promise<ArchiveRecord> => {
      const { data, error } = await db.from("document_archive").select("*").eq("id", record.id).single();
      if (error) throw error;
      return data;
    },
  });

  const srcDoc = useMemo(() => (full ? archiveSrcDoc(full, includeDetails) : ""), [full, includeDetails]);
  const file = `${record.doc_type}-${record.doc_number || record.id.slice(0, 8)}`.replace(/[^\w.-]+/g, "_").toLowerCase();

  const download = async (fmt: DocFormat) => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !full) return;
    setBusy(true);
    try {
      const blob = await captureDocumentElement(captureRoot(doc, full), fmt);
      saveBlob(blob, file, fmt);
      logAction("EXPORT", "Document Archive", record.id, { format: fmt });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't create the file");
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    frameRef.current?.contentWindow?.print();
    logAction("PRINT", "Document Archive", record.id);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} className="rounded-xl"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Archive</Button>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm mr-2">
            <Switch checked={includeDetails} onCheckedChange={setIncludeDetails} />
            Include record details page
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl" disabled={busy || isLoading}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={() => download("pdf")} className="cursor-pointer"><FileText className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => download("png")} className="cursor-pointer"><FileImage className="h-4 w-4 mr-2" /> PNG</DropdownMenuItem>
              <DropdownMenuItem onClick={() => download("jpeg")} className="cursor-pointer"><FileImage className="h-4 w-4 mr-2" /> JPEG</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={print} disabled={isLoading} className="rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
        <CompanyCopyTag />
        <span className="flex items-center gap-1.5 font-semibold"><Lock className="h-4 w-4 text-amber-500" /> Permanent record — cannot be edited or deleted</span>
        <span className="text-muted-foreground">{record.doc_type}{record.doc_number ? ` · No. ${record.doc_number}` : ""}</span>
        <span className="text-muted-foreground">Archived {format(new Date(record.created_at), "dd MMM yyyy, HH:mm")}{record.created_by_name ? ` by ${record.created_by_name}` : ""}</span>
      </div>

      {isLoading ? (
        <Skeleton className="h-[80vh] w-full rounded-2xl" />
      ) : (
        <div className="rounded-2xl border overflow-auto bg-neutral-200">
          <iframe
            ref={frameRef}
            title={record.title}
            // No scripts can run in an archived copy, whatever it contains
            sandbox="allow-same-origin allow-modals"
            srcDoc={srcDoc}
            onLoad={(e) => {
              const doc = e.currentTarget.contentDocument;
              if (doc) setHeight(Math.max(600, doc.documentElement.scrollHeight + 24));
            }}
            className="block mx-auto bg-white"
            style={{ width: "max(100%, 230mm)", height, border: 0 }}
          />
        </div>
      )}
    </div>
  );
}

// ─── The archive list ───────────────────────────────────────────────────────

export default function DocumentArchive() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<ArchiveRecord | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const bulkFrame = useRef<HTMLIFrameElement>(null);

  const { data: facets } = useQuery({
    queryKey: ["document-archive", "facets"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("document_archive")
        .select("doc_type, created_by_name").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as { doc_type: string; created_by_name: string | null }[];
      const counts: Record<string, number> = {};
      rows.forEach((r) => { counts[r.doc_type] = (counts[r.doc_type] ?? 0) + 1; });
      const rank = (t: string) => (TAB_ORDER.includes(t) ? TAB_ORDER.indexOf(t) : TAB_ORDER.length);
      return {
        types: Object.keys(counts).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
        counts,
        total: rows.length,
        people: [...new Set(rows.map((r) => r.created_by_name).filter(Boolean) as string[])].sort(),
      };
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["document-archive", "list", filters, page],
    staleTime: 15_000,
    queryFn: async () => {
      const q = applyFilters(db.from("document_archive").select(LIST_COLUMNS, { count: "exact" }), filters)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as ArchiveRecord[], count: (count ?? 0) as number };
    },
  });

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activeFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const apply = (next = draft) => { setFilters(next); setPage(0); };
  const clear = () => { setDraft(EMPTY_FILTERS); apply(EMPTY_FILTERS); };

  /** Index of everything matching, as a spreadsheet. */
  const downloadList = async () => {
    const { data, error } = await applyFilters(
      db.from("document_archive").select(LIST_COLUMNS.replace(", details", "")), filters,
    ).order("created_at", { ascending: false }).limit(5000);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Nothing matches the filters");
    exportToCSV(data.map((r: any) => ({
      "Document date": r.doc_date ?? "",
      Type: r.doc_type,
      Number: r.doc_number ?? "",
      Title: r.title,
      Person: r.person_name ?? "",
      Phone: r.person_phone ?? "",
      NIN: r.person_nin ?? "",
      Vehicle: r.vehicle_summary ?? "",
      "Archived on": format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      "Archived by": r.created_by_name ?? "",
    })), `document-archive-${format(new Date(), "yyyy-MM-dd")}`);
    logAction("EXPORT", "Document Archive", undefined, { format: "csv", rows: data.length });
  };

  /** Every matching document, each on its own A4 page(s), in one PDF. */
  const downloadAllPdf = async (includeDetails: boolean) => {
    if (!count) return toast.error("Nothing matches the filters");
    if (count > BULK_LIMIT) {
      return toast.error(`${count} documents match — narrow the filters to ${BULK_LIMIT} or fewer for one PDF`);
    }
    const frame = bulkFrame.current;
    if (!frame) return;
    setBulk({ done: 0, total: count });
    try {
      const { data, error } = await applyFilters(db.from("document_archive").select("*"), filters)
        .order("doc_date", { ascending: true }).limit(BULK_LIMIT);
      if (error) throw error;
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
      const W = 595.28, H = 841.89;
      let first = true;

      for (let i = 0; i < data.length; i++) {
        const record = data[i] as ArchiveRecord;
        const doc = await loadFrame(frame, record, includeDetails);
        await new Promise((r) => setTimeout(r, 150)); // let fonts and images settle
        const sheets = Array.from(doc.querySelectorAll<HTMLElement>(".print-document-page"));
        const parts = record.html_kind === "sheet" && sheets.length ? sheets : [doc.body];
        for (const part of parts) {
          const canvas = await html2canvas(part, captureOptions(part));
          if (!first) pdf.addPage("a4", "portrait");
          first = false;
          let w = W, h = (canvas.height * W) / canvas.width;
          if (h > H) { h = H; w = (canvas.width * H) / canvas.height; }
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", (W - w) / 2, 0, w, h);
        }
        setBulk({ done: i + 1, total: data.length });
      }
      saveBlob(pdf.output("blob"), `document-archive-${format(new Date(), "yyyy-MM-dd")}`, "pdf");
      logAction("EXPORT", "Document Archive", undefined, { format: "pdf-bundle", documents: data.length });
      toast.success(`Saved ${data.length} documents in one PDF`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Couldn't build the PDF");
    } finally {
      setBulk(null);
    }
  };

  if (open) return <ArchiveViewer record={open} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-indigo-500/10 shrink-0"><Archive className="h-6 w-6 text-indigo-500" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Document Archive</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Every document printed or downloaded, kept permanently. Nothing here can be edited or deleted.
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="rounded-xl" disabled={!!bulk}>
              {bulk ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {bulk ? `Building PDF ${bulk.done}/${bulk.total}…` : `Download ${activeFilters ? "results" : "all"}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl w-72">
            <DropdownMenuItem onClick={() => downloadAllPdf(true)} className="cursor-pointer">
              <FileText className="h-4 w-4 mr-2" /> Documents + record details (one PDF)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadAllPdf(false)} className="cursor-pointer">
              <FileText className="h-4 w-4 mr-2" /> Documents only (one PDF)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadList} className="cursor-pointer">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> List of documents (CSV)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── One tab per kind of document ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {[["all", "All documents", facets?.total], ...(facets?.types ?? []).map((t) => [t, tabLabel(t), facets?.counts[t]])].map(
          ([value, text, n]) => (
            <button
              key={value as string}
              type="button"
              onClick={() => { const next = { ...draft, type: value as string }; setDraft(next); apply(next); }}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                filters.type === value ? "bg-indigo-500 text-white" : "bg-foreground/5 text-muted-foreground hover:text-foreground",
              )}
            >
              {text as string}
              {typeof n === "number" && <span className="ml-1.5 opacity-70">{n}</span>}
            </button>
          ),
        )}
      </div>

      {/* ── Search & filters ── */}
      <form
        className="rounded-3xl border bg-card p-4 space-y-4"
        onSubmit={(e) => { e.preventDefault(); apply(); }}
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search anything: name, phone, NIN, chassis, plate, receipt or form number, amount…"
              className="pl-9 rounded-xl h-11"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </div>
          <Button type="submit" className="rounded-xl h-11">Search</Button>
          <Button type="button" variant="outline" className="rounded-xl h-11" onClick={() => setShowAdvanced((v) => !v)}>
            <Filter className="h-4 w-4 mr-2" /> Advanced
          </Button>
          {activeFilters && (
            <Button type="button" variant="ghost" className="rounded-xl h-11" onClick={clear}><X className="h-4 w-4 mr-1" /> Clear</Button>
          )}
        </div>

        {showAdvanced && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Customer / person</Label>
              <Input className="rounded-xl" placeholder="Name on the document" value={draft.person}
                onChange={(e) => setDraft({ ...draft, person: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Printed by</Label>
              <Select value={draft.by} onValueChange={(v) => setDraft({ ...draft, by: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Anyone</SelectItem>
                  {facets?.people.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date is</Label>
              <Select value={draft.dateField} onValueChange={(v: any) => setDraft({ ...draft, dateField: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="doc_date">The date on the document</SelectItem>
                  <SelectItem value="created_at">The day it was printed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" className="rounded-xl" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" className="rounded-xl" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </div>
          </div>
        )}
      </form>

      {/* ── Results ── */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{isLoading ? "Searching…" : `${count.toLocaleString()} document${count === 1 ? "" : "s"}`}</span>
        {pages > 1 && <span>Page {page + 1} of {pages}</span>}
      </div>

      {error && <p className="text-sm text-destructive">Couldn't load the archive: {(error as Error).message}</p>}

      <div className="rounded-3xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Archive className="h-10 w-10 mx-auto mb-3 opacity-40" />
            {activeFilters ? "No documents match." : "No documents yet. Every document printed or downloaded from now on appears here."}
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpen(r)}
                className="w-full text-left px-4 py-3 grid gap-1 sm:grid-cols-[110px_1fr_auto] sm:items-center hover:bg-accent/50 transition-colors"
              >
                <span className="text-xs font-semibold text-muted-foreground">{fmtDate(r.doc_date)}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-indigo-500/10 text-indigo-600 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">{r.doc_type}</span>
                    <CompanyCopyTag />
                    {r.doc_number && <span className="text-xs font-mono text-muted-foreground">No. {r.doc_number}</span>}
                  </span>
                  <span className="block font-semibold truncate mt-0.5">{r.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {[r.person_name, r.person_phone, r.person_nin && `NIN ${r.person_nin}`, r.vehicle_summary].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground sm:justify-end">
                  <span className="text-right">
                    {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                    {r.created_by_name && <span className="block">by {r.created_by_name}</span>}
                  </span>
                  <Eye className="h-4 w-4 shrink-0" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" className="rounded-xl" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="outline" className="rounded-xl" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Off-screen frame the bulk PDF renders each document in */}
      <iframe
        ref={bulkFrame}
        title="archive-render"
        aria-hidden="true"
        tabIndex={-1}
        sandbox="allow-same-origin"
        className={cn("fixed -left-[10000px] top-0 border-0")}
        style={{ width: "230mm", height: "1200px" }}
      />
    </div>
  );
}
