import { useState } from 'react';
import type { ProjectFilter } from '../lib/filters';
import { LOCALITIES, PROJECT_STATUSES } from '../lib/filterQuery';
import { projectStatusLabel, titleCase } from '../lib/labels';

type Props = {
  filter: ProjectFilter;
  onChange: (next: ProjectFilter) => void;
};

export function ProjectFilterBar({ filter, onChange }: Props) {
  const activeCount = Object.values(filter).filter((value) => value !== undefined).length;
  // On phones the fields fold away behind a button, so results are visible first.
  const [open, setOpen] = useState(false);

  return (
    <form
      className={`filter-bar card${open ? ' is-open' : ''}`}
      role="search"
      aria-label="Filter projects"
      onSubmit={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="btn btn-secondary filter-toggle"
        aria-expanded={open}
        aria-controls="project-filter-fields"
        onClick={() => setOpen((value) => !value)}
      >
        {activeCount ? `Filters, ${activeCount} active` : 'Filters'}
      </button>

      <div id="project-filter-fields" className="filter-fields filter-fields-two">
        <div className="field">
          <label className="field-label" htmlFor="project-filter-locality">
            Locality
          </label>
          <select
            id="project-filter-locality"
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
          <label className="field-label" htmlFor="project-filter-status">
            Status
          </label>
          <select
            id="project-filter-status"
            className="select"
            value={filter.status ?? ''}
            onChange={(e) => onChange({ ...filter, status: e.target.value || undefined })}
          >
            <option value="">Any</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {projectStatusLabel(status)}
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
