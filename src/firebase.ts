import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, signInAnonymously, onAuthStateChanged,
  type Auth, type User,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { eventDate } from './model';

export type Services = { auth: Auth; db: Firestore; eventId: string };
export function configuration(env: Record<string, string | undefined>) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  if (Object.values(config).some(v => !v?.trim())) {
    throw new Error('Firebase is not configured. Set the four VITE_FIREBASE_* values from .env.example, then rebuild. See the repository README for setup.');
  }
  const emulator = env.VITE_USE_EMULATORS === 'true';
  if (emulator && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('Firebase emulators may only be used on localhost. Disable VITE_USE_EMULATORS and rebuild.');
  }
  return { config, emulator, eventId: eventDate(env.VITE_EVENT_DATE) };
}

let services: Services | undefined;
export function getServices(): Services {
  if (services) return services;
  const { config, emulator, eventId } = configuration(import.meta.env);
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  services = { auth, db, eventId };
  return services;
}

let anonymousSignIn: Promise<unknown> | undefined;
export async function finishGuestSignIn() {
  await anonymousSignIn;
}
export function watchUser(auth: Auth, next: (user: User | null) => void, fail: (error: unknown) => void) {
  return onAuthStateChanged(auth, user => {
    next(user);
    if (!user) {
      anonymousSignIn ??= signInAnonymously(auth).finally(() => { anonymousSignIn = undefined; });
      void anonymousSignIn.catch(fail);
    }
  }, fail);
}

export function errorMessage(error: unknown) {
  console.error(error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'permission-denied') return 'Permission denied. Check your account and the deployed Firestore rules.';
  if (code === 'unavailable' || code === 'auth/network-request-failed') return 'Connection failed. Check your internet connection and try again.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) return 'Email or password is incorrect.';
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') return 'This email already has an account. Sign in instead.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait before trying again.';
  if (code === 'auth/operation-not-allowed') return 'This sign-in method is disabled. The organizer must enable Anonymous and Email/Password in Firebase.';
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
