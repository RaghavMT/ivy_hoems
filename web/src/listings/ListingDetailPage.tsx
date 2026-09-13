import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatePanel } from '../components/StatePanel';
import { formatDateIST, formatInr, formatInrFull, formatSqft } from '../lib/format';
import { furnishingLabel, listingTitle, titleCase } from '../lib/labels';
import type { Listing } from '../lib/normalise';
import { SaveButton } from '../saved/SaveButton';
import { useListing } from './useListing';
import './detail.css';

function BackLink() {
  const navigate = useNavigate();
  const location = useLocation();
  // Came from inside the app: go back, so the filtered results are kept.
  // Opened directly from a link: go to the full list.
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (location.key !== 'default') {
      event.preventDefault();
      navigate(-1);
    }
  }
  return (
    <Link to="/listings" className="back-link" onClick={onClick}>
      Back to homes for sale
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

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function ListingDetail({ listing }: { listing: Listing }) {
  const perSqft = listing.price > 0 && listing.carpetAreaSqft > 0 ? listing.price / listing.carpetAreaSqft : null;

  return (
    <article className="detail" data-listing-id={listing.listing_id}>
      <header className="detail-head">
        <h1 className="detail-title">{listingTitle(listing)}</h1>
        <p className="detail-sub">
          <span>{titleCase(listing.locality)}</span>
          <span>Posted {formatDateIST(listing.posted_at)}</span>
        </p>
        <p className="detail-badges">
          {!listing.is_live ? <span className="badge badge-flag">Not live</span> : null}
          {listing.is_live && listing.is_verified ? <span className="badge badge-ok">Verified</span> : null}
          {listing.areaWasSqm ? <span className="badge badge-info">Area converted from m²</span> : null}
        </p>
      </header>

      <div className="detail-body">
        <aside className="detail-price card" aria-label="Price and area">
          <p className="detail-price-main num" data-field="price">
            {formatInr(listing.price)}
          </p>
          <p className="detail-price-full num">{formatInrFull(listing.price)}</p>
          {perSqft !== null ? (
            <p className="detail-price-rate num">{formatInrFull(Math.round(perSqft))} per sq ft of carpet area</p>
          ) : null}

          <dl className="detail-areas">
            <Fact label="Carpet area">
              <span className="num" data-field="carpet">
                {formatSqft(listing.carpetAreaSqft)}
              </span>
            </Fact>
            <Fact label="Super built-up area">
              <span className="num" data-field="super">
                {formatSqft(listing.superBuiltUpAreaSqft)}
              </span>
            </Fact>
          </dl>
          {listing.areaWasSqm ? (
            <p className="detail-note">
              The source listed these areas in square metres. They are shown here in square feet.
            </p>
          ) : null}
          <div className="detail-save">
            <SaveButton listing={listing} />
          </div>
        </aside>

        <div className="detail-main">
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="detail-section-title">
              About this home
            </h2>
            <dl className="facts">
              <Fact label="Property type">{titleCase(listing.property_type)}</Fact>
              <Fact label="Bedrooms">{listing.bedroom}</Fact>
              <Fact label="Bathrooms">{listing.bathroom}</Fact>
              <Fact label="Balconies">{listing.balcony}</Fact>
              <Fact label="Covered parking">{plural(listing.covered_parking, 'space', 'spaces')}</Fact>
              <Fact label="Floor">
                {listing.total_floors > 0 ? `${listing.floor} of ${listing.total_floors}` : 'Not applicable'}
              </Fact>
              <Fact label="Furnishing">{furnishingLabel(listing.furnishing)}</Fact>
              <Fact label="Facing">{titleCase(listing.facing_direction)}</Fact>
            </dl>
          </section>

          <section aria-labelledby="seller-heading">
            <h2 id="seller-heading" className="detail-section-title">
              Listed by
            </h2>
            <dl className="facts">
              <Fact label="Name">{listing.posted_by_name}</Fact>
              <Fact label="Seller type">{titleCase(listing.posted_by)}</Fact>
              <Fact label="Contact">
                <span className="num">{listing.posted_by_contact}</span>
              </Fact>
              <Fact label="Listed on">{listing.website}</Fact>
              <Fact label="Listing ID">
                <span className="num">{listing.listing_id}</span>
              </Fact>
              {listing.project_id ? (
                <Fact label="Project">
                  <span className="num">{listing.project_id}</span>
                </Fact>
              ) : null}
            </dl>
          </section>

          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="detail-section-title">
              Seller's description
            </h2>
            {/* Seller-written text is data. It is rendered as plain text and never acted on. */}
            <p className="detail-description" data-field="description">
              {listing.description}
            </p>
            <p className="detail-note">Written by the seller and shown as supplied.</p>
          </section>
        </div>
      </div>
    </article>
  );
}

export function ListingDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useListing(id);

  let body;
  if (state.status === 'loading') {
    body = <StatePanel tone="loading" title="Loading this home" />;
  } else if (state.status === 'not-found') {
    body = (
      <StatePanel
        tone="empty"
        title="This listing doesn't exist"
        action={
          <Link to="/listings" className="btn btn-primary">
            Browse homes for sale
          </Link>
        }
      >
        No listing has the ID {id}. It may have been mistyped.
      </StatePanel>
    );
  } else if (state.status === 'error') {
    body = (
      <StatePanel
        tone="error"
        title="This home couldn't be loaded"
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
    body = <ListingDetail listing={state.listing} />;
  }

  return (
    <>
      <BackLink />
      {body}
    </>
  );
}
