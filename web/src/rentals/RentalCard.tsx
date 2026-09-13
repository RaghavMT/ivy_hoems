import { Link } from 'react-router-dom';
import { formatInr, formatInrFull, formatSqft } from '../lib/format';
import { furnishingLabel, listingTitle, titleCase } from '../lib/labels';
import type { Rental } from '../lib/normalise';

function details(rental: Rental): string[] {
  const parts: string[] = [];
  if (rental.total_floors > 0) parts.push(`Floor ${rental.floor} of ${rental.total_floors}`);
  if (rental.facing_direction) parts.push(`${titleCase(rental.facing_direction)} facing`);
  if (rental.bathroom > 0) parts.push(`${rental.bathroom} ${rental.bathroom === 1 ? 'bath' : 'baths'}`);
  return parts;
}

export function RentalCard({ rental }: { rental: Rental }) {
  return (
    <li className={`card listing-card${rental.is_live ? '' : ' is-not-live'}`} data-listing-id={rental.listing_id}>
      <div className="listing-main">
        {/* Built from structured fields: the seller's title often names another locality (H-022). */}
        <h2 className="listing-title">
          <Link to={`/rentals/${encodeURIComponent(rental.listing_id)}`}>{listingTitle(rental)}</Link>
        </h2>
        <p className="listing-place">
          <span data-field="locality">{titleCase(rental.locality)}</span>
          <span data-field="furnishing">{furnishingLabel(rental.furnishing)}</span>
        </p>
        <p className="listing-details">
          {details(rental).map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
      </div>

      <div className="listing-side">
        <p className="listing-price num" data-field="rent">
          {formatInr(rental.rentInrPerMonth)}
          <span className="rent-period"> a month</span>
        </p>
        <p className="listing-area num" data-field="deposit">
          Deposit {formatInrFull(rental.depositInr)}
        </p>
        <p className="listing-area num" data-field="area">
          {formatSqft(rental.carpetAreaSqft)} carpet
        </p>
        <p className="listing-badges">
          {!rental.is_live ? <span className="badge badge-flag">Not live</span> : null}
          {rental.depositWasMonths ? (
            <span className="badge badge-info" title="The source gave this deposit as a number of months">
              Deposit converted from months
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
}
