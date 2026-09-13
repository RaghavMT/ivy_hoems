import { useEffect, useState, type FormEvent } from 'react';
import type { ListingFilter } from '../lib/filters';
import { FURNISHINGS, LISTING_BEDROOMS, LOCALITIES } from '../lib/filterQuery';
import { formatInr } from '../lib/format';
import { bedroomsLabel, furnishingLabel, titleCase } from '../lib/labels';

type Props = {
  filter: ListingFilter;
  onChange: (next: ListingFilter) => void;
};

function toRupees(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function priceHint(text: string): string {
  const value = toRupees(text);
  return value === undefined ? 'In rupees' : formatInr(value);
}

export function FilterBar({ filter, onChange }: Props) {
  // Prices are typed, so they apply on Enter or Apply rather than on every keystroke.
  const [minText, setMinText] = useState(filter.minPrice?.toString() ?? '');
  const [maxText, setMaxText] = useState(filter.maxPrice?.toString() ?? '');

  useEffect(() => setMinText(filter.minPrice?.toString() ?? ''), [filter.minPrice]);
  useEffect(() => setMaxText(filter.maxPrice?.toString() ?? ''), [filter.maxPrice]);

  const activeCount = Object.values(filter).filter((value) => value !== undefined).length;
  const anySet = activeCount > 0;
  // On phones the fields fold away behind a button, so results are visible first.
  const [open, setOpen] = useState(false);

  function applyPrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onChange({ ...filter, minPrice: toRupees(minText), maxPrice: toRupees(maxText) });
  }

  return (
    <form className={`filter-bar card${open ? ' is-open' : ''}`} role="search" aria-label="Filter homes" onSubmit={applyPrices}>
      <button
        type="button"
        className="btn btn-secondary filter-toggle"
        aria-expanded={open}
        aria-controls="filter-fields"
        onClick={() => setOpen((value) => !value)}
      >
        {anySet ? `Filters, ${activeCount} active` : 'Filters'}
      </button>

      <div id="filter-fields" className="filter-fields">
        <div className="field">
          <label className="field-label" htmlFor="filter-locality">
            Locality
          </label>
          <select
            id="filter-locality"
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
          <label className="field-label" htmlFor="filter-bedrooms">
            Bedrooms
          </label>
          <select
            id="filter-bedrooms"
            className="select"
            value={filter.bedrooms?.toString() ?? ''}
            onChange={(e) => onChange({ ...filter, bedrooms: e.target.value === '' ? undefined : Number(e.target.value) })}
          >
            <option value="">Any</option>
            {LISTING_BEDROOMS.map((count) => (
              <option key={count} value={count}>
                {bedroomsLabel(count)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="filter-min-price">
            Min price
          </label>
          <input
            id="filter-min-price"
            className="input num"
            type="number"
            inputMode="numeric"
            min={0}
            step={100000}
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
          />
          <span className="field-hint num">{priceHint(minText)}</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="filter-max-price">
            Max price
          </label>
          <input
            id="filter-max-price"
            className="input num"
            type="number"
            inputMode="numeric"
            min={0}
            step={100000}
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
          />
          <span className="field-hint num">{priceHint(maxText)}</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="filter-furnishing">
            Furnishing
          </label>
          <select
            id="filter-furnishing"
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
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
          {anySet ? (
            <button type="button" className="btn btn-ghost" onClick={() => onChange({})}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
