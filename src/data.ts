import {
  collection, doc, onSnapshot, runTransaction, serverTimestamp,
  setDoc, updateDoc, deleteDoc, type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Services } from './firebase';
import { parseHouse, validateHouse, type House, type HouseInput, type Status } from './model';

function houseCollection(s: Services) {
  return collection(s.db, 'events', s.eventId, 'houses');
}
function requireHost(user: User | null): asserts user is User {
  if (!user || user.isAnonymous) throw new Error('Sign in to a host account to manage your house.');
}
export function watchHouses(s: Services, next: (houses: House[]) => void, fail: (e: unknown) => void): Unsubscribe {
  return onSnapshot(houseCollection(s), snapshot => {
    try {
      next(snapshot.docs.map(d => parseHouse(d.id, d.data())).sort((a, b) => a.address.localeCompare(b.address)));
    } catch (e) { fail(e); }
  }, fail);
}
export function watchPreferences(s: Services, uid: string, next: (ids: string[]) => void, fail: (e: unknown) => void) {
  return onSnapshot(doc(s.db, 'events', s.eventId, 'preferences', uid), snapshot => {
    const saved = snapshot.data()?.savedIds ?? [];
    if (!Array.isArray(saved) || saved.some(id => typeof id !== 'string')) {
      fail(new Error('Your saved walk has invalid data. Please contact the organizer.'));
      return;
    }
    next(saved);
  }, fail);
}
export function watchVotes(s: Services, uid: string, next: (ids: string[]) => void, fail: (e: unknown) => void) {
  return onSnapshot(collection(s.db, 'events', s.eventId, 'voters', uid, 'votes'), snapshot => {
    next(snapshot.docs.map(d => d.id));
  }, fail);
}
export async function saveHouse(s: Services, user: User | null, input: HouseInput, existingId?: string) {
  requireHost(user);
  const error = validateHouse(input);
  if (error) throw new Error(error);
  const payload = {
    ...input, address: input.address.trim(), hours: input.hours.trim(), note: input.note.trim(),
    updatedAt: serverTimestamp(),
  };
  const ref = existingId ? doc(houseCollection(s), existingId) : doc(houseCollection(s));
  if (existingId) await updateDoc(ref, payload);
  else await setDoc(ref, { ...payload, ownerUid: user.uid, upvotes: 0, createdAt: serverTimestamp() });
  return ref.id;
}
export async function changeStatus(s: Services, user: User | null, id: string, status: Status) {
  requireHost(user);
  await updateDoc(doc(houseCollection(s), id), { status, updatedAt: serverTimestamp() });
}
export async function removeHouse(s: Services, user: User | null, id: string) {
  requireHost(user);
  await deleteDoc(doc(houseCollection(s), id));
}
export async function toggleSave(s: Services, user: User | null, id: string) {
  if (!user) throw new Error('Still connecting. Please try again shortly.');
  const ref = doc(s.db, 'events', s.eventId, 'preferences', user.uid);
  await runTransaction(s.db, async tx => {
    const snapshot = await tx.get(ref);
    const saved: string[] = snapshot.data()?.savedIds ?? [];
    const next = saved.includes(id) ? saved.filter(v => v !== id) : [...saved, id];
    if (next.length > 500) throw new Error('Your walk can hold up to 500 stops.');
    tx.set(ref, { savedIds: next });
  });
}
export async function toggleVote(s: Services, user: User | null, id: string) {
  if (!user) throw new Error('Still connecting. Please try again shortly.');
  const ref = doc(houseCollection(s), id);
  const voteRef = doc(s.db, 'events', s.eventId, 'voters', user.uid, 'votes', id);
  await runTransaction(s.db, async tx => {
    const house = await tx.get(ref);
    const vote = await tx.get(voteRef);
    if (!house.exists()) throw new Error('This stop has been removed.');
    const count = house.data().upvotes;
    if (!Number.isInteger(count) || count < 0) throw new Error('This stop has an invalid confirmation count.');
    tx.update(ref, { upvotes: count + (vote.exists() ? -1 : 1) });
    if (vote.exists()) tx.delete(voteRef);
    else tx.set(voteRef, { createdAt: serverTimestamp() });
  });
}
