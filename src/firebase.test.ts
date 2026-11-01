import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuration } from './firebase';

const env = {
  VITE_FIREBASE_API_KEY: 'test-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_APP_ID: 'test-app',
};
afterEach(() => vi.unstubAllGlobals());
describe('deployment configuration', () => {
  it('explains missing configuration instead of initializing an invalid Firebase app', () => {
    expect(() => configuration({})).toThrow('Firebase is not configured');
    expect(() => configuration({ ...env, VITE_FIREBASE_API_KEY: ' ' })).toThrow('Firebase is not configured');
  });
  it('uses production services by default', () => {
    expect(configuration(env)).toEqual({
      config: { apiKey: 'test-key', authDomain: 'test.firebaseapp.com', projectId: 'test-project', appId: 'test-app' },
      emulator: false, eventId: '2026-11-01',
    });
  });
  it('rejects invalid event dates', () => {
    expect(() => configuration({ ...env, VITE_EVENT_DATE: '2026-02-31' })).toThrow('VITE_EVENT_DATE');
  });
  it('refuses emulator mode on deployed domains', () => {
    vi.stubGlobal('window', { location: { hostname: 'second-halloween.netlify.app' } });
    expect(() => configuration({ ...env, VITE_USE_EMULATORS: 'true' })).toThrow('only be used on localhost');
  });
  it('permits explicit emulator mode on localhost', () => {
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } });
    expect(configuration({ ...env, VITE_USE_EMULATORS: 'true' }).emulator).toBe(true);
  });
});
