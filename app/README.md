# Farm Fleet Expenses

An expense tracker for a farm mechanic shop: upload invoices (parsed automatically, no
AI/API calls), or enter expenses by hand, assign them to a piece of equipment, and see
per-equipment history, yearly totals, and year-over-year reporting.

This is a from-scratch production implementation of the `Farm Fleet Expenses` design
prototype exported from Claude Design (see `../README.md`, `../chats/`, `../project/` at the
repo root for the original design source and the conversation history that shaped it).

## Two ways to run this

**1. Static, on GitHub Pages — the live version.** `app/public/` is a complete,
self-contained app: plain HTML/CSS/JS, no build step, no server. It stores everything
(equipment, categories, suppliers, expenses) in the browser's `localStorage`. A GitHub
Actions workflow (`.github/workflows/pages.yml`) publishes that folder to GitHub Pages
on every push to `main`, at `https://<owner>.github.io/<repo>/`.

  Because it's static, **there's no real login and no shared data across devices** —
  each browser has its own copy. A single settings password (default `1234`, changeable
  in Settings) gates admin actions (add/delete equipment, categories, suppliers) the same
  way the original design prototype did. Back up regularly (Settings → Backup, or the
  disk icon in the header) since a cleared browser or a new device starts empty.

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
localStorage-only mockup with a shared settings password — the static build here matches
that model closely, with one addition:

- **Invoice reading is fully in-house** — no AI/LLM call. PDFs are read via pdf.js's text
  layer; photos/scans go through Tesseract OCR in the browser; both libraries load on
  demand from a CDN, so **the device viewing the page needs internet access** for that
  (and for the Google Fonts stylesheet — the UI falls back to the system font if that's
  blocked).
- **The dashboard's decorative shop-photo banner is a hardcoded inline SVG** (a wrench/gear
  motif) instead of an uploaded photo — no image hosting needed, and it always renders on
  Pages with no extra request.

## Backing up (static version)

Settings → Backup (or the disk icon in the header) downloads a JSON snapshot of
everything in this browser's data — categories, equipment, suppliers, and every expense.
Restore-from-file isn't wired up yet; treat the export as an emergency copy.

### Google Drive backup

Settings → Backup also has a Google Drive option, so a backup survives clearing the
browser or moving to a new device. It's entirely client-side (`app/public/drive.js`,
using Google Identity Services — no server, no client secret) and needs a one-time setup
per deployment:

1. In the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials),
   create an **OAuth Client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add the site's origin — e.g.
   `https://admin-vet.github.io` (no path, no trailing slash).
3. Enable the **Google Drive API** for that Cloud project (APIs & Services → Library).
4. Paste the resulting Client ID into Settings → Backup → Google Drive backup. It's saved
   only in that browser's `localStorage` — no code changes needed, and different
   forks/deployments can each use their own Client ID.

**Optional — to pick which Drive folder backups go to:** also create an **API key** on
the same credentials page (restrict it to the "Google Picker API" and to this site's
referrer), enable the **Google Picker API** in the Library, and paste the key into the
same setup form. That unlocks a "Choose folder…" button in Settings that opens Google's
own folder picker — the app never lists your Drive itself, it only receives the one
folder you pick. Without an API key, backups go to the root of "My Drive".

The app requests the `drive.file` scope only, meaning it can see or edit just the one
backup file it creates for itself (`farm-fleet-expenses-backup.json`) — never the rest of
anyone's Drive. Because the OAuth consent screen for a new Cloud project starts in
"Testing" mode, Google will show an "unverified app" warning the user has to click through
until the project is published/verified; that's expected for a small internal tool.
