import type { ReactNode } from 'react';

export type BarRow = { key: string; label: string; value: number; extra?: ReactNode };

type Props = {
  caption: string;
  labelHeading: string;
  valueHeading: string;
  extraHeading?: string;
  rows: BarRow[];
  format: (value: number) => string;
};

/**
 * One series as a table with an inline bar per row. The table is the accessible
 * view; the bar only helps the eye compare. Value at the bar tip, single hue, no legend.
 */
export function BarList({ caption, labelHeading, valueHeading, extraHeading, rows, format }: Props) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <table className="bar-list">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{labelHeading}</th>
          <th scope="col">{valueHeading}</th>
          {extraHeading ? (
            <th scope="col" className="bar-list-extra">
              {extraHeading}
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} title={`${row.label}: ${format(row.value)}`}>
            <th scope="row">{row.label}</th>
            <td className="bar-list-value">
              <span className="bar-track">
                <span className="bar" style={{ width: `${(row.value / max) * 100}%` }} aria-hidden="true" />
                <span className="bar-label num">{format(row.value)}</span>
              </span>
            </td>
            {extraHeading ? <td className="bar-list-extra num">{row.extra}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
