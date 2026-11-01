import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeAddress } from './geocode';

afterEach(() => vi.unstubAllGlobals());
describe('address search', () => {
  it('validates input without a network request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(geocodeAddress('  ')).rejects.toThrow('Enter a Springfield');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects unavailable services instead of guessing an address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(geocodeAddress('Example St')).rejects.toThrow('unavailable');
  });
  it('rejects empty and out-of-area results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      features: [{ geometry: { coordinates: [-73.9, 40.7] } }, { geometry: { coordinates: ['-123.02', '44.05'] } }],
    }) }));
    await expect(geocodeAddress('Example St')).rejects.toThrow('No matching Springfield');
  });
  it('accepts in-area coordinates with an explicitly untrusted text label', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      features: [{ geometry: { coordinates: [-123.02, 44.05] }, properties: {
        housenumber: '100', street: '<img src=x onerror=alert(1)>', city: 'Springfield',
      } }],
    }) });
    vi.stubGlobal('fetch', fetch);
    const result = await geocodeAddress('Example St');
    expect(result).toEqual({ lat: 44.05, lng: -123.02, label: '100 <img src=x onerror=alert(1)> Springfield' });
    expect(String(fetch.mock.calls[0][0])).toContain('Springfield');
  });
  it('surfaces network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failed')));
    await expect(geocodeAddress('Example St')).rejects.toThrow('Network failed');
  });
});
