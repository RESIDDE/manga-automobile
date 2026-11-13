import { format } from "date-fns";
import {
  BRAND_NAVY, DocSectionTitle, MetaLabel, MODERN_FONT, ModernSignSlot, PrintHeader, PrintWatermark,
  ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { formatNaira } from "@/lib/numberToWords";
import { expenseAmount, groupTotal, monthTotals, numberedItems, sortedGroups, type ExpenseGroup } from "@/lib/expenses";
import { periodLabel } from "@/lib/periods";

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : format(parsed, "dd/MM/yy");
};

/**
 * The month's expenses on company letterhead: logo, address, watermark, every
 * group with its numbered entries and subtotal, the month total, and sign-off
 * lines. The same sheet is previewed, printed and exported to PDF/PNG/JPEG.
 */
export function ExpenseSheetDocument({
  period, groups, preparedBy,
}: { period: string; groups: ExpenseGroup[]; preparedBy?: string | null }) {
  const ordered = sortedGroups(groups);
  const totals = monthTotals(groups);

  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[16mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        <PrintHeader />

        <div className="flex items-end justify-between gap-6 mt-2 mb-5 pb-2" style={{ borderBottom: `3px solid ${BRAND_NAVY}` }}>
          <div>
            <h1 className="text-[16px] font-black uppercase tracking-[0.14em] text-black">Expense Statement</h1>
            <p className="text-[11px] font-semibold text-neutral-600 mt-[2px]">{periodLabel(period)}</p>
          </div>
          <div className="text-right">
            <MetaLabel>Generated</MetaLabel>
            <p className="text-[10.5px] font-semibold text-black">{format(new Date(), "dd MMM yyyy, HH:mm")}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            ["Total spent", formatNaira(totals.total)],
            ["Groups", String(totals.groups)],
            ["Entries", String(totals.entries)],
          ].map(([label, value]) => (
            <div key={label} className="px-3 py-2 rounded-[3px]" style={{ border: ROW_RULE }}>
              <MetaLabel>{label}</MetaLabel>
              <p className="text-[13px] font-black text-black">{value}</p>
            </div>
          ))}
        </div>

        {ordered.length === 0 && (
          <p className="text-[11px] text-neutral-500 text-center py-10">No expenses recorded for this month.</p>
        )}

        {ordered.map((group) => {
          const items = numberedItems(group);
          return (
            <div key={group.id ?? group.name} className="mb-5" style={{ breakInside: "avoid" }}>
              <DocSectionTitle>{group.name}</DocSectionTitle>
              <table className="w-full border-collapse text-[10px] text-black">
                <thead>
                  <tr className="text-[8px] uppercase tracking-[0.12em] text-neutral-500">
                    <th className="text-left py-1 w-[24px]" style={{ borderBottom: RULE }}>No</th>
                    <th className="text-left py-1" style={{ borderBottom: RULE }}>Description</th>
                    <th className="text-left py-1 w-[56px]" style={{ borderBottom: RULE }}>Date</th>
                    <th className="text-left py-1 w-[110px]" style={{ borderBottom: RULE }}>Paid to</th>
                    <th className="text-left py-1 w-[70px]" style={{ borderBottom: RULE }}>Method</th>
                    <th className="text-right py-1 w-[90px]" style={{ borderBottom: RULE }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id ?? item.no}>
                      <td className="py-[5px] align-top" style={{ borderBottom: ROW_RULE }}>{item.no}</td>
                      <td className="py-[5px] align-top font-semibold" style={{ borderBottom: ROW_RULE }}>
                        {item.description || "—"}
                        {item.reference && <span className="block text-[8.5px] font-normal text-neutral-500">Ref: {item.reference}</span>}
                      </td>
                      <td className="py-[5px] align-top" style={{ borderBottom: ROW_RULE }}>{fmtDate(item.spent_on)}</td>
                      <td className="py-[5px] align-top" style={{ borderBottom: ROW_RULE }}>{item.paid_to || ""}</td>
                      <td className="py-[5px] align-top" style={{ borderBottom: ROW_RULE }}>{item.payment_method || ""}</td>
                      <td className="py-[5px] align-top text-right font-semibold" style={{ borderBottom: ROW_RULE }}>
                        {formatNaira(expenseAmount(item.amount))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="pt-[5px] text-right text-[9px] font-bold uppercase tracking-[0.1em]">Subtotal</td>
                    <td className="pt-[5px] text-right text-[11px] font-black">{formatNaira(groupTotal(group))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}

        {ordered.length > 0 && (
          <div className="flex justify-end mt-2 mb-10">
            <div className="flex items-center gap-6 px-4 py-2 text-white" style={{ backgroundColor: BRAND_NAVY }}>
              <span className="text-[10px] font-black uppercase tracking-[0.16em]">Total for {periodLabel(period)}</span>
              <span className="text-[15px] font-black">{formatNaira(totals.total)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-10 mt-8" style={{ breakInside: "avoid" }}>
          <ModernSignSlot caption="Prepared by" name={preparedBy ?? ""} date="" />
          <ModernSignSlot caption="Approved by" name="" date="" />
        </div>
      </div>
    </div>
  );
}
