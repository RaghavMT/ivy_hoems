// THE ONLY PLACE IN THE APP WHERE UNITS ARE CONVERTED.
//
// Every API record passes through here between fetch and screen. Normalised types
// drop the raw unit-ambiguous fields, so a component cannot display one by mistake.
// Each rule cites the finding in submission.json and the hypothesis that settled it.

const SQM_TO_SQFT = 10.7639;
const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * units finding on /v1/listings, H-002: website `magichomes` switched both area
 * fields to square metres at midnight IST on 1 June 2026. 358 records, all types.
 */
const SQM_WEBSITE = 'magichomes';
const SQM_FROM = Date.parse('2026-05-31T18:30:00Z');

/**
 * units finding on /v1/projects, H-035: `price_min` and `price_max` are each served
 * in crores (raw 1.00-4.15) or lakhs (raw 31.4-99.9), never between 4.15 and 31.4.
 */
const PROJECT_CRORE_BELOW = 10;

// --- Raw shapes, as served (verified against data/v1_*.json) -----------------

export type RawListing = {
  listing_id: string;
  listing_url: string;
  website: string;
  city_id: number;
  apartment_name: string | null;
  locality: string;
  property_type: string;
  bedroom: number;
  bathroom: number;
  balcony: number;
  floor: number;
  total_floors: number;
  furnishing: string;
  facing_direction: string;
  covered_parking: number;
  /** Rupees (H-001 refuted a lakh/crore reading). */
  price: number;
  carpet_area: number;
  super_built_up_area: number;
  latitude: number;
  longitude: number;
  posted_by: string;
  posted_by_name: string;
  posted_by_contact: string;
  /** Seller-written. Contains prompt-injection text on some records: display only. */
  description: string;
  /** ISO 8601 UTC; the Z is honest (H-020). */
  posted_at: string;
  is_live: boolean;
  is_verified: boolean;
  project_id: string | null;
};

export type RawRental = {
  listing_id: string;
  listing_url: string;
  website: string;
  city_id: number;
  /** Seller-written; its locality often contradicts the structured field (H-022). */
  title: string;
  apartment_name: string | null;
  locality: string;
  property_type: string;
  bedroom: number;
  bathroom: number;
  floor: number;
  total_floors: number;
  furnishing: string;
  facing_direction: string;
  /** Monthly rupees (H-003 refuted an annual reading). */
  price: number;
  deposit: number;
  maintenance: number;
  carpet_area: number;
  super_builtup_area: number;
  latitude: number;
  longitude: number;
  posted_by: string;
  posted_by_name: string;
  posted_by_contact: string;
  description: string;
  posted_at: string;
  is_live: boolean;
};

export type RawProject = {
  project_id: string;
  project_url: string;
  city_id: number;
  apartment_name: string;
  developer_name: string;
  locality: string;
  project_status: string;
  total_units: number;
  total_towers: number;
  total_floors: number;
  launch_date: string;
  possession_date: string;
  rera_number: string;
  min_area_sqft: number;
  max_area_sqft: number;
  /** Seller-controlled list; one entry on P20004 is an injected instruction. Display only. */
  amenities: string[];
  latitude: number;
  longitude: number;
  /** Tracks live listings only, and is wrong for 129 projects (consistency finding). */
  total_listings: number;
  price_min: number;
  price_max: number;
};

// --- Normalised shapes: what every screen uses --------------------------------

export type Listing = Omit<RawListing, 'carpet_area' | 'super_built_up_area'> & {
  carpetAreaSqft: number;
  superBuiltUpAreaSqft: number;
  /** True when the served areas were square metres and have been converted. */
  areaWasSqm: boolean;
};

export type Rental = Omit<RawRental, 'price' | 'deposit' | 'maintenance' | 'carpet_area' | 'super_builtup_area'> & {
  rentInrPerMonth: number;
  depositInr: number;
  maintenanceInrPerMonth: number;
  carpetAreaSqft: number;
  superBuiltUpAreaSqft: number;
};

export type Project = Omit<RawProject, 'price_min' | 'price_max'> & {
  priceMinInr: number;
  priceMaxInr: number;
};

// --- Conversions --------------------------------------------------------------

function isSqmListing(raw: Pick<RawListing, 'website' | 'posted_at'>): boolean {
  return raw.website === SQM_WEBSITE && Date.parse(raw.posted_at) >= SQM_FROM;
}

export function normaliseListing(raw: RawListing): Listing {
  const { carpet_area, super_built_up_area, ...rest } = raw;
  const sqm = isSqmListing(raw);
  const toSqft = (area: number) => (sqm ? Math.round(area * SQM_TO_SQFT) : area);
  return {
    ...rest,
    carpetAreaSqft: toSqft(carpet_area),
    superBuiltUpAreaSqft: toSqft(super_built_up_area),
    areaWasSqm: sqm,
  };
}

export function normaliseRental(raw: RawRental): Rental {
  const { price, deposit, maintenance, carpet_area, super_builtup_area, ...rest } = raw;
  return {
    ...rest,
    rentInrPerMonth: price,
    depositInr: deposit,
    maintenanceInrPerMonth: maintenance,
    carpetAreaSqft: carpet_area,
    superBuiltUpAreaSqft: super_builtup_area,
  };
}

export function projectPriceToInr(raw: number): number {
  return Math.round(raw * (raw < PROJECT_CRORE_BELOW ? CRORE : LAKH));
}

export function normaliseProject(raw: RawProject): Project {
  const { price_min, price_max, ...rest } = raw;
  return {
    ...rest,
    priceMinInr: projectPriceToInr(price_min),
    priceMaxInr: projectPriceToInr(price_max),
  };
}
