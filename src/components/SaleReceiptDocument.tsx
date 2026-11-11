import {
  COMPANY, DocSectionTitle, MetaLabel, ModernSignSlot, PrintHeader, PrintWatermark,
  MODERN_FONT, ROW_RULE, RULE,
} from "@/components/PrintHeader";
import { formatNaira, numberToWords } from "@/lib/numberToWords";
import { longDate } from "@/lib/historyFilters";
import {
  derivePaymentState, paymentLabel, receiptNumber, type PaymentRow, type SaleRow,
} from "@/lib/receipts";

export type ReceiptLineItem = {
  id: string;
  description: string;
  vin?: string | null;
  color?: string | null;
  trim?: string | null;
  amount: number;
};

export type AgreementDetails = {
  engine_number?: string;
  registration_number?: string;
  witness_one_name?: string;
  witness_one_address?: string;
  witness_one_occupation?: string;
  witness_two_name?: string;
  witness_two_address?: string;
  witness_two_occupation?: string;
  seller_name?: string;
  seller_address?: string;
  seller_occupation?: string;
  received_in_good_condition?: boolean;
  received_date?: string;
};

export type ReceiptBankDetails = {
  bank_name?: string;
  account_number?: string;
  account_name?: string;
};

export type ReceiptDocProps = {
  sale: SaleRow & {
    rep_name?: string | null;
    rep_signature?: string | null;
    buyer_signature?: string | null;
    buyer_signature_date?: string | null;
    rep_signature_date?: string | null;
    sale_number?: number | string | null;
    agreement_details?: AgreementDetails | null;
  };
  customer: { name?: string | null; phone?: string | null; address?: string | null; email?: string | null };
  items: ReceiptLineItem[];
  /** Set to print a receipt for one instalment rather than for the whole sale. */
  payment?: PaymentRow | null;
  paymentIndex?: number;
  bank?: ReceiptBankDetails;
};

/**
 * The sale receipt. This one component is what previews on screen, what the
 * browser prints and what gets rasterised into a PDF/PNG/JPEG — there is no
 * separate print HTML, because two renderers drift apart.
 *
 * With `sale.is_registered` the same component becomes the Vehicle Sales
 * Agreement Receipt: the witnesses, sold-by, as-is NOTE and acceptance blocks
 * appear and the signature slots are relabelled.
 */
export function SaleReceiptDocument({
  sale, customer, items, payment = null, paymentIndex = 0, bank,
}: ReceiptDocProps) {
  const state = derivePaymentState(sale);
  const agreement = sale.agreement_details ?? {};
  // A payment receipt is a slip for one instalment, so it keeps the plain
  // template even when the sale itself is a registered-vehicle agreement.
  const isAgreement = !!sale.is_registered && !payment;

  const receiptDate = payment
    ? (payment.payment_date || payment.created_at || null)
    : (sale.sale_date || sale.created_at || null);
  const number = receiptNumber(payment ? payment.id : sale.id, receiptDate);

  const headlineAmount = payment ? Number(payment.amount ?? 0) : state.total;
  const paidSoFar = payment
    ? state.payments
        .slice(0, paymentIndex + 1)
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
    : state.totalPaid;
  const balance = Math.max(0, state.total - paidSoFar);

  const title = payment
    ? "Payment Receipt"
    : isAgreement
    ? "Vehicle Sales Agreement Receipt"
    : "Sales Receipt";

  return (
    <div
      className="print-document-page w-full md:w-[210mm] md:min-h-[297mm] p-8 md:p-[20mm]"
      style={{ fontFamily: MODERN_FONT }}
    >
      <PrintWatermark />
      <div className="relative z-10">
        <PrintHeader />

        {/* Title + receipt number */}
        <div className="flex items-start justify-between gap-6 mb-5">
          <div>
            <h1 className="text-[16px] font-black uppercase tracking-[0.14em] text-black">
              {title}
            </h1>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500 mt-1">
              Cash / Credit Invoice
            </p>
          </div>
          <div className="text-right">
            <div className="border-2 border-black px-3 py-1 inline-block">
              <span className="text-[16px] font-black tracking-wider">№ {number}</span>
            </div>
            {payment && (
              <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mt-1">
                {paymentLabel(paymentIndex, state.payments.length, balance <= 0)}
              </p>
            )}
          </div>
        </div>

        {/* Billed to */}
        <div className="grid grid-cols-3 gap-4 mb-5 pb-3" style={{ borderBottom: ROW_RULE }}>
          <div className="col-span-2">
            <MetaLabel>Billed to</MetaLabel>
            <p className="text-[12px] font-bold text-black">{customer.name || "—"}</p>
            {customer.phone && <p className="text-[10px] text-black">{customer.phone}</p>}
            {customer.address && <p className="text-[10px] text-black">{customer.address}</p>}
            {customer.email && <p className="text-[10px] text-black">{customer.email}</p>}
          </div>
          <div className="text-right">
            <MetaLabel>Date</MetaLabel>
            <p className="text-[10.5px] font-semibold text-black">{longDate(receiptDate)}</p>
            <div className="h-2" />
            <MetaLabel>Payment</MetaLabel>
            <p className="text-[10.5px] font-semibold text-black capitalize">
              {(payment?.payment_method || sale.payment_type || "cash").replace(/_/g, " ")}
            </p>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr>
              <th className="text-left text-[9px] font-black uppercase tracking-[0.14em] text-black pb-1"
                  style={{ borderBottom: RULE }}>
                Description
              </th>
              <th className="text-right text-[9px] font-black uppercase tracking-[0.14em] text-black pb-1 w-[130px]"
                  style={{ borderBottom: RULE }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const specs = [item.vin, item.trim, item.color].filter(Boolean).join(" · ");
              return (
                <tr key={item.id}>
                  <td className="py-[6px] align-top" style={{ borderBottom: ROW_RULE }}>
                    <p className="text-[11px] font-semibold text-black">{item.description}</p>
                    {specs && <p className="text-[8.5px] text-neutral-500 mt-[1px]">{specs}</p>}
                  </td>
                  <td className="py-[6px] text-right text-[11px] font-semibold text-black align-top"
                      style={{ borderBottom: ROW_RULE }}>
                    {formatNaira(item.amount)}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td className="py-[6px] text-[11px] text-black" style={{ borderBottom: ROW_RULE }}>
                  Vehicle
                </td>
                <td className="py-[6px] text-right text-[11px] font-semibold text-black"
                    style={{ borderBottom: ROW_RULE }}>
                  {formatNaira(state.total)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Words + totals */}
        <div className="flex items-start justify-between gap-8 mb-4">
          <div className="flex-1">
            <MetaLabel>Amount in words</MetaLabel>
            <p className="text-[10.5px] italic font-semibold text-black">
              {numberToWords(headlineAmount)}
            </p>
          </div>
          <div className="w-[220px] shrink-0">
            <div className="flex justify-between text-[10.5px] text-black py-[3px]" style={{ borderBottom: ROW_RULE }}>
              <span>{payment ? "Sale total" : "Total"}</span>
              <span className="font-semibold">{formatNaira(state.total)}</span>
            </div>
            <div className="flex justify-between text-[10.5px] text-black py-[3px]" style={{ borderBottom: ROW_RULE }}>
              <span>{payment ? "This payment" : "Amount paid"}</span>
              <span className="font-semibold">
                {formatNaira(payment ? headlineAmount : paidSoFar)}
              </span>
            </div>
            <div className="flex justify-between text-[13px] font-black text-black pt-[6px] mt-[2px]"
                 style={{ borderTop: RULE }}>
              <span>Balance due</span>
              <span>{formatNaira(balance)}</span>
            </div>
          </div>
        </div>

        {/* Bank details */}
        {(bank?.bank_name || bank?.account_number || bank?.account_name) && (
          <div className="bg-neutral-100 rounded-[4px] p-3 mb-4">
            <MetaLabel>Payment details</MetaLabel>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[8px] uppercase tracking-wider text-neutral-500">Bank</p>
                <p className="text-[10.5px] font-semibold text-black">{bank?.bank_name || "—"}</p>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wider text-neutral-500">Account number</p>
                <p className="text-[10.5px] font-semibold text-black">{bank?.account_number || "—"}</p>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wider text-neutral-500">Account name</p>
                <p className="text-[10.5px] font-semibold text-black">{bank?.account_name || "—"}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Registered-vehicle agreement blocks ─────────────────────────── */}
        {isAgreement && (
          <>
            {(agreement.engine_number || agreement.registration_number) && (
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div className="flex items-baseline gap-2" style={{ borderBottom: ROW_RULE }}>
                  <span className="text-[9.5px] font-semibold uppercase tracking-wide text-neutral-500">
                    Engine No:
                  </span>
                  <span className="text-[11px] font-semibold text-black">
                    {agreement.engine_number || " "}
                  </span>
                </div>
                <div className="flex items-baseline gap-2" style={{ borderBottom: ROW_RULE }}>
                  <span className="text-[9.5px] font-semibold uppercase tracking-wide text-neutral-500">
                    Registration No:
                  </span>
                  <span className="text-[11px] font-semibold text-black">
                    {agreement.registration_number || " "}
                  </span>
                </div>
              </div>
            )}

            <section className="mb-4">
              <DocSectionTitle>Witnesses</DocSectionTitle>
              <div className="grid grid-cols-2 gap-6">
                {[
                  {
                    name: agreement.witness_one_name,
                    address: agreement.witness_one_address,
                    occupation: agreement.witness_one_occupation,
                    label: "1st Witness",
                  },
                  {
                    name: agreement.witness_two_name,
                    address: agreement.witness_two_address,
                    occupation: agreement.witness_two_occupation,
                    label: "2nd Witness",
                  },
                ].map((w) => (
                  <div key={w.label} className="space-y-[6px]">
                    <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-black">
                      {w.label}
                    </p>
                    {[["Name", w.name], ["Address", w.address], ["Occupation", w.occupation]].map(
                      ([label, value]) => (
                        <p key={label} className="text-[10px] text-black pb-[2px]" style={{ borderBottom: ROW_RULE }}>
                          <span className="text-neutral-500">{label}: </span>
                          <span className="font-semibold">{value || " "}</span>
                        </p>
                      )
                    )}
                    <p className="text-[10px] text-black pt-4 pb-[2px]" style={{ borderBottom: RULE }}>
                      &nbsp;
                    </p>
                    <p className="text-[8px] uppercase tracking-wider text-neutral-500">Signature</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-4">
              <DocSectionTitle>Sold by</DocSectionTitle>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-[6px]">
                  {[
                    ["Name", agreement.seller_name],
                    ["Address", agreement.seller_address],
                    ["Occupation", agreement.seller_occupation],
                  ].map(([label, value]) => (
                    <p key={label as string} className="text-[10px] text-black pb-[2px]" style={{ borderBottom: ROW_RULE }}>
                      <span className="text-neutral-500">{label}: </span>
                      <span className="font-semibold">{value || " "}</span>
                    </p>
                  ))}
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-[10px] text-black pt-6 pb-[2px]" style={{ borderBottom: RULE }}>&nbsp;</p>
                  <p className="text-[8px] uppercase tracking-wider text-neutral-500">Signature</p>
                </div>
              </div>
            </section>

            <div className="border-2 border-red-600 rounded-[4px] p-3 mb-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-red-600 mb-1">Note</p>
              <p className="text-[10px] leading-[1.6] text-black">
                The vehicle described above is sold on an <strong>“as is”</strong> basis. The buyer has
                examined the vehicle and accepts it in its present condition. No refund of money after
                payment. {COMPANY.name} {COMPANY.nameSuffix} gives no warranty, express or implied, as to
                the condition of the vehicle after delivery.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-5 p-2 bg-neutral-100 rounded-[4px]">
              <span className="w-[14px] h-[14px] border-2 border-black flex items-center justify-center text-[10px] font-black leading-none">
                {agreement.received_in_good_condition ? "✓" : ""}
              </span>
              <span className="text-[10px] font-semibold text-black">
                Vehicle received in good condition
              </span>
              <span className="text-[10px] text-black ml-auto">
                Date:{" "}
                <span className="font-semibold">
                  {longDate(agreement.received_date || sale.sale_date) || "—"}
                </span>
              </span>
            </div>
          </>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 mt-6">
          <ModernSignSlot
            signature={sale.buyer_signature}
            caption={isAgreement ? "Buyer's Signature" : "Customer Signature"}
            name={customer.name || ""}
            date={longDate(sale.buyer_signature_date)}
          />
          <ModernSignSlot
            signature={sale.rep_signature}
            caption={isAgreement ? "Managing Director" : "Seller / Representative"}
            name={sale.rep_name || `${COMPANY.name} ${COMPANY.nameSuffix}`}
            date={longDate(sale.rep_signature_date ?? sale.sale_date)}
          />
        </div>

        <p className="text-[8.5px] text-neutral-600 text-center mt-6 pt-2" style={{ borderTop: ROW_RULE }}>
          NOTICE: NO REFUND OF MONEY AFTER PAYMENT. If the depositor decides not to go on with the
          transaction, the money is refunded only after the said car is sold.
          <br />
          Thank you for choosing {COMPANY.name} {COMPANY.nameSuffix} · Tel: {COMPANY.tel}
        </p>
      </div>
    </div>
  );
}
