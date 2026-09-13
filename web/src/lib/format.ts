// Display formatting only. Values arrive already normalised to rupees and square
// feet (lib/normalise.ts); nothing here converts units.

const LAKH = 100_000;
const CRORE = 10_000_000;

const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Up to two decimals, without trailing zeros: 1.50 -> "1.5", 2.00 -> "2". */
function short(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** Compact rupees the way Indian property sites quote them: ₹1.06 Cr, ₹45.5 L, ₹33,000. */
export function formatInr(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (abs >= LAKH) {
    const lakhs = Number((abs / LAKH).toFixed(2));
    if (lakhs >= 100) return `${sign}₹${short(abs / CRORE)} Cr`;
    return `${sign}₹${short(lakhs)} L`;
  }
  return `${sign}₹${grouped.format(abs)}`;
}

/** Exact rupees with Indian digit grouping: ₹1,06,00,000. */
export function formatInrFull(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹${grouped.format(Math.abs(amount))}`;
}

export function formatSqft(area: number): string {
  return `${grouped.format(area)} sq ft`;
}
