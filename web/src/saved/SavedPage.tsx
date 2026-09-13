import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';
import { formatDateIST, formatInr, formatSqft } from '../lib/format';
import { titleCase } from '../lib/labels';
import { useSaved } from './useSaved';
import './saved.css';

export function SavedPage() {
  const { items, remove } = useSaved();

  return (
    <>
      <PageHeader title="Saved homes">
        Homes you saved, kept for your account on this browser. Prices and areas are as they were when you
        saved them.
      </PageHeader>

      {items.length === 0 ? (
        <StatePanel
          tone="empty"
          title="No saved homes yet"
          action={
            <Link to="/listings" className="btn btn-primary">
              Browse homes for sale
            </Link>
          }
        >
          Use Save on any listing to keep it here.
        </StatePanel>
      ) : (
        <>
          <p className="results-summary saved-count" aria-live="polite">
            {items.length === 1 ? '1 saved home' : `${items.length} saved homes`}
          </p>
          <ul className="saved-list">
            {items.map(({ id, savedAt, snapshot }) => (
              <li key={id} className="card saved-item" data-listing-id={id}>
                <div className="saved-main">
                  <h2 className="saved-title">
                    <Link to={`/listings/${encodeURIComponent(id)}`}>{snapshot.title}</Link>
                  </h2>
                  <p className="saved-meta">
                    <span>{titleCase(snapshot.locality)}</span>
                    <span>Saved {formatDateIST(savedAt)}</span>
                  </p>
                </div>
                <div className="saved-side">
                  <p className="saved-price num">{formatInr(snapshot.priceInr)}</p>
                  <p className="saved-area num">{formatSqft(snapshot.carpetAreaSqft)} carpet</p>
                  {!snapshot.isLive ? <span className="badge badge-flag">Not live</span> : null}
                </div>
                <button type="button" className="btn btn-ghost btn-sm saved-remove" onClick={() => remove(id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="saved-note">
            The property API has no working favourites endpoint, so saved homes are stored in this browser for each
            account. They stay after logging out and back in, but don't move to another device.
          </p>
        </>
      )}
    </>
  );
}
