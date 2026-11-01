import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, directions, eventDate, filterHouses, insideSpringfield, parseHouse, validateHouse, type House } from './model';

const house: House = {
  id: 'one', address: 'Example test home', neighborhood: 'Washburne', lat: 44.05, lng: -123.02,
  hours: '5 PM - 8 PM', note: 'Glow sticks!', status: 'plenty', tags: ['teal_pumpkin'], pinIcon: '🎃', ownerUid: 'host', upvotes: 0,
};
describe('house data', () => {
  it('accepts a valid listing and only walking direction coordinates', () => {
    expect(validateHouse(house)).toBeNull();
    expect(parseHouse('one', house)).toEqual(house);
    expect(directions(house)).toContain('travelmode=walking&destination=44.05,-123.02');
  });
  it.each([
    { status: 'unknown' }, { pinIcon: '<img src=x onerror=alert(1)>' },
    { ownerUid: undefined }, { lat: NaN }, { lng: Infinity }, { tags: ['not-a-tag'] },
    { upvotes: -1 }, { address: 'x'.repeat(181) }, { note: 'x'.repeat(1001) }, { neighborhood: 'Seattle' },
    { tags: ['full_size', 'full_size'] }, { status: '__proto__' },
  ])('rejects invalid public data %j', patch => {
    expect(() => parseHouse('one', { ...house, ...patch })).toThrow();
  });
  it('does not trust unknown coordinates', () => {
    expect(insideSpringfield({ lat: 0, lng: 0 })).toBe(false);
    expect(insideSpringfield({ lat: 44.05, lng: -123.02 })).toBe(true);
  });
});
describe('directory filters', () => {
  const houses = [house, { ...house, id: 'two', status: 'out' as const, tags: [], neighborhood: 'Thurston' as const }];
  it('hides lights-out houses by default', () => expect(filterHouses(houses, DEFAULT_FILTERS, [])).toEqual([house]));
  it('supports trimmed case-insensitive note search', () => {
    expect(filterHouses(houses, { ...DEFAULT_FILTERS, query: ' GLOW ' }, [])).toEqual([house]);
  });
  it('combines neighborhood, saved and tag filters', () => {
    expect(filterHouses(houses, { ...DEFAULT_FILTERS, savedOnly: true, tag: 'teal_pumpkin', neighborhood: 'Washburne' }, ['one'])).toEqual([house]);
    expect(filterHouses(houses, { ...DEFAULT_FILTERS, savedOnly: true }, [])).toEqual([]);
    expect(filterHouses(houses, { ...DEFAULT_FILTERS, activeOnly: false }, [])).toHaveLength(2);
  });
});
describe('event dates', () => {
  it('uses an explicit date rather than claiming the event is always tonight', () => expect(eventDate('2026-11-01')).toBe('2026-11-01'));
  it.each(['2026-02-30', 'not-a-date', '2026-1-1'])('rejects invalid date %s', value => expect(() => eventDate(value)).toThrow());
});
