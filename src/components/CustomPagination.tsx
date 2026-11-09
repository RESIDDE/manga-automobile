import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;                 // zero-based
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  sizes?: number[];
};

/** Page buttons plus a page-size select, shared by every document history list. */
export function CustomPagination({
  page, pageCount, pageSize, total, onPageChange, onPageSizeChange, sizes = [10, 20, 50],
}: Props) {
  if (total === 0) return null;

  // Window of at most 5 page buttons around the current page
  const start = Math.max(0, Math.min(page - 2, pageCount - 5));
  const windowed = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i);

  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 print:hidden">
      <p className="text-xs text-muted-foreground order-2 sm:order-1">
        Showing <span className="font-semibold text-foreground">{from}–{to}</span> of{" "}
        <span className="font-semibold text-foreground">{total}</span>
      </p>

      <div className="flex items-center gap-3 order-1 sm:order-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon" aria-label="Previous page"
            className="h-8 w-8 rounded-lg border-white/10"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {windowed.map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon"
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? "page" : undefined}
              className={`h-8 w-8 rounded-lg text-xs ${p === page ? "" : "border-white/10"}`}
              onClick={() => onPageChange(p)}
            >
              {p + 1}
            </Button>
          ))}
          <Button
            variant="outline" size="icon" aria-label="Next page"
            className="h-8 w-8 rounded-lg border-white/10"
            disabled={page >= pageCount - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] rounded-lg border-white/10 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-panel border-white/10 rounded-xl">
            {sizes.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs">{s} per page</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
