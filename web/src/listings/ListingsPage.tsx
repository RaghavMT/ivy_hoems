import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';
import { useTakingLong } from '../components/useTakingLong';
import type { ListingFilter } from '../lib/filters';
import { listingFilterToQuery, parseListingFilter } from '../lib/filterQuery';
import { resultsSummary } from '../lib/labels';
import { FilterBar } from './FilterBar';
import { ListingCard } from './ListingCard';
import { useListings } from './useListings';
import '../components/browse.css';

export function ListingsPage() {
  const [params, setParams] = useSearchParams();
  // The address bar is the only place filter state lives.
  const filter = useMemo(() => parseListingFilter(params), [params]);
  const { items, status, error, nextOffset, scanned, loadMore, retry } = useListings(filter);
  const hasMore = nextOffset !== null;
  const slow = useTakingLong(status === 'loading' || status === 'loading-more');

  function changeFilter(next: ListingFilter) {
    setParams(listingFilterToQuery(next));
  }

  let body;
  if (status === 'loading') {
    body = (
      <StatePanel tone="loading" title="Finding homes">
        {slow ? 'The server is taking longer than usual. Still loading.' : 'This usually takes a moment.'}
      </StatePanel>
    );
  } else if (status === 'error' && items.length === 0) {
    body = (
      <StatePanel
        tone="error"
        title="Homes couldn't be loaded"
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
        title="No homes match these filters"
        action={
          <Link to="/listings" className="btn btn-primary">
            Clear filters
          </Link>
        }
      >
        Try a wider price range, or remove a filter.
      </StatePanel>
    );
  } else {
    body = (
      <section className="results" aria-labelledby="results-summary">
        <div className="results-head">
          <p id="results-summary" className="results-summary" aria-live="polite">
            {resultsSummary(items.length, hasMore, 'homes')}
          </p>
          {scanned > items.length ? (
            <p className="results-note">Some results were checked and filtered in your browser.</p>
          ) : null}
        </div>

        <ul className="listing-list">
          {items.map((listing) => (
            <ListingCard key={listing.listing_id} listing={listing} />
          ))}
        </ul>

        <div className="results-foot">
          {status === 'error' ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {status === 'error' ? (
            <button type="button" className="btn btn-secondary" onClick={retry}>
              Try again
            </button>
          ) : hasMore ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadMore}
              disabled={status === 'loading-more'}
            >
              {status === 'loading-more' ? 'Loading…' : 'Load more homes'}
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
      <PageHeader title="Homes for sale">
        Apartments, houses, villas and plots across Hyderabad. Prices in rupees, areas in square feet.
      </PageHeader>
      <FilterBar filter={filter} onChange={changeFilter} />
      {body}
    </>
  );
}
