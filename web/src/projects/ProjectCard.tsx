import { Link } from 'react-router-dom';
import { formatCount, formatDateIST, formatInrRange, formatSqftRange } from '../lib/format';
import { projectStatusLabel, titleCase } from '../lib/labels';
import type { Project } from '../lib/normalise';

function details(project: Project): string[] {
  const parts = [`Possession ${formatDateIST(project.possession_date)}`];
  if (project.total_towers > 0) parts.push(`${project.total_towers} ${project.total_towers === 1 ? 'tower' : 'towers'}`);
  if (project.total_units > 0) parts.push(`${formatCount(project.total_units)} units`);
  return parts;
}

export function ProjectCard({ project }: { project: Project }) {
  return (
    <li className="card listing-card" data-project-id={project.project_id}>
      <div className="listing-main">
        <h2 className="listing-title">
          <Link to={`/projects/${encodeURIComponent(project.project_id)}`}>{project.apartment_name}</Link>
        </h2>
        <p className="listing-place">
          <span data-field="locality">{titleCase(project.locality)}</span>
          <span data-field="developer">By {project.developer_name}</span>
          <span data-field="status">{projectStatusLabel(project.project_status)}</span>
        </p>
        <p className="listing-details">
          {details(project).map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
      </div>

      <div className="listing-side">
        <p className="listing-price project-price num" data-field="price">
          {formatInrRange(project.priceMinInr, project.priceMaxInr)}
        </p>
        <p className="listing-area num" data-field="area">
          {formatSqftRange(project.min_area_sqft, project.max_area_sqft)}
        </p>
      </div>
    </li>
  );
}
