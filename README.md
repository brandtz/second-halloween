# Second Halloween: Springfield, OR

A React + TypeScript community candy-stop map, adapted from the supplied prototype.
Built with Vite, Firebase Authentication / Firestore, and bundled Leaflet. Netlify
serves the static frontend; Firebase provides the shared database and accounts.

## What works

- Live house listings, owner-only edits/removal, and quick candy-status updates.
- Email/password host accounts for managing a house from another phone; guest
  browsing, saved walks, and one confirmation per Firebase UID.
- Streets, aerial imagery, and an explicitly approximate local grid fallback.
- Address search, GPS, manual pin placement, walking directions, neighborhood /
  treat / status / text filters, and responsive map/list views.
- Event-specific listings and saved walks; the default event is **November 1, 2026**.

**No real houses are pre-populated.** The prototype's sample addresses were not
verified participants. A fresh database is intentionally empty.

## Local setup

Use **Node 24.12+ (24 LTS recommended)** and npm.

```sh
npm ci
cp .env.example .env.local
# Fill in the four Firebase web-app values described below.
npm run dev
```

Open the address printed by Vite. Missing configuration produces a clear setup
screen instead of a broken Firebase initialization or a fake live demo.
After changing any `VITE_*` setting, restart Vite or rebuild the deployed site.

## Create and configure Firebase

1. In the [Firebase console](https://console.firebase.google.com/), create a project
   and register a **Web app**. Put its `apiKey`, `authDomain`, `projectId`, and
   `appId` into the corresponding `VITE_FIREBASE_*` variables in `.env.local`.
   These are public client identifiers, **not secrets**. Never put a service
   account, private key, or admin credential in a `VITE_*` variable.
2. Enable **Authentication → Sign-in method → Anonymous** and **Email/Password**.
   Guests get a persistent anonymous session; hosts create or sign in to an
   account. Creating an account upgrades the guest identity and keeps its walk.
   Signing into an existing account loads that account's walk instead of merging
   the guest walk. Clearing browser data loses an unregistered guest identity.
3. Configure an Authentication password policy with a minimum of **12 characters**
   to match the registration UI. Enable email enumeration protection. Configure
   password-reset email branding/support contact as appropriate.
4. Create **Cloud Firestore in Native mode**, initially using production/locked
   rules. Choose a suitable US region. **Do not use open test-mode rules.**
5. Deploy the checked-in authorization rules to your actual project:

   ```sh
   npx firebase login
   npx firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
   ```

   Netlify does **not** deploy these rules. No custom indexes are required by the
   current queries. Do not copy emulator data or use the `demo-` project in production.
6. Under **Authentication → Settings → Authorized domains**, add `localhost` for
   development and your eventual `YOUR-SITE.netlify.app` and custom production
   domain. Prefer an isolated Firebase project for previews/testing; don't enable
   arbitrary deploy-preview domains on a production project.

Hosts' emails/passwords are handled by Firebase Auth, not stored in public listing
documents. Listings are publicly readable and contain address, coordinates, notes,
hours, status, tags, owner UID, confirmation count, and timestamps.

## Deploy on Netlify

1. Import `brandtz/second-halloween` into Netlify, using the `main` branch.
2. Netlify reads `netlify.toml`: **build `npm run build`, publish `dist`, Node 24**.
3. Add these environment variables to the production build context:

   | Variable | Source |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | Firebase Web app `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web app `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | Firebase Web app `projectId` |
   | `VITE_FIREBASE_APP_ID` | Firebase Web app `appId` |
   | `VITE_EVENT_DATE` | `2026-11-01`, or your event's `YYYY-MM-DD` |
   | `VITE_USE_EMULATORS` | `false` (or omit entirely) |

4. Complete the Firebase setup/rules/domain steps above, then deploy. The app
   refuses emulator mode on non-localhost domains. Frontend configuration is
   embedded at build time, so redeploy after changing variables.
5. On the HTTPS production URL, create a test host, add a clearly identified test
   listing, verify its real map pin, view it from another browser, save and confirm
   it, change status, sign out/in, test password reset, and remove the test listing.
   Also check GPS permissions, mobile layout, tile loading, and address search on
   your actual domain. The local emulator cannot verify production credentials,
   quotas, email delivery, or provider availability.

`netlify.toml` includes SPA routing, content-type/frame/permissions/CSP headers,
and immutable caching for fingerprinted assets. A future mapping/auth provider
may require updating the CSP allowlist.

**Launch is not complete until your Firebase configuration, rules, authorized
domain, and production smoke test are complete.** This repository does not create
a Firebase project or publish a Netlify site automatically.

## Tests

```sh
npm run check                 # TypeScript, unit tests, production build
npm audit --omit=dev          # Runtime dependency advisories
npx playwright install chromium
npm run test:integration      # Firebase rules + desktop/mobile browser tests
```

Integration tests require **Java 21+**, available emulator ports 8080/9099, and
network access for the initial official Firebase emulator download. They use
`demo-second-halloween`, an isolated disposable project with fake credentials.
**The suite clears that emulator project's accounts/documents.** Never point it
at a shared emulator containing data you want to keep.

The browser suite builds and serves the production bundle, tests real
authentication and Firestore against the emulators, and stubs external map tiles
and geocoder responses for repeatability. It covers host create/edit/delete,
cross-client realtime updates, permission boundaries, votes, saved walks across
reloads, sign-out/in, filters, map switching/fallback, manual SVG coordinate
placement, GPS denial, and safe rendering of search text.
Rules tests exercise unauthorized writes, invalid data, private preferences,
atomic ballots, and concurrent confirmations. GitHub Actions runs these checks
on pushes and pull requests; failure reports are retained for seven days.

The `@grpc/grpc-js` override stays on the compatible 1.x line to replace the old
transitive version pinned by Firebase's **Node** Firestore transport. The browser
app does not ship gRPC. Reassess the override when upgrading Firebase. The Firebase
CLI currently brings development-only moderate advisories; `npm audit` includes
those, while the production dependency audit excludes the CLI. Do not apply
`npm audit fix --force` blindly: it can downgrade Firebase across major versions.

## Important differences from the prototype

- Restored the missing auth, subscription, and preference-persistence code.
- Replaced readable/default/master edit PINs and client-trusted ownership with
  Firebase accounts and server-enforced owner-only writes. **PIN-based claiming
  was deliberately removed**; an existing account works on another phone.
- Confirmations use a transaction and a private ballot, not a stale client count.
  Repeated votes from the same UID cannot inflate the count.
- Bundled Leaflet instead of injecting CDN scripts, cleaned up map/subscription
  listeners, and rendered marker text without inserting user-supplied HTML.
- Removed guessed/random "exact" addresses and fabricated GPS success messages.
  Address-search matches always need human pin confirmation; failures are visible.
  Search does not overwrite your real GPS location.
- Kept a schematic grid with correct pointer-coordinate transforms on different
  screen sizes. It is not a surveyed street map or a fully offline application.
- Dates are explicit; the app does not claim it is "tonight" all year.

## Map providers, privacy, and operations

Streets use [OpenStreetMap's public tiles](https://operations.osmfoundation.org/policies/tiles/);
aerial mode uses [Esri World Imagery](https://www.esri.com/en-us/legal/terms/full-master-agreement).
Address search uses the public [Photon service](https://photon.komoot.io/).
Attribution stays visible. Check provider terms and usage limits before launch or
larger-scale promotion; these public services have no availability guarantee.
Search sends the entered address to Photon, map requests disclose the viewed area
to the tile provider, and Directions opens Google Maps. GPS is used locally in the
page and is not written to Firestore.

Only list your own home with permission. Allergy-friendly tags are host reports,
not an allergen-safety guarantee. The saved walk is a bookmark list, not route
optimization. The app does not verify ownership of physical addresses.

Set Firebase usage/budget alerts and monitor abuse. Anonymous UIDs prevent duplicate
votes **within one identity**, not a determined person creating new identities.
This starter does not include App Check enforcement, server-side rate limiting,
moderation, or verified-email gates; evaluate those before a large public launch.
Organizers can remove abusive listings through the Firebase console. Do not grant
ordinary users admin credentials. Hosts can remove their own listings in the UI.

Data lives under `events/{date}/houses`, `events/{date}/preferences/{uid}`, and
`events/{date}/voters/{uid}/votes/{houseId}`. Changing the event date starts a new
directory; it does not delete old event data. Set a retention policy and use trusted
admin tooling to delete old event collections recursively when no longer needed.
Deleting a house hides it immediately; private ballot documents and saved IDs may
remain until event cleanup (deleted IDs are not shown in walks).

## Source layout

`src/App.tsx` composes the UI; `Map.tsx` owns Leaflet and the fallback grid;
`HouseForm.tsx` and `AuthDialog.tsx` manage dialogs; `data.ts` contains Firestore
operations; `firebase.ts` validates configuration and authentication;
`model.ts` validates/filter listings; `geocode.ts` handles address lookup.
`firestore.rules` is the authoritative access-control boundary.
