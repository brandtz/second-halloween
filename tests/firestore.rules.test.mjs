import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, increment,
  runTransaction, serverTimestamp, Timestamp,
} from 'firebase/firestore';

let env;
const event = '2026-11-01';
const housePath = `events/${event}/houses/house`;
const votePath = uid => `events/${event}/voters/${uid}/votes/house`;
const prefsPath = uid => `events/${event}/preferences/${uid}`;
const host = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const guest = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const sample = () => ({
  address: 'Test listing (not a real participating house)', neighborhood: 'Washburne',
  hours: '5 PM - 8 PM', status: 'plenty', tags: ['full_size'], pinIcon: '🎃', note: '',
  lat: 44.05, lng: -123.02, ownerUid: 'owner', upvotes: 0,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-second-halloween',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), housePath), sample()));
});
after(async () => { await env?.cleanup(); });

test('public directory can be read without authentication', async () => {
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), housePath)));
  await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), `events/${event}/houses`)));
});
test('only signed-in hosts may publish, and ownership cannot be forged', async () => {
  await assertSucceeds(setDoc(doc(host('owner'), `events/${event}/houses/new`), sample()));
  await assertFails(setDoc(doc(guest('owner'), `events/${event}/houses/guest`), sample()));
  await assertFails(setDoc(doc(host('other'), `events/${event}/houses/forged`), sample()));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `events/${event}/houses/no-auth`), sample()));
});
test('owner can edit and delete but another host or guest cannot', async () => {
  await assertSucceeds(updateDoc(doc(host('owner'), housePath), { status: 'low', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(host('other'), housePath), { status: 'out', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(guest('owner'), housePath), { status: 'out', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(host('other'), housePath)));
  await assertSucceeds(deleteDoc(doc(host('owner'), housePath)));
});
test('owner cannot transfer ownership, forge timestamps, counts, or expose edit secrets', async () => {
  const ref = doc(host('owner'), housePath);
  for (const patch of [
    { ownerUid: 'other' }, { createdAt: Timestamp.fromMillis(0) }, { upvotes: 100 },
    { updatedAt: Timestamp.fromMillis(0) }, { pinCode: '1101' }, { isSeed: true },
  ]) await assertFails(updateDoc(ref, { updatedAt: serverTimestamp(), ...patch }));
});
test('invalid content and coordinates are rejected on the server', async () => {
  const ref = doc(host('owner'), housePath);
  for (const patch of [
    { address: '' }, { address: 'x'.repeat(181) }, { note: 'x'.repeat(1001) },
    { status: 'unknown' }, { tags: ['bad'] }, { tags: ['full_size', 'full_size'] },
    { lat: 0 }, { lat: NaN }, { lng: Infinity }, { neighborhood: 'Seattle' },
    { pinIcon: '<img src=x onerror=alert(1)>' },
  ]) await assertFails(updateDoc(ref, { ...patch, updatedAt: serverTimestamp() }));
});
test('initial counts and server timestamps are mandatory', async () => {
  await assertFails(setDoc(doc(host('owner'), `events/${event}/houses/new`), { ...sample(), upvotes: 10 }));
  await assertFails(setDoc(doc(host('owner'), `events/${event}/houses/new`), { ...sample(), createdAt: Timestamp.fromMillis(0) }));
});
async function vote(db, uid) {
  await runTransaction(db, async tx => {
    await tx.get(doc(db, housePath));
    const ballot = await tx.get(doc(db, votePath(uid)));
    tx.update(doc(db, housePath), { upvotes: increment(ballot.exists() ? -1 : 1) });
    if (ballot.exists()) tx.delete(doc(db, votePath(uid)));
    else tx.set(doc(db, votePath(uid)), { createdAt: serverTimestamp() });
  });
}
test('votes and undo are atomic and one per UID', async () => {
  const db = guest('visitor');
  await assertSucceeds(vote(db, 'visitor'));
  assert.equal((await getDoc(doc(db, housePath))).data().upvotes, 1);
  const duplicate = writeBatch(db);
  duplicate.set(doc(db, votePath('visitor')), { createdAt: serverTimestamp() });
  duplicate.update(doc(db, housePath), { upvotes: 2 });
  await assertFails(duplicate.commit());
  await assertSucceeds(vote(db, 'visitor'));
  assert.equal((await getDoc(doc(db, housePath))).data().upvotes, 0);
});
test('simultaneous confirmations do not lose increments', async () => {
  const results = await Promise.allSettled(['one', 'two', 'three'].map(uid => vote(guest(uid), uid)));
  for (const result of results) assert.equal(result.status, 'fulfilled', result.status === 'rejected' ? String(result.reason) : '');
  assert.equal((await getDoc(doc(host('owner'), housePath))).data().upvotes, 3);
});
test('cannot forge counts, orphan ballots, or vote as another user', async () => {
  const db = guest('visitor');
  await assertFails(updateDoc(doc(db, housePath), { upvotes: 1 }));
  await assertFails(setDoc(doc(db, votePath('visitor')), { createdAt: serverTimestamp() }));
  const batch = writeBatch(db);
  batch.update(doc(db, housePath), { upvotes: 1 });
  batch.set(doc(db, votePath('victim')), { createdAt: serverTimestamp() });
  await assertFails(batch.commit());
});
test('voting cannot modify listing content in the same write', async () => {
  const db = guest('visitor'), batch = writeBatch(db);
  batch.set(doc(db, votePath('visitor')), { createdAt: serverTimestamp() });
  batch.update(doc(db, housePath), { upvotes: 1, note: 'tampered' });
  await assertFails(batch.commit());
});
test('ballots and saved walks are private and scoped by event', async () => {
  const db = guest('visitor');
  await vote(db, 'visitor');
  await assertSucceeds(getDocs(collection(db, `events/${event}/voters/visitor/votes`)));
  await assertFails(getDoc(doc(guest('other'), votePath('visitor'))));
  await assertSucceeds(setDoc(doc(db, prefsPath('visitor')), { savedIds: ['house'] }));
  await assertSucceeds(getDoc(doc(db, prefsPath('visitor'))));
  await assertFails(getDoc(doc(guest('other'), prefsPath('visitor'))));
  await assertFails(setDoc(doc(guest('other'), prefsPath('visitor')), { savedIds: [] }));
  await assertFails(setDoc(doc(db, prefsPath('visitor')), { savedIds: Array(501).fill('x') }));
  await assertFails(setDoc(doc(db, prefsPath('visitor')), { savedIds: [], ownedIds: ['house'] }));
  await assertFails(setDoc(doc(db, 'unrelated/secret'), { value: 'blocked' }));
});
