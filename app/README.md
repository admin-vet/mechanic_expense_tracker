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

Settings → Storage has two options — pick one:

- **Google Drive** — one JSON file (`farm-fleet-expenses-backup.json`) in the signed-in
  Google account's Drive. Works from any device, any browser, as long as it signs in with
  the same Google account.
- **Local** — one JSON file written directly into a folder you pick on this computer, via
  the browser's own file system access. Only works in **Chrome or Edge on a computer**
  (there's no equivalent API in Firefox or Safari, or on mobile), and only in *this*
  browser on *this* device — nothing syncs anywhere else.

There's no "not connected" option — the app is meant to always have a real storage
location behind it, not run disconnected.

The moment Drive or Local is set up, the app checks that location for an existing backup
and loads it in automatically — so pointing a fresh device at a Drive account or folder
that already has data pulls that data in, rather than starting empty. If it's genuinely
the first time that Drive account or folder has been used, the app saves whatever's
currently loaded there instead, so the file exists from then on. The same automatic
check-and-load happens every time the app is opened, not just the first time, so it's
always showing what's actually in Drive/the folder rather than something stale.

Once a storage location is picked, **Settings → Storage locks it in** — the mode buttons
collapse into a "Connected to: <mode>" summary, so it can't be changed by an idle click.
A "Change location" button is still there if you deliberately want to switch, but clicking
it (or "Select folder" to switch the local folder while staying in Local mode) asks for the
settings password again first — a second layer on top of Settings already being
password-gated, since this specific action can change where the app's data loads from.
Entering it correctly then shows the normal switcher/folder-picker flow. Switching the
*local folder* specifically (not the mode) also explains what happens once past that gate:
if the new folder already has a backup, that loads in and replaces what's here; if not,
what's currently loaded gets saved there instead — either way, auto-save starts going to
the new folder from then on.

Two icons appear in the header once a location is set: a cloud/save icon that backs up
right now, and a download icon that pulls the latest down (after confirming, since it
replaces whatever's currently loaded). Those replace the old "Load latest" button that
used to live in Settings. There's also a "Download JSON" button in Settings for a manual,
point-in-time export — that's just an extra safety copy, not how the app actually
persists anything.

If either header icon fails for the Local backend (most commonly: the browser's folder
permission lapsed, which Chrome revokes on its own after enough time passes), that now
shows as the same red error banner used for Drive failures, right under the header on
whatever screen you're on — it used to only be written to a status line inside Settings →
Storage, so failing outside that tab looked exactly like the button silently doing
nothing.

Next to it, **"Restore from file"** does the reverse: pick any backup JSON file (one
downloaded from here earlier, or hand-built to match that same shape) and, after
confirming, it replaces everything currently loaded — same as the header's download-latest
icon, just from a file on this device instead of Drive/the local folder. If a storage
location is already connected, the restored data is immediately saved back to it too, so
it's not just sitting in memory until the next auto-save.

Longer explanations (Drive setup steps, API key/project-number details, what "locked"
means) live behind small "i" info buttons next to the relevant heading, instead of
sitting on the page permanently — click one to see it, click it again (or click
elsewhere) to close it.

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

Paste both into Settings → Storage. That unlocks a "Select folder" button that opens
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

In Settings → Storage, click **Local**, then **Select folder** and
pick (or create) a folder — the browser will ask to confirm write access. That's it;
nothing to configure. The browser remembers the folder across reloads in Chrome/Edge, but
may ask you to reconnect (click "Select folder" again and pick the same folder) after
enough time has passed, since it re-checks permission for security. If the button that
picks a folder doesn't appear at all, the browser doesn't support this feature — Google
Drive is the alternative for anyone not on Chrome/Edge.

## Maintenance dashboard

The top nav's **Maintenance** tab (next to Expense) rolls up every service interval on
every piece of equipment into one list, sorted most-urgent-first — the same
Overdue/Due now/Due soon/OK status math already used on each equipment's own detail page,
just aggregated across the whole fleet. Each row links back to that equipment and has a
"Mark done" shortcut that logs the service the same way the detail page's own button does.
Equipment with no service intervals set up yet just doesn't appear here; the detail page
is still where intervals get added.

## Equipment manuals

An equipment's edit screen has a **User manual** field for uploading a PDF or image (up to
15 MB) that stays attached to that specific piece of equipment — it's stored directly on
the equipment's own record (as a data URL), so it's included automatically in the exact
same backup/restore as everything else, with nothing extra to configure. It shows as a
download link on that equipment's detail page and can be replaced or removed (via the
trash icon) from the edit screen.

## Hour / KM usage log and yearly comparison

Each equipment has a **"Tracked by"** setting (Hour meter or Kilometers, on its edit
screen) — trucks and cars are usually tracked by odometer, most farm equipment by an hour
meter. Every label that depends on this (the reading field, the log table, Maintenance,
Reports) follows whichever unit that equipment uses.

Each equipment's detail page has a dated "Reading date" field next to the current
reading — set both and click **Log reading** to stamp that reading into the equipment's own
history (upserting by date if you log the same day twice). The resulting table shows every
logged reading with the change since the previous one, and any entry can be removed with
its trash icon. The **Maintenance** page also has a "Log a reading" section at the top that
does the same thing for any equipment by name, so a reading can be recorded without opening
that equipment's own page first.

Reports → **Usage** turns those stamps into a year-by-year comparison: for the
selected year, it shows how much each equipment was used, computed as the last reading at
or before that year's end minus the last reading at or before the prior year's end (in
whichever unit that equipment uses). An equipment shows "Not enough data" until it has a
reading old enough to bracket both sides of the year — nothing is ever estimated or
interpolated between readings, so the finest granularity you get out of a comparison is
exactly how often you actually log a reading (log monthly for monthly deltas, log once a
year for yearly ones — the per-equipment table itself shows the delta between any two dates
you did log).

## Per-equipment report

The graph icon next to an equipment's edit and calculator icons (on its detail page) opens
a report scoped to just that one machine, with two matching sets of tiles: **Lifetime**
(total spend, cost per hour/km, cost per liter of fuel, and total usage across every
logged reading) and **Per year** (the same four figures for whichever year is picked from
the dropdown, defaulting to the most recent year with expense data). The year figures use
the same math as Reports → Usage — the last reading at or before that year's end minus the
last one at or before its start — so a year with only one reading, or none, shows "Not
enough data" rather than a guess. Below both sets of tiles: spend by year and spend by
vendor tables for the equipment as a whole. Cost-per-liter (lifetime or per year) comes
from the optional "Fuel liters" field on an expense line (see below) — it's the total cost
of every expense with liters entered divided by the total liters, so it only reflects
purchases actually tagged as fuel rather than guessing from a part description.

## Part numbers and fuel liters on expenses

Every place an expense line gets entered — the Upload Invoice review table, Manual Expense
rows, and the quick "+ Add Expense" form on an equipment card — now has a **Part #** field
alongside the part description, and the Upload/Manual forms also have an optional **Fuel
liters** field for tracking fuel purchases specifically. Both show up everywhere expense
lines are listed: All Expenses, and an equipment's own Invoice history. Invoice OCR/PDF
extraction doesn't fill in either field (there's no reliable way to read a part number or
liters off a scanned receipt) — they're always typed in by hand.

An equipment's **Invoice history** is collapsed by default (a "Show (N)" button reveals
it) so a machine with a long expense history doesn't dominate its own detail page.

## UI conventions

Delete/remove actions that aren't the final step of a confirmation are a small trash-can
icon button rather than a text button, matching the existing edit-pencil icon — text is
kept only on the last button of a destructive confirm dialog (e.g. "Delete equipment") and
on text-based dropdown menu items, where an icon would look inconsistent next to the rest
of the menu. A small eye icon replaces the old "View" buttons for the same reason.

Deleting an equipment or a category always asks for confirmation in a popup dialog first —
never immediately, and never as an inline expanding panel. Deleting a category that still
has equipment in it moves that equipment to an "Other" category (created automatically if
one doesn't already exist) rather than leaving it pointed at a category that no longer
exists.

## Header name

Settings → General has a "Header name" field — rename the app's header (shown at the top
of every page) to this farm or shop's own name. Leaving it blank falls back to the default
"Veteran Equipment Expense".

## Support

Settings → General has a support contact: electrical@veterancolony.com. Support isn't
free — it's billed at $120/hour with a one-hour minimum.
