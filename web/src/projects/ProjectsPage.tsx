import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';
import { useCollection } from '../components/useCollection';
import { useTakingLong } from '../components/useTakingLong';
import { matchesProject, projectParams, type ProjectFilter } from '../lib/filters';
import { parseProjectFilter, projectFilterToQuery } from '../lib/filterQuery';
import { resultsSummary } from '../lib/labels';
import { normaliseProject, type Project, type RawProject } from '../lib/normalise';
import { ProjectCard } from './ProjectCard';
import { ProjectFilterBar } from './ProjectFilterBar';
import '../components/browse.css';
import './projects.css';

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const filter = useMemo(() => parseProjectFilter(params), [params]);
  const { items, status, error, nextOffset, scanned, loadMore, retry } = useCollection<RawProject, Project, ProjectFilter>({
    path: '/v1/projects',
    filter,
    params: projectParams,
    matches: matchesProject,
    normalise: normaliseProject,
    idOf: (project) => project.project_id,
    noun: 'projects',
  });
  const hasMore = nextOffset !== null;
  const slow = useTakingLong(status === 'loading' || status === 'loading-more');

  let body;
  if (status === 'loading') {
    body = (
      <StatePanel tone="loading" title="Finding projects">
        {slow ? 'The server is taking longer than usual. Still loading.' : 'This usually takes a moment.'}
      </StatePanel>
    );
  } else if (status === 'error' && items.length === 0) {
    body = (
      <StatePanel
        tone="error"
        title="Projects couldn't be loaded"
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
        title="No projects match these filters"
        action={
          <Link to="/projects" className="btn btn-primary">
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
            {resultsSummary(items.length, hasMore, 'projects')}
          </p>
          {scanned > items.length ? (
            <p className="results-note">Some results were checked and filtered in your browser.</p>
          ) : null}
        </div>

        <ul className="listing-list">
          {items.map((project) => (
            <ProjectCard key={project.project_id} project={project} />
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
              {status === 'loading-more' ? 'Loading…' : 'Load more projects'}
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
      <PageHeader title="New projects">
        Developer projects with price ranges in rupees and unit sizes in square feet. The source serves
        these prices in lakhs or crores; every price here is converted to rupees.
      </PageHeader>
      <ProjectFilterBar filter={filter} onChange={(next) => setParams(projectFilterToQuery(next))} />
      {body}
    </>
  );
}
