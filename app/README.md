# Farm Fleet Expenses

An expense tracker for a farm mechanic shop: upload invoices (parsed automatically, no
AI/API calls), or enter expenses by hand, assign them to a piece of equipment, and see
per-equipment history, yearly totals, and year-over-year reporting.

This is a from-scratch production implementation of the `Farm Fleet Expenses` design
prototype exported from Claude Design (see `../README.md`, `../chats/`, `../project/` at the
repo root for the original design source and the conversation history that shaped it).

## Two ways to run this

**1. Static, on GitHub Pages — the live version.** `app/public/` is a complete,
self-contained app: plain HTML/CSS/JS, no build step, no server. A GitHub Actions
workflow (`.github/workflows/pages.yml`) publishes that folder to GitHub Pages on every
push to `main`, at `https://<owner>.github.io/<repo>/`.

  The app opens straight to the dashboard, empty — nothing to connect or set up first.
  **Settings → Storage** (password-protected, like the rest of admin) is where you pick
  where the real data actually lives: **Google Drive**, **Local** (a folder on this
  computer), or nothing (just this session, unsaved). Whichever is picked is what changes
  auto-save to every 15 seconds, and what the app loads from automatically — the moment a
  storage location is set, the app checks it for existing data and loads that in, rather
  than starting over — see "Choosing where data lives" below. The only things this
  browser ever keeps locally are the connection config for whichever storage is picked (a
  Drive Client ID, or a reference to the chosen local folder) — never the actual
  categories, equipment, or invoices, so switching storage never loses anything already
  saved elsewhere. A single settings password (default `1234`, changeable in Settings,
  saved as part of the data itself) gates admin actions (add/delete equipment,
  categories, suppliers) the same way the original design prototype did.

**2. Optional real backend, self-hosted.** `server/` is a Node/Express + SQLite backend
with real per-mechanic accounts (bcrypt-hashed passwords, sessions) and a shared
database — every mechanic sees the same data from any device. This is what you'd want
for actual multi-user, multi-device use; it just can't run on GitHub Pages, since Pages
only serves static files. See "Running the optional backend" below.

## Running the static version locally

```bash
cd app/public
python3 -m http.server 8080   # or any static file server
```

Then open `http://localhost:8080`.

## Running the optional backend

```bash
cd server
npm install
npm start
```

Then open `http://localhost:3000`. On first run the server creates one admin account
(`admin` / `admin123` — change it in Settings → Users right after logging in). Admins
manage categories/equipment/suppliers/other accounts from Settings; every signed-in
mechanic can log expenses, edit equipment, add notes, and update hour meters.

## Notes on the static version vs. the design prototype

The prototype (`../project/Farm Fleet Expenses.dc.html`) was itself a single-device,
localStorage-only mockup with a shared settings password. The static build here differs
in two ways:

- **Data lives wherever Settings → Storage points it** — Google Drive, a local folder, or
  nowhere (unsaved) — see "Choosing where data lives" below.
- **Invoice reading is fully in-house** — no AI/LLM call. PDFs are read via pdf.js's text
  layer; photos/scans go through Tesseract OCR in the browser; both libraries load on
  demand from a CDN, so **the device viewing the page needs internet access** for that
  (and for the Google Fonts stylesheet — the UI falls back to the system font if that's
  blocked).
- **The dashboard's decorative shop-photo banner is a hardcoded inline SVG** (a wrench/gear
  motif) instead of an uploaded photo — no image hosting needed, and it always renders on
  Pages with no extra request.

## Choosing where data lives

Settings → Storage has three options — pick one:

- **Not connected** — the default. Nothing saves anywhere; closing the tab loses whatever
  was entered. Fine for a quick look, not for real use.
- **Google Drive** — one JSON file (`farm-fleet-expenses-backup.json`) in the signed-in
  Google account's Drive. Works from any device, any browser, as long as it signs in with
  the same Google account.
- **Local** — one JSON file written directly into a folder you pick on this computer, via
  the browser's own file system access. Only works in **Chrome or Edge on a computer**
  (there's no equivalent API in Firefox or Safari, or on mobile), and only in *this*
  browser on *this* device — nothing syncs anywhere else.

The moment Drive or Local is set up, the app checks that location for an existing backup
and loads it in automatically if one's there — so pointing a fresh device at a Drive
account or folder that already has data pulls that data in, rather than starting empty.
If it's genuinely the first time that Drive account or folder has been used, the app
saves whatever's currently loaded there instead, so the file exists from then on.

Whichever is picked, changes **auto-save every 15 seconds** whenever there's something
new to save — the cloud icon in the header does the same thing on demand — and Settings
→ Storage has a "Load latest" button to pull down whatever's newest there (useful after
using a different device, or if something else changed the file). There's also a
"Download a copy as JSON" button for a manual, point-in-time export — that's just an
extra safety copy, not how the app actually persists anything.

### Google Drive setup

Entirely client-side (`app/public/drive.js`, using Google Identity Services and the
Google Picker — no server, no client secret), and needs a one-time setup per Google
account/Cloud project:

1. In the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials),
   create an **OAuth Client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add the site's origin — e.g.
   `https://admin-vet.github.io` (no path, no trailing slash).
3. Enable the **Google Drive API** for that Cloud project (APIs & Services → Library).
4. In Settings → Storage, click **Google Drive**, then paste the resulting Client ID.
   It's saved only in that browser's `localStorage` — that's the one piece of bootstrap
   config the app keeps locally, since it's needed just to start the OAuth connection; no
   actual app data ever goes there.

Saving the Client ID immediately tries to connect: sign in with the Google account this
data should live in. The app then checks Drive for an existing
`farm-fleet-expenses-backup.json` — if this is the first time that account has used the
app, it saves whatever's currently loaded as that file right away; otherwise it loads
whatever's already there. From that point on, every device that signs in with the *same
Google account and Client ID* sees the exact same data — the app reconnects silently (no
popup) on later visits as long as the browser still has a valid Google session.

**Optional — to pick which Drive folder the file goes in:** two more things are needed —

1. An **API key**, created on the same credentials page. Enable **Picker API** in the
   Library (a real, separate API — it just isn't listed as "Google Picker API", search
   just "Picker"), then under "API restrictions" allow both **Picker API** and
   **Google Drive API**, and under "Website restrictions" add this site's origin.
2. Your Cloud project's **project number** (not the project ID, not the Client ID — it's
   on the Cloud Console dashboard for the project). This is required for the `drive.file`
   scope to actually grant the app access to a folder it didn't create itself; without it,
   the folder picker still opens and lets you click a folder, but every save afterward
   fails with a 404 "File not found" on that folder's ID, because Drive never registered
   the permission grant.

Paste both into Settings → Storage. That unlocks a "Choose folder…" button that opens
Google's own folder picker — the app never lists your Drive itself, it only receives the
one folder you pick. Without these, the file goes in the root of "My Drive".

The app requests the `drive.file` scope only, meaning it can see or edit just the one
file it creates for itself — never the rest of anyone's Drive. Because the OAuth consent
screen for a new Cloud project starts in "Testing" mode, Google will show an "unverified
app" warning the user has to click through until the project is published/verified;
that's expected for a small internal tool. **For a product sold to multiple customers,
each customer should create their own free Cloud project/Client ID** rather than sharing
one — API quotas are per-project, and Google's unverified-app test-user cap (~100 users)
applies per project too.

### Local folder setup

In Settings → Storage, click **Local**, then **Choose folder…** and
pick (or create) a folder — the browser will ask to confirm write access. That's it;
nothing to configure. The browser remembers the folder across reloads in Chrome/Edge, but
may ask you to reconnect (click "Choose folder…" again and pick the same folder) after
enough time has passed, since it re-checks permission for security. If the button that
picks a folder doesn't appear at all, the browser doesn't support this feature — Google
Drive is the alternative for anyone not on Chrome/Edge.
