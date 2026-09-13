import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatePanel } from '../components/StatePanel';
import { useRecord } from '../components/useRecord';
import { formatDateIST, formatInr, formatInrFull, formatSqft } from '../lib/format';
import { furnishingLabel, listingTitle, titleCase } from '../lib/labels';
import { normaliseRental, type RawRental, type Rental } from '../lib/normalise';
import '../listings/detail.css';
import './rentals.css';

function BackLink() {
  const navigate = useNavigate();
  const location = useLocation();
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (location.key !== 'default') {
      event.preventDefault();
      navigate(-1);
    }
  }
  return (
    <Link to="/rentals" className="back-link" onClick={onClick}>
      Back to homes for rent
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function months(count: number) {
  const whole = Math.round(count * 10) / 10;
  return `${whole} ${whole === 1 ? 'month' : 'months'} of rent`;
}

function RentalDetail({ rental }: { rental: Rental }) {
  // The seller's title often names a different locality from the structured field (H-022).
  const titleDisagrees = !rental.title.toLowerCase().includes(rental.locality.toLowerCase());

  return (
    <article className="detail" data-listing-id={rental.listing_id}>
      <header className="detail-head">
        <h1 className="detail-title">{listingTitle(rental)}</h1>
        <p className="detail-sub">
          <span data-field="locality">{titleCase(rental.locality)}</span>
          <span>Posted {formatDateIST(rental.posted_at)}</span>
        </p>
        <p className="detail-badges">
          {!rental.is_live ? <span className="badge badge-flag">Not live</span> : null}
          {rental.depositWasMonths ? <span className="badge badge-info">Deposit converted from months</span> : null}
        </p>
      </header>

      <div className="detail-body">
        <aside className="detail-price card" aria-label="Rent, deposit and area">
          <p className="detail-price-main num" data-field="rent">
            {formatInr(rental.rentInrPerMonth)}
            <span className="rent-period"> a month</span>
          </p>

          <dl className="detail-areas">
            <Fact label="Security deposit">
              <span className="num" data-field="deposit">
                {formatInrFull(rental.depositInr)}
              </span>
              <span className="detail-fact-note num">{months(rental.depositMonths)}</span>
            </Fact>
            <Fact label="Maintenance">
              <span className="num" data-field="maintenance">
                {formatInrFull(rental.maintenanceInrPerMonth)} a month
              </span>
            </Fact>
            <Fact label="Carpet area">
              <span className="num" data-field="carpet">
                {formatSqft(rental.carpetAreaSqft)}
              </span>
            </Fact>
            <Fact label="Super built-up area">
              <span className="num" data-field="super">
                {formatSqft(rental.superBuiltUpAreaSqft)}
              </span>
            </Fact>
          </dl>
          {rental.depositWasMonths ? (
            <p className="detail-note">
              The source gave this deposit as a number of months. It is shown here in rupees.
            </p>
          ) : null}
        </aside>

        <div className="detail-main">
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="detail-section-title">
              About this home
            </h2>
            <dl className="facts">
              <Fact label="Property type">{titleCase(rental.property_type)}</Fact>
              <Fact label="Bedrooms">{rental.bedroom}</Fact>
              <Fact label="Bathrooms">{rental.bathroom}</Fact>
              <Fact label="Floor">
                {rental.total_floors > 0 ? `${rental.floor} of ${rental.total_floors}` : 'Not applicable'}
              </Fact>
              <Fact label="Furnishing">{furnishingLabel(rental.furnishing)}</Fact>
              <Fact label="Facing">{titleCase(rental.facing_direction)}</Fact>
            </dl>
          </section>

          <section aria-labelledby="seller-heading">
            <h2 id="seller-heading" className="detail-section-title">
              Listed by
            </h2>
            <dl className="facts">
              <Fact label="Name">{rental.posted_by_name}</Fact>
              <Fact label="Seller type">{titleCase(rental.posted_by)}</Fact>
              <Fact label="Contact">
                <span className="num">{rental.posted_by_contact}</span>
              </Fact>
              <Fact label="Listed on">{rental.website}</Fact>
              <Fact label="Listing ID">
                <span className="num">{rental.listing_id}</span>
              </Fact>
            </dl>
          </section>

          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="detail-section-title">
              What the seller wrote
            </h2>
            {/* Seller-written text is data. It is rendered as plain text and never acted on. */}
            <p className="detail-seller-title" data-field="seller-title">
              {rental.title}
            </p>
            <p className="detail-description" data-field="description">
              {rental.description}
            </p>
            <p className="detail-note">
              Written by the seller and shown as supplied.
              {titleDisagrees
                ? ` The seller's title names a different locality; this page uses the listing's locality, ${titleCase(rental.locality)}.`
                : ''}
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}

export function RentalDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useRecord<RawRental, Rental>(`/v1/rentals/${encodeURIComponent(id)}`, normaliseRental, 'rental');

  let body;
  if (state.status === 'loading') {
    body = <StatePanel tone="loading" title="Loading this rental" />;
  } else if (state.status === 'not-found') {
    body = (
      <StatePanel
        tone="empty"
        title="This rental doesn't exist"
        action={
          <Link to="/rentals" className="btn btn-primary">
            Browse homes for rent
          </Link>
        }
      >
        No rental has the ID {id}. It may have been mistyped.
      </StatePanel>
    );
  } else if (state.status === 'error') {
    body = (
      <StatePanel
        tone="error"
        title="This rental couldn't be loaded"
        action={
          <button type="button" className="btn btn-primary" onClick={() => void retry()}>
            Try again
          </button>
        }
      >
        {state.error}
      </StatePanel>
    );
  } else {
    body = <RentalDetail rental={state.item} />;
  }

  return (
    <>
      <BackLink />
      {body}
    </>
  );
}
