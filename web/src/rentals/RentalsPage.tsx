import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';
import { useCollection } from '../components/useCollection';
import { useTakingLong } from '../components/useTakingLong';
import { matchesRental, rentalParams, type RentalFilter } from '../lib/filters';
import { parseRentalFilter, rentalFilterToQuery } from '../lib/filterQuery';
import { resultsSummary } from '../lib/labels';
import { normaliseRental, type RawRental, type Rental } from '../lib/normalise';
import { RentalCard } from './RentalCard';
import { RentalFilterBar } from './RentalFilterBar';
import '../components/browse.css';
import './rentals.css';

export function RentalsPage() {
  const [params, setParams] = useSearchParams();
  const filter = useMemo(() => parseRentalFilter(params), [params]);
  const { items, status, error, nextOffset, scanned, loadMore, retry } = useCollection<RawRental, Rental, RentalFilter>({
    path: '/v1/rentals',
    filter,
    params: rentalParams,
    matches: matchesRental,
    normalise: normaliseRental,
    idOf: (rental) => rental.listing_id,
    noun: 'rentals',
  });
  const hasMore = nextOffset !== null;
  const slow = useTakingLong(status === 'loading' || status === 'loading-more');

  let body;
  if (status === 'loading') {
    body = (
      <StatePanel tone="loading" title="Finding rentals">
        {slow ? 'The server is taking longer than usual. Still loading.' : 'This usually takes a moment.'}
      </StatePanel>
    );
  } else if (status === 'error' && items.length === 0) {
    body = (
      <StatePanel
        tone="error"
        title="Rentals couldn't be loaded"
        action={
          <button type="button" className="btn btn-primary" onClick={retry}>
            Try again
          </button>
        }
      >
        {error}
      </StatePanel>
    );
  } else if (items.length === 0 && !hasMore) {
    body = (
      <StatePanel
        tone="empty"
        title="No rentals match these filters"
        action={
          <Link to="/rentals" className="btn btn-primary">
            Clear filters
          </Link>
        }
      >
        Try another locality, or remove a filter.
      </StatePanel>
    );
  } else {
    body = (
      <section className="results" aria-labelledby="results-summary">
        <div className="results-head">
          <p id="results-summary" className="results-summary" aria-live="polite">
            {resultsSummary(items.length, hasMore, 'rentals')}
          </p>
          {scanned > items.length ? (
            <p className="results-note">Some results were checked and filtered in your browser.</p>
          ) : null}
        </div>

        <ul className="listing-list">
          {items.map((rental) => (
            <RentalCard key={rental.listing_id} rental={rental} />
          ))}
        </ul>

        <div className="results-foot">
          {status === 'error' ? (
            <>
              <p className="form-error" role="alert">
                {error}
              </p>
              <button type="button" className="btn btn-secondary" onClick={retry}>
                Try again
              </button>
            </>
          ) : hasMore ? (
            <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={status === 'loading-more'}>
              {status === 'loading-more' ? 'Loading…' : 'Load more rentals'}
            </button>
          ) : null}
          {status === 'loading-more' && slow ? (
            <p className="form-status">The server is taking longer than usual. Still loading.</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHeader title="Homes for rent">
        Rents are per month in rupees. Deposits are shown in rupees, and areas in square feet.
      </PageHeader>
      <RentalFilterBar filter={filter} onChange={(next) => setParams(rentalFilterToQuery(next))} />
      {body}
    </>
  );
}
