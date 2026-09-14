import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatePanel } from '../components/StatePanel';
import { useRecord } from '../components/useRecord';
import { formatCount, formatDateIST, formatInrFull, formatInrRange, formatSqftRange } from '../lib/format';
import { projectStatusLabel, titleCase } from '../lib/labels';
import { normaliseProject, type PriceUnit, type Project, type RawProject } from '../lib/normalise';
import '../listings/detail.css';
import './projects.css';

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
    <Link to="/projects" className="back-link" onClick={onClick}>
      Back to new projects
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

const UNIT_WORDS: Record<PriceUnit, string> = { lakh: 'lakhs', crore: 'crores' };

/** Says which unit the source used, per end of the range (units finding on /v1/projects). */
function servedInNote(project: Project): string {
  const { priceMinServedIn: min, priceMaxServedIn: max } = project;
  const served =
    min === max
      ? `both prices in ${UNIT_WORDS[min]}`
      : `the lowest price in ${UNIT_WORDS[min]} and the highest in ${UNIT_WORDS[max]}`;
  return `The source served ${served}, not rupees as its documentation says. They are converted to rupees here.`;
}

function ProjectDetail({ project }: { project: Project }) {
  return (
    <article className="detail" data-project-id={project.project_id}>
      <header className="detail-head">
        <h1 className="detail-title">{project.apartment_name}</h1>
        <p className="detail-sub">
          <span data-field="locality">{titleCase(project.locality)}</span>
          <span data-field="developer">By {project.developer_name}</span>
          <span data-field="status">{projectStatusLabel(project.project_status)}</span>
        </p>
      </header>

      <div className="detail-body">
        <aside className="detail-price card" aria-label="Price range and unit sizes">
          <p className="detail-price-main project-price num" data-field="price">
            {/* Each amount stays whole, so a narrow column breaks the line at "to". */}
            {formatInrRange(project.priceMinInr, project.priceMaxInr)
              .split(' to ')
              .map((amount, index) => (
                <span key={index}>
                  {index > 0 ? ' to ' : null}
                  <span className="nowrap">{amount}</span>
                </span>
              ))}
          </p>
          <p className="detail-price-full num" data-field="price-full">
            {formatInrFull(project.priceMinInr)} to {formatInrFull(project.priceMaxInr)}
          </p>

          <dl className="detail-areas">
            <Fact label="Unit sizes">
              <span className="num" data-field="area">
                {formatSqftRange(project.min_area_sqft, project.max_area_sqft)}
              </span>
            </Fact>
            <Fact label="Possession">
              <span className="num" data-field="possession">
                {formatDateIST(project.possession_date)}
              </span>
            </Fact>
          </dl>
          <p className="detail-note" data-field="price-note">
            {servedInNote(project)}
          </p>
        </aside>

        <div className="detail-main">
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="detail-section-title">
              About this project
            </h2>
            <dl className="facts">
              <Fact label="Developer">{project.developer_name}</Fact>
              <Fact label="Status">{projectStatusLabel(project.project_status)}</Fact>
              <Fact label="Launched">{formatDateIST(project.launch_date)}</Fact>
              <Fact label="Towers">{formatCount(project.total_towers)}</Fact>
              <Fact label="Floors">{formatCount(project.total_floors)}</Fact>
              <Fact label="Units">{formatCount(project.total_units)}</Fact>
              <Fact label="RERA number">
                <span className="num">{project.rera_number}</span>
              </Fact>
              <Fact label="Project ID">
                <span className="num">{project.project_id}</span>
              </Fact>
            </dl>
          </section>

          <section aria-labelledby="listings-heading">
            <h2 id="listings-heading" className="detail-section-title">
              Homes for sale in this project
            </h2>
            <p>
              <span className="num project-count" data-field="total-listings">
                {project.total_listings}
              </span>{' '}
              according to the source
            </p>
            <p className="detail-note">
              Treat this count as approximate. The source counts only live listings, and for 129 of its 470
              projects the figure disagrees even with that.
            </p>
          </section>

          <section aria-labelledby="amenities-heading">
            <h2 id="amenities-heading" className="detail-section-title">
              Amenities
            </h2>
            {project.amenities.length ? (
              // Developer-supplied text is data. It is rendered as plain text and never acted on.
              <ul className="amenities">
                {project.amenities.map((amenity, index) => (
                  <li key={index} data-field="amenity">
                    {amenity}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None listed.</p>
            )}
            <p className="detail-note">Supplied with the project and shown as supplied.</p>
          </section>
        </div>
      </div>
    </article>
  );
}

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useRecord<RawProject, Project>(
    `/v1/projects/${encodeURIComponent(id)}`,
    normaliseProject,
    'project',
  );

  let body;
  if (state.status === 'loading') {
    body = <StatePanel tone="loading" title="Loading this project" />;
  } else if (state.status === 'not-found') {
    body = (
      <StatePanel
        tone="empty"
        title="This project doesn't exist"
        action={
          <Link to="/projects" className="btn btn-primary">
            Browse new projects
          </Link>
        }
      >
        No project has the ID {id}. It may have been mistyped.
      </StatePanel>
    );
  } else if (state.status === 'error') {
    body = (
      <StatePanel
        tone="error"
        title="This project couldn't be loaded"
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
    body = <ProjectDetail project={state.item} />;
  }

  return (
    <>
      <BackLink />
      {body}
    </>
  );
}
