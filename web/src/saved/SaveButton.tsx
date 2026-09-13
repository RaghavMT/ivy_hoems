import type { Listing } from '../lib/normalise';
import { useSaved } from './useSaved';
import './saved.css';

export function SaveButton({ listing }: { listing: Listing }) {
  const { isSaved, toggle } = useSaved();
  const saved = isSaved(listing.listing_id);

  return (
    <button
      type="button"
      className={`btn btn-sm save-button${saved ? ' is-saved' : ''}`}
      aria-pressed={saved}
      onClick={() => toggle(listing)}
    >
      <svg className="save-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" />
      </svg>
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
