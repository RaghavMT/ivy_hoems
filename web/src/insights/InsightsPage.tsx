import { PageHeader } from '../components/PageHeader';
import { formatCount, formatDateIST, formatInr } from '../lib/format';
import { bedroomsLabel, titleCase } from '../lib/labels';
import type { Summary } from '../lib/summary';
import { BarList } from './BarList';
import { Discoveries, insights } from './DiscoveryCard';
import './insights.css';

const orDash = (value: number | null, format: (n: number) => string) => (value === null ? 'None' : format(value));

function PromisedTable({ asServed, corrected }: { asServed: Summary; corrected: Summary }) {
  const rows = [
    { label: 'Listings', field: 'total', served: formatCount(asServed.total_listings), fixed: formatCount(corrected.total_listings) },
    { label: 'Median price', field: 'median-price', served: orDash(asServed.median_price, formatInr), fixed: orDash(corrected.median_price, formatInr) },
    {
      label: 'Median price per sq ft',
      field: 'median-rate',
      served: orDash(asServed.median_price_per_sqft, (n) => `₹${formatCount(n)}`),
      fixed: orDash(corrected.median_price_per_sqft, (n) => `₹${formatCount(n)}`),
    },
  ];
  return (
    <div className="table-scroll">
      <table className="promised-table">
        <caption className="visually-hidden">The documented summary, as served and corrected</caption>
        <thead>
          <tr>
            <th scope="col">Documented field</th>
            <th scope="col">As served</th>
            <th scope="col">Corrected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} data-row={row.field}>
              <th scope="row">{row.label}</th>
              <td className="num" data-column="as-served">
                {row.served}
              </td>
              <td className="num" data-column="corrected">
                {row.fixed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ANSWER_LABELS: [string, string][] = [
  ['total_listing_records', 'Listing records returned'],
  ['unique_properties', 'Distinct homes behind them'],
  ['active_listings', 'Listings that are live'],
  ['corrupt_listing_ids', 'Impossible listings'],
  ['total_monthly_rent', 'Monthly rent, all Madhapur rentals'],
  ['avg_price_per_sqft_2bhk', 'Average price per sq ft, live 2 BHK'],
  ['costliest_project', 'Costliest project'],
  ['listings_last_7_days', 'Listings posted in the seven days before 10 Sep 2026, IST'],
  ['fake_listing_ids', 'Bait listings'],
  ['projects_with_wrong_listing_count', 'Projects with a wrong listing count'],
];

const RUPEE_ANSWERS = new Set(['total_monthly_rent', 'avg_price_per_sqft_2bhk']);

function answerText(key: string, value: InsightsAnswer): string {
  if (typeof value === 'number') {
    const digits = Number.isInteger(value) ? 0 : 2;
    const text = value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return RUPEE_ANSWERS.has(key) ? `₹${text}` : text;
  }
  if ('count' in value) return formatCount(value.count);
  return `${value.project_id}, ${formatInr(value.price_max_inr)}`;
}
type InsightsAnswer = (typeof insights.answers)[string];

export function InsightsPage() {
  const { source, promised } = insights;
  const { as_served: asServed, corrected, excluded } = promised;

  return (
    <>
      <PageHeader title="Data insights">
        What the {source.city} property data shows, and where it cannot be taken at face value. Every number here
        comes from a full copy of the API taken on {formatDateIST(source.dumped_at)}: {formatCount(source.records.listings)} listings,{' '}
        {formatCount(source.records.rentals)} rentals and {formatCount(source.records.projects)} projects.
      </PageHeader>

      <section className="insights-section" aria-labelledby="promised-heading">
        <h2 id="promised-heading" className="insights-heading">
          The summary the documentation promised
        </h2>
        <div className="card insights-notice" role="note" data-field="missing-summary">
          <p>
            The documentation describes <code>GET /v1/analytics/summary</code> as ready-made figures for a dashboard. It
            returns 404. The same figures are computed here from the copy of the data, in the documented shape.
          </p>
        </div>

        <div className="card insights-panel">
          <PromisedTable asServed={asServed} corrected={corrected} />
          <p className="insights-caption">
            <strong>As served</strong> counts every record the API returns, with values as given.{' '}
            <strong>Corrected</strong> keeps one record per home that is live and believable, with areas in square feet. It
            leaves out {formatCount(excluded.not_live)} listings that are not live, {formatCount(excluded.impossible)} impossible
            records, {formatCount(excluded.fake)} bait listings and {formatCount(excluded.repeat)} repeat listings of a home
            already counted.
          </p>
        </div>

        <div className="insights-bars">
          <div className="card insights-panel">
            <BarList
              caption="Corrected listings by locality"
              labelHeading="Locality"
              valueHeading="Listings"
              extraHeading="Median price"
              format={formatCount}
              rows={corrected.by_locality.map((row) => ({
                key: row.locality,
                label: titleCase(row.locality),
                value: row.count,
                extra: orDash(row.median_price, formatInr),
              }))}
            />
          </div>
          <div className="card insights-panel">
            <BarList
              caption="Corrected listings by bedrooms"
              labelHeading="Bedrooms"
              valueHeading="Listings"
              format={formatCount}
              rows={corrected.by_bhk.map((row) => ({
                key: String(row.bedroom),
                label: bedroomsLabel(row.bedroom),
                value: row.count,
              }))}
            />
          </div>
        </div>
      </section>

      <section className="insights-section" aria-labelledby="discoveries-heading">
        <h2 id="discoveries-heading" className="insights-heading">
          What the data shows
        </h2>
        <p className="insights-lede">
          Each of these was reproduced against the data before being reported. Example IDs open the record in the app.
        </p>
        <Discoveries />
      </section>

      <section className="insights-section" aria-labelledby="answers-heading">
        <h2 id="answers-heading" className="insights-heading">
          The ten submitted answers
        </h2>
        <div className="card insights-panel">
          <dl className="answers">
            {ANSWER_LABELS.map(([key, label]) => (
              <div key={key} className="answer" data-answer={key}>
                <dt>{label}</dt>
                <dd className="num">{answerText(key, insights.answers[key]!)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
