import { insideSpringfield, type Coords } from './model';

export type SearchResult = Coords & { label: string };
export async function geocodeAddress(address: string, signal?: AbortSignal): Promise<SearchResult> {
  const clean = address.trim();
  if (!clean) throw new Error('Enter a Springfield address or street first.');
  const query = /springfield/i.test(clean) ? clean : `${clean}, Springfield, Oregon`;
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q: query, lat: '44.0505', lon: '-122.9900', limit: '5' }).toString();
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Address search is unavailable. Please place the pin on the map instead.');
  const data = await response.json();
  for (const feature of Array.isArray(data.features) ? data.features : []) {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || typeof lng !== 'number' || !insideSpringfield({ lat, lng })) continue;
    const properties = feature.properties ?? {};
    const label = [properties.housenumber, properties.street || properties.name, properties.city]
      .filter(v => typeof v === 'string').join(' ');
    return { lat, lng, label: label || clean };
  }
  throw new Error('No matching Springfield location found. Place the pin manually; no location has been guessed.');
}
