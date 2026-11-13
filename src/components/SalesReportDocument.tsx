import { format } from "date-fns";
import {
  BRAND_NAVY, MetaLabel, MODERN_FONT, ModernSignSlot, PrintHeader, PrintWatermark, ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { formatNaira } from "@/lib/numberToWords";

export type SalesReportRow = {
  id: string;
  saleNo: string;
  date: string | null;
  vehicle: string;
  customer: string;
  price: number;
  paid: number;
  balance: number;
};

/** Rows on the first sheet (it carries the letterhead and summary) and on each one after. */
const FIRST_PAGE_ROWS = 16;
const PAGE_ROWS = 26;

export function paginate<T>(rows: T[]): T[][] {
  if (rows.length <= FIRST_PAGE_ROWS) return [rows];
  const pages: T[][] = [rows.slice(0, FIRST_PAGE_ROWS)];
  for (let i = FIRST_PAGE_ROWS; i < rows.length; i += PAGE_ROWS) pages.push(rows.slice(i, i + PAGE_ROWS));
  return pages;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const p = new Date(d);
  return Number.isNaN(p.getTime()) ? d : format(p, "dd/MM/yyyy");
};

/**
 * A sales report on company letterhead, split into A4 sheets so a long list
 * prints and downloads as proper pages instead of one strip that gets cut off.
 * Each sheet is a `.print-document-page`: print starts each on a new page and
 * the PDF export makes each its own A4 page.
 */
export function SalesReportDocument({
  title, scope, rows, preparedBy,
}: { title: string; scope: string; rows: SalesReportRow[]; preparedBy?: string | null }) {
  const pages = paginate(rows);
  const total = rows.reduce((s, r) => s + r.price, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const balance = rows.reduce((s, r) => s + r.balance, 0);
  const generated = format(new Date(), "dd MMM yyyy, HH:mm");

  return (
    <>
      {pages.map((pageRows, pageIndex) => {
        const first = pageIndex === 0;
        const last = pageIndex === pages.length - 1;
        return (
          <div
            key={pageIndex}
            className={`print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[14mm] md:pb-[20mm] flex flex-col ${pageIndex ? "mt-6 print:mt-0" : ""}`}
            style={{ fontFamily: MODERN_FONT }}
          >
            <PrintWatermark />
            <div className="relative z-10 flex-1">
              {first ? (
                <>
                  <PrintHeader />
                  <div className="flex items-end justify-between gap-6 mt-2 mb-4 pb-2" style={{ borderBottom: `3px solid ${BRAND_NAVY}` }}>
                    <div>
                      <h1 className="text-[16px] font-black uppercase tracking-[0.14em] text-black">{title}</h1>
                      <p className="text-[10.5px] font-semibold text-neutral-600 mt-[2px]">{scope}</p>
                    </div>
                    <div className="text-right">
                      <MetaLabel>Generated</MetaLabel>
                      <p className="text-[10.5px] font-semibold text-black">{generated}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      ["Sales", String(rows.length)],
                      ["Total value", formatNaira(total)],
                      ["Received", formatNaira(paid)],
                      ["Outstanding", formatNaira(balance)],
                    ].map(([label, value]) => (
                      <div key={label} className="px-2.5 py-1.5 rounded-[3px]" style={{ border: ROW_RULE }}>
                        <MetaLabel>{label}</MetaLabel>
                        <p className="text-[12px] font-black text-black">{value}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-baseline justify-between pb-2 mb-3" style={{ borderBottom: RULE }}>
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-black">{title} (continued)</span>
                  <span className="text-[9.5px] text-neutral-600">{scope}</span>
                </div>
              )}

              {rows.length === 0 ? (
                <p className="text-[11px] text-neutral-500 text-center py-10">No sales match the selected filters.</p>
              ) : (
                <table className="w-full border-collapse text-[9.5px] text-black">
                  <thead>
                    <tr className="text-[7.5px] uppercase tracking-[0.12em] text-neutral-500">
                      {["Sale #", "Date", "Vehicle", "Customer", "Price", "Paid", "Balance"].map((h, i) => (
                        <th key={h} className={`py-1 ${i >= 4 ? "text-right" : "text-left"}`} style={{ borderBottom: RULE }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.id} style={{ breakInside: "avoid" }}>
                        <td className="py-[5px] pr-2 font-semibold whitespace-nowrap" style={{ borderBottom: ROW_RULE }}>{r.saleNo}</td>
                        <td className="py-[5px] pr-2 whitespace-nowrap" style={{ borderBottom: ROW_RULE }}>{fmtDate(r.date)}</td>
                        <td className="py-[5px] pr-2" style={{ borderBottom: ROW_RULE }}>{r.vehicle}</td>
                        <td className="py-[5px] pr-2" style={{ borderBottom: ROW_RULE }}>{r.customer}</td>
                        <td className="py-[5px] text-right font-semibold whitespace-nowrap" style={{ borderBottom: ROW_RULE }}>{formatNaira(r.price)}</td>
                        <td className="py-[5px] text-right whitespace-nowrap" style={{ borderBottom: ROW_RULE }}>{formatNaira(r.paid)}</td>
                        <td className="py-[5px] text-right whitespace-nowrap" style={{ borderBottom: ROW_RULE, color: r.balance > 0 ? "#b45309" : undefined }}>
                          {formatNaira(r.balance)}
                        </td>
                      </tr>
                    ))}
                    {last && (
                      <tr>
                        <td colSpan={4} className="pt-2 text-right text-[8.5px] font-black uppercase tracking-[0.12em]">Totals</td>
                        <td className="pt-2 text-right font-black whitespace-nowrap">{formatNaira(total)}</td>
                        <td className="pt-2 text-right font-black whitespace-nowrap">{formatNaira(paid)}</td>
                        <td className="pt-2 text-right font-black whitespace-nowrap">{formatNaira(balance)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {last && (
                <div className="grid grid-cols-2 gap-10 mt-10" style={{ breakInside: "avoid" }}>
                  <ModernSignSlot caption="Prepared by" name={preparedBy ?? ""} date="" />
                  <ModernSignSlot caption="Approved by" name="" date="" />
                </div>
              )}
            </div>
            <p className="relative z-10 pt-3 text-center text-[9px] font-semibold text-neutral-500">
              Page {pageIndex + 1} of {pages.length}
            </p>
          </div>
        );
      })}
    </>
  );
}
