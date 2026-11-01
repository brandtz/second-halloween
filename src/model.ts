export const CENTER = { lat: 44.0505, lng: -122.9900 };
export const NEIGHBORHOODS = [
  { id: 'All', name: 'All Springfield', ...CENTER, zoom: 13 },
  { id: 'Washburne', name: 'Washburne Historic District', lat: 44.0485, lng: -123.0215, zoom: 15 },
  { id: 'Thurston', name: 'Thurston', lat: 44.0475, lng: -122.9180, zoom: 14 },
  { id: 'Hayden Bridge', name: 'Hayden Bridge', lat: 44.0725, lng: -123.0050, zoom: 14 },
  { id: 'Centennial', name: 'Centennial / Mid-Town', lat: 44.0535, lng: -122.9850, zoom: 14 },
  { id: 'Kelly Butte', name: 'Kelly Butte', lat: 44.0455, lng: -123.0350, zoom: 15 },
  { id: 'Gateway', name: 'Gateway / RiverBend', lat: 44.0780, lng: -123.0420, zoom: 14 },
  { id: 'Mohawk', name: 'Mohawk / Marcola Rd', lat: 44.0660, lng: -122.9680, zoom: 14 },
  { id: 'Downtown', name: 'Downtown / Main St', lat: 44.0462, lng: -123.0220, zoom: 15 },
  { id: 'Jasper', name: 'Jasper / South Springfield', lat: 44.0280, lng: -122.9700, zoom: 14 },
] as const;
export const TAGS = [
  { id: 'full_size', label: 'Full-Size / Extra Candy', emoji: '🍬', color: 'orange' },
  { id: 'teal_pumpkin', label: 'Teal Pumpkin (Allergy-Friendly)', emoji: '🩵', color: 'teal' },
  { id: 'spooky_decor', label: 'Big Haunt / Spooky Decor', emoji: '🕷️', color: 'purple' },
  { id: 'warm_drinks', label: 'Warm Cider / Cocoa', emoji: '☕', color: 'amber' },
  { id: 'pet_friendly', label: 'Pet Treats Available', emoji: '🐾', color: 'green' },
] as const;
export const STATUSES = {
  plenty: { label: 'Plenty of Candy!', emoji: '🎃', color: 'green' },
  low: { label: 'Running Low', emoji: '⚡', color: 'amber' },
  out: { label: 'Out of Candy / Lights Out', emoji: '🌙', color: 'muted' },
} as const;
export const ICONS = ['🎃', '👻', '🍬', '🩵', '🕷️', '🧙‍♀️'] as const;
export type Status = keyof typeof STATUSES;
export type Tag = typeof TAGS[number]['id'];
export type Neighborhood = Exclude<typeof NEIGHBORHOODS[number]['id'], 'All'>;
export type Coords = { lat: number; lng: number };
export type HouseInput = Coords & {
  address: string;
  neighborhood: Neighborhood;
  hours: string;
  status: Status;
  tags: Tag[];
  pinIcon: typeof ICONS[number];
  note: string;
};
export type House = HouseInput & { id: string; ownerUid: string; upvotes: number };
export type Filters = {
  neighborhood: string; query: string; activeOnly: boolean; savedOnly: boolean; tag: Tag | null;
};
export const DEFAULT_FILTERS: Filters = {
  neighborhood: 'All', query: '', activeOnly: true, savedOnly: false, tag: null,
};

export function insideSpringfield(coords: Coords) {
  return Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
    && coords.lat >= 43.98 && coords.lat <= 44.14 && coords.lng >= -123.12 && coords.lng <= -122.80;
}

export function validateHouse(input: HouseInput): string | null {
  if (!input.address.trim() || input.address.length > 180) return 'Enter an address (up to 180 characters).';
  if (!input.hours.trim() || input.hours.length > 80) return 'Enter active hours (up to 80 characters).';
  if (input.note.length > 1000) return 'Keep your note under 1,000 characters.';
  if (!NEIGHBORHOODS.some(n => n.id !== 'All' && n.id === input.neighborhood)) return 'Choose a Springfield neighborhood.';
  if (!Object.hasOwn(STATUSES, input.status)) return 'Choose a valid candy status.';
  if (!ICONS.includes(input.pinIcon)) return 'Choose one of the provided map icons.';
  if (input.tags.length > TAGS.length || new Set(input.tags).size !== input.tags.length
    || input.tags.some(id => !TAGS.some(t => t.id === id))) return 'Choose valid treat tags.';
  if (!insideSpringfield(input)) return 'Place your pin within the Springfield area.';
  return null;
}

export function parseHouse(id: string, value: Record<string, unknown>): House {
  if (typeof value.address !== 'string' || typeof value.hours !== 'string' || typeof value.note !== 'string'
    || typeof value.lat !== 'number' || typeof value.lng !== 'number'
    || typeof value.ownerUid !== 'string' || !Number.isInteger(value.upvotes) || Number(value.upvotes) < 0
    || !Array.isArray(value.tags)) throw new Error('A listing has invalid data. Please contact the organizer.');
  // Validate enum values before exposing Firestore data to rendering code.
  const house = { ...value, id } as House;
  const error = validateHouse(house);
  if (error) throw new Error(`Invalid listing: ${error}`);
  return house;
}

export function filterHouses(houses: House[], filters: Filters, savedIds: string[]) {
  const query = filters.query.trim().toLowerCase();
  return houses.filter(h =>
    (filters.neighborhood === 'All' || h.neighborhood === filters.neighborhood)
    && (!filters.activeOnly || h.status !== 'out')
    && (!filters.savedOnly || savedIds.includes(h.id))
    && (!filters.tag || h.tags.includes(filters.tag))
    && (!query || `${h.address} ${h.neighborhood} ${h.note}`.toLowerCase().includes(query)));
}

export function eventDate(raw: string | undefined) {
  const value = raw || '2026-11-01';
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf())
    || date.toISOString().slice(0, 10) !== value) throw new Error('VITE_EVENT_DATE must be a valid YYYY-MM-DD date.');
  return value;
}

export function directions(house: Coords) {
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${house.lat},${house.lng}`;
}
