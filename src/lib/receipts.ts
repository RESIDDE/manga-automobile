/**
 * Payment state and receipts are derived from the rows, never stored a second
 * time. That way a ledger covers receipts issued before the feature existed and
 * can never miss one — the trade-off being that an entry reflects the sale's
 * *current* data, so editing a sale changes what a re-print shows.
 */

export type PaymentRow = {
  id: string;
  sale_id?: string | null;
  amount: number | string | null;
  payment_date?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type SaleRow = {
  id: string;
  customer_id?: string | null;
  vehicle_id?: string | null;
  sale_price?: number | string | null;
  sale_date?: string | null;
  created_at?: string | null;
  payment_status?: string | null;
  payment_type?: string | null;
  notes?: string | null;
  is_registered?: boolean | null;
  sale_vehicles?: { vehicle_id?: string | null; price?: number | string | null }[] | null;
  sale_payments?: PaymentRow[] | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── Derived payment state ──────────────────────────────────────────────────

export type PaymentState = {
  total: number;
  totalPaid: number;
  balance: number;
  isPaidInFull: boolean;
  payments: PaymentRow[];
};

/**
 * Never trust `payment_status` alone: instalments are the source of truth.
 * With no instalments recorded, a sale flagged `deposit` counts as nothing paid
 * and a full balance; anything else counts as paid in full.
 */
export function derivePaymentState(sale: SaleRow): PaymentState {
  const total = num(sale.sale_price);
  const payments = [...(sale.sale_payments ?? [])].sort(
    (a, b) =>
      new Date(a.payment_date || a.created_at || 0).getTime() -
      new Date(b.payment_date || b.created_at || 0).getTime()
  );

  if (payments.length > 0) {
    const totalPaid = payments.reduce((sum, p) => sum + num(p.amount), 0);
    const balance = Math.max(0, total - totalPaid);
    return { total, totalPaid, balance, isPaidInFull: balance <= 0, payments };
  }

  const isDeposit = (sale.payment_status ?? "") === "deposit";
  return {
    total,
    totalPaid: isDeposit ? 0 : total,
    balance: isDeposit ? total : 0,
    isPaidInFull: !isDeposit,
    payments,
  };
}

/** "Deposit", "2nd payment", … "Final" — the label a payment carries on the ledger. */
export function paymentLabel(index: number, count: number, isFinal: boolean): string {
  if (isFinal && index === count - 1) return "Final payment";
  if (index === 0) return "Deposit";
  const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
  return `${ordinals[index] ?? `${index + 1}th`} payment`;
}

// ─── Receipt numbers ────────────────────────────────────────────────────────

/**
 * Deterministic receipt number: `RCT-DDMM-NNNN`, where DDMM is the receipt date
 * and NNNN is the first four hex digits of the record's uuid, zero-padded.
 * Both the ledger and the printed document call this, so a re-print always
 * quotes the same number.
 */
export function receiptNumber(id: string, date: string | null | undefined): string {
  const when = date ? new Date(date) : new Date(NaN);
  const valid = !Number.isNaN(when.getTime());
  const dd = valid ? String(when.getDate()).padStart(2, "0") : "00";
  const mm = valid ? String(when.getMonth() + 1).padStart(2, "0") : "00";
  const tail = (id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase().padStart(4, "0");
  return `RCT-${dd}${mm}-${tail}`;
}

// ─── The derived ledger ─────────────────────────────────────────────────────

export type ReceiptEntry = {
  key: string;
  type: "sale" | "payment";
  number: string;
  saleId: string;
  paymentId: string | null;
  date: string | null;
  saleDate: string | null;
  amount: number;
  balance: number;
  method: string;
  status: string;
  notes: string;
  label: string;
};

/**
 * One sale receipt per sale, plus one payment receipt per instalment, newest
 * first. Nothing here is stored: the ledger is rebuilt from the sales rows.
 */
export function buildReceiptLedger(sales: SaleRow[]): ReceiptEntry[] {
  const entries: ReceiptEntry[] = [];

  for (const sale of sales) {
    const state = derivePaymentState(sale);
    const saleDate = sale.sale_date || sale.created_at || null;

    entries.push({
      key: `sale-${sale.id}`,
      type: "sale",
      number: receiptNumber(sale.id, saleDate),
      saleId: sale.id,
      paymentId: null,
      date: saleDate,
      saleDate,
      amount: state.total,
      balance: state.balance,
      method: sale.payment_type || "cash",
      status: state.isPaidInFull ? "Paid in full" : "Part payment",
      notes: sale.notes || "",
      label: sale.is_registered ? "Vehicle Sales Agreement Receipt" : "Sale receipt",
    });

    state.payments.forEach((payment, index) => {
      const date = payment.payment_date || payment.created_at || null;
      // Running balance after this instalment
      const paidSoFar = state.payments
        .slice(0, index + 1)
        .reduce((sum, p) => sum + num(p.amount), 0);
      const balance = Math.max(0, state.total - paidSoFar);

      entries.push({
        key: `payment-${payment.id}`,
        type: "payment",
        number: receiptNumber(payment.id, date),
        saleId: sale.id,
        paymentId: payment.id,
        date,
        saleDate,
        amount: num(payment.amount),
        balance,
        method: payment.payment_method || "cash",
        status: balance <= 0 ? "Paid in full" : "Part payment",
        notes: payment.notes || "",
        label: paymentLabel(index, state.payments.length, balance <= 0),
      });
    });
  }

  return entries.sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );
}

// ─── Ledger search ──────────────────────────────────────────────────────────

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Every way a date might reasonably be typed into the search box. */
function dateHaystack(value: string | null): string[] {
  if (!value) return [];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return [];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const month = MONTHS[d.getMonth()];
  return [
    `${dd}/${mm}/${yyyy}`,
    `${yyyy}-${mm}-${dd}`,
    month,
    month.slice(0, 3),
    `${month} ${yyyy}`,
    dd,
    String(d.getDate()),
  ];
}

/**
 * One search box over the whole ledger: receipt number, customer, vehicle, VIN,
 * amount, status, method, notes, and the date written several ways — against
 * both the receipt date and the sale date.
 */
export function receiptMatches(
  entry: ReceiptEntry,
  query: string,
  context: { customer?: string; vehicles?: string; vins?: string } = {}
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    entry.number,
    entry.type,
    entry.label,
    entry.status,
    entry.method,
    entry.notes,
    String(entry.amount),
    entry.amount.toLocaleString(),
    context.customer ?? "",
    context.vehicles ?? "",
    context.vins ?? "",
    ...dateHaystack(entry.date),
    ...dateHaystack(entry.saleDate),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}
