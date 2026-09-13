import { Link } from 'react-router-dom';
import { formatInr, formatSqft } from '../lib/format';
import { furnishingLabel, listingTitle, titleCase } from '../lib/labels';
import type { Listing } from '../lib/normalise';

function details(listing: Listing): string[] {
  const parts: string[] = [];
  if (listing.total_floors > 0) parts.push(`Floor ${listing.floor} of ${listing.total_floors}`);
  if (listing.facing_direction) parts.push(`${titleCase(listing.facing_direction)} facing`);
  if (listing.bathroom > 0) parts.push(`${listing.bathroom} ${listing.bathroom === 1 ? 'bath' : 'baths'}`);
  return parts;
}

export function ListingCard({ listing }: { listing: Listing }) {
  // The coloured edge only appears when it means something.
  const edge = !listing.is_live ? 'is-not-live' : listing.is_verified ? 'is-verified' : '';

  return (
    <li className={`card listing-card ${edge}`} data-listing-id={listing.listing_id}>
      <div className="listing-main">
        <h2 className="listing-title">
          <Link to={`/listings/${encodeURIComponent(listing.listing_id)}`}>{listingTitle(listing)}</Link>
        </h2>
        <p className="listing-place">
          <span data-field="locality">{titleCase(listing.locality)}</span>
          <span data-field="furnishing">{furnishingLabel(listing.furnishing)}</span>
        </p>
        <p className="listing-details">
          {details(listing).map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
      </div>

      <div className="listing-side">
        <p className="listing-price num" data-field="price">
          {formatInr(listing.price)}
        </p>
        <p className="listing-area num" data-field="area">
          {formatSqft(listing.carpetAreaSqft)} carpet
        </p>
        <p className="listing-badges">
          {!listing.is_live ? <span className="badge badge-flag">Not live</span> : null}
          {listing.is_live && listing.is_verified ? <span className="badge badge-ok">Verified</span> : null}
          {listing.areaWasSqm ? (
            <span className="badge badge-info" title="The source served this area in square metres">
              Converted from m²
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
}
