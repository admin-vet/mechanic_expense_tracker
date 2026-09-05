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

  **All real data — equipment, categories, suppliers, invoices, and the settings
  password — lives in a single JSON file in the user's own Google Drive, never in the
  browser.** The first thing the app shows is a "Connect Google Drive" gate; nothing
  else is usable until that connects, at which point it automatically loads the latest
  copy of that file (or creates a fresh one, seeded with sample equipment, the very
  first time). That's what makes the same data show up on every device — sign in with
  the same Google account anywhere and the app loads exactly what's there. The only
  thing this browser keeps locally is the Drive connection config itself (OAuth Client
  ID, optional API key/project number/folder) — that's unavoidable bootstrap config, not
  app data, and different browsers/devices can each point at their own Cloud project if
  needed. A single settings password (default `1234`, changeable in Settings, stored as
  part of the Drive file like everything else) gates admin actions (add/delete
  equipment, categories, suppliers) the same way the original design prototype did.

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

- **Data lives in Google Drive, not the browser** — see "Connecting Google Drive" below.
- **Invoice reading is fully in-house** — no AI/LLM call. PDFs are read via pdf.js's text
  layer; photos/scans go through Tesseract OCR in the browser; both libraries load on
  demand from a CDN, so **the device viewing the page needs internet access** for that
  (and for the Google Fonts stylesheet — the UI falls back to the system font if that's
  blocked).
- **The dashboard's decorative shop-photo banner is a hardcoded inline SVG** (a wrench/gear
  motif) instead of an uploaded photo — no image hosting needed, and it always renders on
  Pages with no extra request.

## Connecting Google Drive

The very first screen the app shows is a "Connect Google Drive" gate — there's nothing
to skip past, because Google Drive is where the data actually lives (one JSON file per
Cloud project's Client ID: `farm-fleet-expenses-backup.json`). It's entirely client-side
(`app/public/drive.js`, using Google Identity Services and the Google Picker — no server,
no client secret) and needs a one-time setup per deployment:

1. In the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials),
   create an **OAuth Client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add the site's origin — e.g.
   `https://admin-vet.github.io` (no path, no trailing slash).
3. Enable the **Google Drive API** for that Cloud project (APIs & Services → Library).
4. Paste the resulting Client ID into the gate. It's saved only in that browser's
   `localStorage` — that's the one piece of bootstrap config the app keeps locally, since
   it's needed just to start the OAuth connection; no actual app data ever goes there.

Saving the Client ID immediately tries to connect: sign in with the Google account you
want this data attached to. The app then checks Drive for an existing
`farm-fleet-expenses-backup.json` — if this is the first time that account has used the
app, it seeds the default sample categories/equipment and creates that file right away;
otherwise it loads whatever's already there. From that point on, every device that signs
in with the *same Google account and Client ID* sees the exact same data — the app
reconnects silently (no popup) on later visits as long as the browser still has a valid
Google session, and falls back to showing the "Connect Google Drive" button again if not.

Once connected, changes **auto-save to Drive every 15 seconds** whenever there's
something new to save — the cloud icon in the header does the same thing on demand, and
Settings → Backup → "Load latest from Google Drive" pulls down whatever's newest there
(useful if another device saved something more recent). Settings → Backup also has a
"Download a copy as JSON" button for a manual, point-in-time export — that's just an
extra safety copy, not how the app actually persists anything.

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

Paste both into the connect gate (or later, in Settings → Backup). That unlocks a
"Choose folder…" button that opens Google's own folder picker — the app never lists your
Drive itself, it only receives the one folder you pick. Without these, the file goes in
the root of "My Drive".

The app requests the `drive.file` scope only, meaning it can see or edit just the one
file it creates for itself — never the rest of anyone's Drive. Because the OAuth consent
screen for a new Cloud project starts in "Testing" mode, Google will show an "unverified
app" warning the user has to click through until the project is published/verified;
that's expected for a small internal tool.
