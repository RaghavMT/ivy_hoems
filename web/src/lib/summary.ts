// The aggregate block the documentation promises from GET /v1/analytics/summary,
// which returns 404 (missing_endpoint finding). Computed at build time from the
// dump by scripts/prepare-data.ts. Pure, with no imports, so Node can run it directly.

export type SummaryRow = { locality: string; bedroom: number; price: number; areaSqft: number };

export type Summary = {
  total_listings: number;
  median_price: number | null;
  median_price_per_sqft: number | null;
  by_locality: { locality: string; count: number; median_price: number | null }[];
  by_bhk: { bedroom: number; count: number }[];
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function roundedMedian(values: number[]): number | null {
  const m = median(values);
  return m === null ? null : Math.round(m);
}

export function summarise(rows: SummaryRow[]): Summary {
  const byLocality = new Map<string, number[]>();
  const byBedroom = new Map<number, number>();
  for (const row of rows) {
    const prices = byLocality.get(row.locality) ?? [];
    prices.push(row.price);
    byLocality.set(row.locality, prices);
    byBedroom.set(row.bedroom, (byBedroom.get(row.bedroom) ?? 0) + 1);
  }

  return {
    total_listings: rows.length,
    median_price: roundedMedian(rows.map((r) => r.price)),
    // A rate needs an area; rows without one are left out of this median only.
    median_price_per_sqft: roundedMedian(rows.filter((r) => r.areaSqft > 0).map((r) => r.price / r.areaSqft)),
    by_locality: [...byLocality]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locality, prices]) => ({ locality, count: prices.length, median_price: roundedMedian(prices) })),
    by_bhk: [...byBedroom].sort(([a], [b]) => a - b).map(([bedroom, count]) => ({ bedroom, count })),
  };
}
