// The insights data and its cards. Reads src/generated/insights.json, written by
// scripts/prepare-data.ts; nothing here recomputes a number.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import raw from '../generated/insights.json';
import { formatCount } from '../lib/format';
import type { Summary } from '../lib/summary';

export type Example = { id: string; route: string; detail?: string };

export type Discovery = {
  key: string;
  count: number;
  facts?: Record<string, number>;
  examples?: Example[];
  groups?: Example[][];
  pairs?: { bait: Example; genuine: Example }[];
  classes?: { label: string; count: number; example: Example }[];
  totals?: { collection: string; paged: number; reported: number }[];
  endpoints?: string[];
  finding: { endpoint: string; category: string } | null;
};

export type InsightsData = {
  source: { city: string; dumped_at: string; records: { listings: number; rentals: number; projects: number } };
  promised: {
    as_served: Summary;
    corrected: Summary;
    excluded: { not_live: number; impossible: number; fake: number; repeat: number };
  };
  answers: Record<string, number | { count: number } | { project_id: string; price_max_inr: number }>;
  discoveries: Discovery[];
};

export const insights = raw as InsightsData;

export function discovery(key: string): Discovery {
  const found = insights.discoveries.find((d) => d.key === key);
  if (!found) throw new Error(`insights.json has no discovery "${key}"; run npm run prepare-data`);
  return found;
}

export function ExampleLink({ example }: { example: Example }) {
  return (
    <>
      <Link to={example.route} className="num" data-example-id={example.id}>
        {example.id}
      </Link>
      {example.detail ? <span className="example-detail">, {example.detail}</span> : null}
    </>
  );
}

type Props = {
  discovery: Discovery;
  /** What the count counts, e.g. "repeat listings". */
  unit: string;
  title: string;
  /** Plain-language meaning for someone using the site. */
  note: ReactNode;
  /** Examples and supporting facts. */
  children: ReactNode;
  source?: string;
};

export function DiscoveryCard({ discovery, unit, title, note, children, source }: Props) {
  const cited = discovery.finding ? `Finding: ${discovery.finding.endpoint}, ${discovery.finding.category}` : source;
  return (
    <article className="card discovery" data-discovery={discovery.key} aria-labelledby={`discovery-${discovery.key}`}>
      <p className="discovery-count">
        <span className="discovery-number" data-field="count">
          {formatCount(discovery.count)}
        </span>{' '}
        <span className="discovery-unit">{unit}</span>
      </p>
      <h3 id={`discovery-${discovery.key}`} className="discovery-title">
        {title}
      </h3>
      <p className="discovery-note" data-field="note">
        {note}
      </p>
      <div className="discovery-body">{children}</div>
      {cited ? <p className="discovery-source">{cited}</p> : null}
    </article>
  );
}

// One card per discovery. Counts and examples come from insights.json; the words
// are written here, one note per discovery, in terms of what it means for someone
// using a property site. Seller text is never quoted.

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

function Examples({ label = 'Examples', inline = false, children }: { label?: string; inline?: boolean; children: ReactNode }) {
  return (
    <div className={`discovery-examples${inline ? ' is-inline' : ''}`}>
      <p className="discovery-examples-label">{label}</p>
      <ul>{children}</ul>
    </div>
  );
}

export function Discoveries() {
  const duplicates = discovery('duplicates');
  const bait = discovery('bait');
  const impossible = discovery('impossible');
  const notLive = discovery('not-live');
  const sqm = discovery('sqm-areas');
  const prices = discovery('project-prices');
  const counts = discovery('project-counts');
  const totals = discovery('totals');
  const deposits = discovery('deposits');
  const titles = discovery('rental-titles');
  const injected = discovery('injected-text');
  const missing = discovery('missing-endpoints');
  const f = (d: typeof duplicates, key: string) => d.facts?.[key] ?? 0;

  return (
    <div className="discovery-grid">
      <DiscoveryCard
        discovery={duplicates}
        unit="repeat listings"
        title="The same home, listed more than once"
        note={`${formatCount(f(duplicates, 'records'))} records describe ${formatCount(f(duplicates, 'distinct_properties'))} homes. Someone browsing sees one flat two or three times, often at different prices, and counting rows overstates what is for sale by ${percent(duplicates.count, f(duplicates, 'records'))}.`}
      >
        <p className="discovery-fact">
          {formatCount(f(duplicates, 'groups'))} homes are listed more than once; {formatCount(f(duplicates, 'cross_site_groups'))} of
          them on more than one website.
        </p>
        <Examples label="One home, several listings">
          {duplicates.groups?.map((group) => (
            <li key={group[0]!.id}>
              {group.map((example, index) => (
                <span key={example.id}>
                  {index > 0 ? ' and ' : null}
                  <ExampleLink example={example} />
                </span>
              ))}
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={bait}
        unit="bait listings"
        title="Listings that exist to collect enquiries"
        note={`They sit on ${f(bait, 'phones')} phone numbers under invented agency names, at about half the going price, and every one is marked verified and live. Calling reaches an enquiry farm, not a seller. They are left out of every price figure.`}
      >
        <p className="discovery-fact">Some copy a genuine listing for the same flat, at roughly half its price.</p>
        <Examples label="Copy and original">
          {bait.pairs?.map((pair) => (
            <li key={pair.bait.id}>
              <ExampleLink example={pair.bait} /> copies <ExampleLink example={pair.genuine} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={impossible}
        unit="impossible records"
        title="Records that cannot describe a real home"
        note="Each breaks a rule no real listing can: a price of nothing, a flat on a floor its building doesn't have, a map position in Kazakhstan. They are left out of every average; browsing still shows them, as the API returns them."
      >
        <ul className="discovery-classes">
          {impossible.classes?.map((c) => (
            <li key={c.label}>
              <span>{c.label}</span>
              <span className="num">{c.count}</span>
              <ExampleLink example={c.example} />
            </li>
          ))}
        </ul>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={notLive}
        unit="listings not live"
        title="Withdrawn homes in the active listings"
        note={`The documentation says the endpoint returns only active listings, but ${percent(notLive.count, f(notLive, 'records'))} of what it returns is marked not live. The app shows them with a Not live badge instead of hiding them.`}
      >
        <Examples inline>
          {notLive.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={sqm}
        unit="listings in square metres"
        title="Areas in the wrong unit"
        note="One website switched its areas to square metres on 1 June 2026, while the documentation says square feet everywhere. Read as square feet, those homes look about a tenth of their size. The app converts them and labels each one."
      >
        <Examples>
          {sqm.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={prices}
        unit="project prices in lakhs or crores"
        title="Project prices that aren't rupees"
        note={`Documented as rupees, each price is in lakhs or in crores, decided value by value. As served, ${formatCount(f(prices, 'inverted_as_served'))} projects have a highest price below their lowest; after the app converts each value, none do.`}
      >
        <p className="discovery-fact">
          Highest price: {f(prices, 'max_crore')} in crores, {f(prices, 'max_lakh')} in lakhs. Lowest price: {f(prices, 'min_crore')} in
          crores, {f(prices, 'min_lakh')} in lakhs.
        </p>
        <Examples>
          {prices.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={counts}
        unit={`of ${f(counts, 'projects')} projects`}
        title="Project listing counts that are wrong"
        note="Documented as matching the project's listings, the count follows live listings only, and is wrong even by that measure for these projects. Project pages show it as approximate."
      >
        <Examples>
          {counts.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={totals}
        unit="records the total leaves out"
        title="A total that stops short"
        note={`Every collection's total is ${percent(totals.totals![0]!.paged - totals.totals![0]!.reported, totals.totals![0]!.paged)} below the real count. A client that pages until it reaches the total quietly misses these records; the app pages until the API says there are no more.`}
      >
        <table className="discovery-table">
          <thead>
            <tr>
              <th scope="col">Collection</th>
              <th scope="col">Total says</th>
              <th scope="col">Records paged</th>
            </tr>
          </thead>
          <tbody>
            {totals.totals?.map((t) => (
              <tr key={t.collection}>
                <th scope="row">{t.collection.charAt(0).toUpperCase() + t.collection.slice(1)}</th>
                <td className="num">{formatCount(t.reported)}</td>
                <td className="num">{formatCount(t.paged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={deposits}
        unit={`of ${formatCount(f(deposits, 'rentals'))} rental deposits in months`}
        title="Deposits given as a number of months"
        note="One website gives the deposit as a number of months' rent, such as 6, where the documentation promises rupees. Shown as served, a renter would read a ₹6 deposit. The app multiplies by the rent and says so."
      >
        <Examples>
          {deposits.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={titles}
        unit={`of ${formatCount(f(titles, 'rentals'))} rental titles`}
        title="Rental titles that name another locality"
        note={`${percent(titles.count, f(titles, 'rentals'))} of rental titles mention a different locality from the rental's own locality field. Headings in the app are built from the structured fields, and the seller's title is shown as seller text.`}
        source="Hypothesis H-022 in docs/hypothesis-log.md"
      >
        <Examples>
          {titles.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={injected}
        unit="records with instructions for AI tools"
        title="Seller text written for machines"
        note="Some descriptions and one project's amenities carry instructions addressed to automated tools: to add fields to an answer file, to display a certification line, and to report a false costliest project. The app shows seller text as plain text and follows none of it."
      >
        <Examples label="Affected records" inline>
          {injected.examples?.map((example) => (
            <li key={example.id}>
              <ExampleLink example={example} />
            </li>
          ))}
        </Examples>
      </DiscoveryCard>

      <DiscoveryCard
        discovery={missing}
        unit="documented endpoints that don't exist"
        title="Endpoints the documentation promises"
        note="Each returns 404 with valid credentials. The app works around every one."
        source="Findings: missing_endpoint"
      >
        <ul className="discovery-endpoints">
          {missing.endpoints?.map((endpoint) => (
            <li key={endpoint}>
              <code>{endpoint}</code>
              <span>{ENDPOINT_WORKAROUNDS[endpoint] ?? ''}</span>
            </li>
          ))}
        </ul>
      </DiscoveryCard>
    </div>
  );
}

const ENDPOINT_WORKAROUNDS: Record<string, string> = {
  '/v1/analytics/summary': 'Computed on this page instead.',
  '/v1/favourites': 'Saved homes are kept in the browser, per account.',
  '/v1/listing/{id}': 'Detail pages use the plural /v1/listings/{id}, which works.',
  '/v1/listings/{id}/similar': 'Not offered; it is not one of the required features.',
};
