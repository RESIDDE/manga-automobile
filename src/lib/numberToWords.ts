const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function underThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)] + (rest ? `-${ONES[rest]}` : "");
  }
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` and ${underThousand(rest)}` : ""}`;
}

/**
 * Spells out a Naira amount for the "amount in words" line on a document.
 * `numberToWords(5000000)` → "Five Million Naira Only".
 */
export function numberToWords(amount: number | string): string {
  const value = typeof amount === "string" ? parseFloat(amount.replace(/,/g, "")) : amount;
  if (!Number.isFinite(value) || value === 0) return "Zero Naira Only";

  const negative = value < 0;
  const absolute = Math.abs(value);
  const naira = Math.floor(absolute);
  const kobo = Math.round((absolute - naira) * 100);

  const chunks: string[] = [];
  let remaining = naira;
  let scale = 0;
  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      chunks.unshift(`${underThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }

  let words = chunks.join(" ").trim();
  if (!words) words = "Zero";
  words += " Naira";
  if (kobo > 0) words += `, ${underThousand(kobo)} Kobo`;
  words += " Only";

  return `${negative ? "Minus " : ""}${words}`;
}

/** "bank transfer" → "Bank Transfer" */
export function titleCase(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** 5000000 → "₦5,000,000" */
export function formatNaira(amount: number | string | null | undefined): string {
  const value = typeof amount === "string" ? parseFloat(amount.replace(/,/g, "")) : amount;
  if (!Number.isFinite(value as number)) return "₦0";
  return `₦${Number(value).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}
