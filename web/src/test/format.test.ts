import { describe, expect, it } from 'vitest';
import { formatDateIST, formatInr, formatInrFull, formatSqft } from '../lib/format';

describe('formatDateIST', () => {
  it('shows the calendar date in India, not in UTC', () => {
    // 18:37 UTC on 8 July is 00:07 IST on 9 July.
    expect(formatDateIST('2026-07-08T18:37:00Z')).toBe('9 Jul 2026');
    expect(formatDateIST('2026-05-31T20:51:00Z')).toBe('1 Jun 2026');
  });

  it('keeps the same date when UTC and IST agree', () => {
    expect(formatDateIST('2026-04-03T05:49:00Z')).toBe('3 Apr 2026');
  });
});

describe('formatInr', () => {
  it('shows crores to two decimals, trimming zeros', () => {
    expect(formatInr(10_600_000)).toBe('₹1.06 Cr');
    expect(formatInr(41_500_000)).toBe('₹4.15 Cr');
    expect(formatInr(10_000_000)).toBe('₹1 Cr');
  });

  it('shows lakhs to two decimals, trimming zeros', () => {
    expect(formatInr(4_550_000)).toBe('₹45.5 L');
    expect(formatInr(100_000)).toBe('₹1 L');
  });

  it('rolls up to crores rather than printing 100 lakhs', () => {
    expect(formatInr(9_999_999)).toBe('₹1 Cr');
  });

  it('shows amounts under a lakh in full with Indian grouping', () => {
    expect(formatInr(33_000)).toBe('₹33,000');
    expect(formatInr(99_999)).toBe('₹99,999');
  });

  it('keeps the sign on a negative amount, so bad data stays visible', () => {
    expect(formatInr(-19_260_000)).toBe('-₹1.93 Cr');
  });
});

describe('formatInrFull', () => {
  it('uses Indian digit grouping', () => {
    expect(formatInrFull(10_600_000)).toBe('₹1,06,00,000');
    expect(formatInrFull(45_500)).toBe('₹45,500');
  });
});

describe('formatSqft', () => {
  it('groups digits and names the unit', () => {
    expect(formatSqft(732)).toBe('732 sq ft');
    expect(formatSqft(1501)).toBe('1,501 sq ft');
  });
});
