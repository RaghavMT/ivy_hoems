import { useState } from 'react';
import type { RentalFilter } from '../lib/filters';
import { FURNISHINGS, LOCALITIES, RENTAL_BEDROOMS } from '../lib/filterQuery';
import { bedroomsLabel, furnishingLabel, titleCase } from '../lib/labels';

type Props = {
  filter: RentalFilter;
  onChange: (next: RentalFilter) => void;
};

export function RentalFilterBar({ filter, onChange }: Props) {
  const activeCount = Object.values(filter).filter((value) => value !== undefined).length;
  // On phones the fields fold away behind a button, so results are visible first.
  const [open, setOpen] = useState(false);

  return (
    <form
      className={`filter-bar card${open ? ' is-open' : ''}`}
      role="search"
      aria-label="Filter rentals"
      onSubmit={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="btn btn-secondary filter-toggle"
        aria-expanded={open}
        aria-controls="rental-filter-fields"
        onClick={() => setOpen((value) => !value)}
      >
        {activeCount ? `Filters, ${activeCount} active` : 'Filters'}
      </button>

      <div id="rental-filter-fields" className="filter-fields filter-fields-three">
        <div className="field">
          <label className="field-label" htmlFor="rental-filter-locality">
            Locality
          </label>
          <select
            id="rental-filter-locality"
            className="select"
            value={filter.locality ?? ''}
            onChange={(e) => onChange({ ...filter, locality: e.target.value || undefined })}
          >
            <option value="">Any</option>
            {LOCALITIES.map((locality) => (
              <option key={locality} value={locality}>
                {titleCase(locality)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="rental-filter-bedrooms">
            Bedrooms
          </label>
          <select
            id="rental-filter-bedrooms"
            className="select"
            value={filter.bedrooms?.toString() ?? ''}
            onChange={(e) =>
              onChange({ ...filter, bedrooms: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          >
            <option value="">Any</option>
            {RENTAL_BEDROOMS.map((count) => (
              <option key={count} value={count}>
                {bedroomsLabel(count)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="rental-filter-furnishing">
            Furnishing
          </label>
          <select
            id="rental-filter-furnishing"
            className="select"
            value={filter.furnishing ?? ''}
            onChange={(e) => onChange({ ...filter, furnishing: e.target.value || undefined })}
          >
            <option value="">Any</option>
            {FURNISHINGS.map((value) => (
              <option key={value} value={value}>
                {furnishingLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-actions">
          {activeCount ? (
            <button type="button" className="btn btn-ghost" onClick={() => onChange({})}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
