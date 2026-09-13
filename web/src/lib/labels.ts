// Display text built from structured fields. Seller-written titles are never used
// for headings: rental titles contradict their own locality field 91% of the time (H-022).

export function titleCase(text: string): string {
  return text.replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Works for listings and rentals: both carry these structured fields. */
export function listingTitle(listing: { bedroom: number; property_type: string; apartment_name: string | null }): string {
  const { bedroom, property_type, apartment_name } = listing;
  const kind =
    bedroom > 0 ? `${bedroom} BHK ${property_type}` : property_type === 'plot' ? 'Plot' : `Studio ${property_type}`;
  return apartment_name ? `${kind}, ${apartment_name}` : kind;
}

const FURNISHING_LABELS: Record<string, string> = {
  'fully-furnished': 'Fully furnished',
  'semi-furnished': 'Semi-furnished',
  unfurnished: 'Unfurnished',
};

export function furnishingLabel(value: string): string {
  return FURNISHING_LABELS[value] ?? titleCase(value);
}

export function bedroomsLabel(count: number): string {
  return count === 0 ? 'Studio / plot' : `${count} BHK`;
}

/** `noun` is plural ("homes"); it is singularised for a count of one. */
export function resultsSummary(shown: number, hasMore: boolean, noun: string): string {
  if (shown === 0 && !hasMore) return `No ${noun} match these filters`;
  const word = shown === 1 ? noun.replace(/s$/, '') : noun;
  return hasMore ? `Showing ${shown} ${word} so far` : `All ${shown} matching ${word} shown`;
}
