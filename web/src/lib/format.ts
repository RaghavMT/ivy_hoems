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

/** A plain count with Indian digit grouping: 2,347. */
export function formatCount(count: number): string {
  return grouped.format(count);
}

export function formatSqft(area: number): string {
  return `${grouped.format(area)} sq ft`;
}

/** A price range: ₹37.9 L to ₹87.2 L. One amount when both ends read the same. */
export function formatInrRange(min: number, max: number): string {
  const [low, high] = [formatInr(min), formatInr(max)];
  return low === high ? low : `${low} to ${high}`;
}

/** An area range with the unit named once: 1,394 to 3,546 sq ft. */
export function formatSqftRange(min: number, max: number): string {
  return min === max ? formatSqft(min) : `${grouped.format(min)} to ${formatSqft(max)}`;
}

const istDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Calendar date in India. API timestamps are honest UTC (H-020), so a listing
 * posted late in the UTC evening belongs to the next day for a reader in Hyderabad.
 */
export function formatDateIST(iso: string): string {
  const parts = Object.fromEntries(istDate.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}`;
}
