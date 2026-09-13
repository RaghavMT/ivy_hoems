import { describe, expect, it } from 'vitest';
import { bedroomsLabel, furnishingLabel, listingTitle, resultsSummary, titleCase } from '../lib/labels';

describe('titleCase', () => {
  it('capitalises each word, including after hyphens', () => {
    expect(titleCase('banjara hills')).toBe('Banjara Hills');
    expect(titleCase('north-east')).toBe('North-East');
    expect(titleCase('madhapur')).toBe('Madhapur');
  });
});

describe('listingTitle', () => {
  it('leads with bedrooms and type, then the building', () => {
    expect(listingTitle({ bedroom: 2, property_type: 'apartment', apartment_name: 'Lodha Habitat' })).toBe(
      '2 BHK apartment, Lodha Habitat',
    );
  });

  it('calls a zero-bedroom plot a plot', () => {
    expect(listingTitle({ bedroom: 0, property_type: 'plot', apartment_name: 'Green Acres' })).toBe('Plot, Green Acres');
  });

  it('calls other zero-bedroom homes studios', () => {
    expect(listingTitle({ bedroom: 0, property_type: 'apartment', apartment_name: 'Sky Towers' })).toBe(
      'Studio apartment, Sky Towers',
    );
  });

  it('leaves out an empty building name', () => {
    expect(listingTitle({ bedroom: 3, property_type: 'villa', apartment_name: '' })).toBe('3 BHK villa');
    expect(listingTitle({ bedroom: 3, property_type: 'villa', apartment_name: null })).toBe('3 BHK villa');
  });
});

describe('furnishingLabel', () => {
  it('reads as plain words', () => {
    expect(furnishingLabel('fully-furnished')).toBe('Fully furnished');
    expect(furnishingLabel('semi-furnished')).toBe('Semi-furnished');
    expect(furnishingLabel('unfurnished')).toBe('Unfurnished');
  });
});

describe('bedroomsLabel', () => {
  it('names zero bedrooms and counts the rest', () => {
    expect(bedroomsLabel(0)).toBe('Studio / plot');
    expect(bedroomsLabel(1)).toBe('1 BHK');
    expect(bedroomsLabel(5)).toBe('5 BHK');
  });
});

describe('resultsSummary', () => {
  it('says when nothing matches', () => {
    expect(resultsSummary(0, false, 'homes')).toBe('No homes match these filters');
  });

  it('says how many are shown while more are available', () => {
    expect(resultsSummary(50, true, 'homes')).toBe('Showing 50 homes so far');
  });

  it('says when everything matching is shown', () => {
    expect(resultsSummary(62, false, 'homes')).toBe('All 62 matching homes shown');
  });

  it('uses the singular for one', () => {
    expect(resultsSummary(1, false, 'homes')).toBe('All 1 matching home shown');
  });
});
