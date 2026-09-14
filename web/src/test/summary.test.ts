import { describe, expect, it } from 'vitest';
import { median, summarise } from '../lib/summary';

describe('median', () => {
  it('takes the middle value of an odd count', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('averages the two middle values of an even count', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('has no median for no values', () => {
    expect(median([])).toBeNull();
  });
});

describe('summarise: the shape /v1/analytics/summary documents', () => {
  const rows = [
    { locality: 'madhapur', bedroom: 2, price: 6_000_000, areaSqft: 1000 },
    { locality: 'madhapur', bedroom: 3, price: 9_000_000, areaSqft: 1500 },
    { locality: 'kompally', bedroom: 2, price: 4_000_000, areaSqft: 800 },
    { locality: 'madhapur', bedroom: 2, price: 7_000_000, areaSqft: 0 },
  ];

  it('counts every row and takes medians of price and price per square foot', () => {
    const s = summarise(rows);
    expect(s.total_listings).toBe(4);
    expect(s.median_price).toBe(6_500_000);
    // Rows without an area cannot give a rate: 6000, 6000, 5000.
    expect(s.median_price_per_sqft).toBe(6000);
  });

  it('groups by locality with a count and median price, alphabetically', () => {
    expect(summarise(rows).by_locality).toEqual([
      { locality: 'kompally', count: 1, median_price: 4_000_000 },
      { locality: 'madhapur', count: 3, median_price: 7_000_000 },
    ]);
  });

  it('groups by bedroom count in order', () => {
    expect(summarise(rows).by_bhk).toEqual([
      { bedroom: 2, count: 3 },
      { bedroom: 3, count: 1 },
    ]);
  });

  it('rounds medians to whole rupees', () => {
    const s = summarise([
      { locality: 'miyapur', bedroom: 1, price: 1_000_001, areaSqft: 3 },
      { locality: 'miyapur', bedroom: 1, price: 1_000_002, areaSqft: 3 },
    ]);
    expect(s.median_price).toBe(1_000_002);
    expect(Number.isInteger(s.median_price_per_sqft)).toBe(true);
  });
});
