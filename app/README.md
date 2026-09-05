# Farm Fleet Expenses

A shared expense tracker for a farm mechanic shop: upload invoices (parsed automatically,
no AI/API calls), or enter expenses by hand, assign them to a piece of equipment, and see
per-equipment history, yearly totals, and year-over-year reporting. Multiple mechanics can
sign in and see the same shared data.

This is a from-scratch production implementation of the `Farm Fleet Expenses` design
prototype exported from Claude Design (see `../README.md`, `../chats/`, `../project/` at the
repo root for the original design source and the conversation history that shaped it).

## Stack

- **Frontend**: plain HTML/CSS/JS, no build step (`public/`).
- **Backend**: Node.js + Express, session-based auth with bcrypt password hashing
  (`server/`).
- **Database**: SQLite via Node's built-in `node:sqlite` module — a single file
  (`server/data.sqlite`), no separate database server or account to set up.

## Running it

```bash
cd server
npm install
npm start
```

Then open `http://localhost:3000`. On first run the server creates one admin account:

- **username:** `admin`
- **password:** `admin123`

Change that password from Settings → Users right after logging in.

## Accounts and permissions

- **Admin** accounts can access Settings: manage categories, add/delete equipment, manage
  suppliers, create other user accounts, and start a new year (clears all recorded
  expenses but keeps equipment, categories, notes, and filters).
- **Every signed-in user** (admin or not) can log expenses, edit equipment details
  (rename, VIN, notes, filters, service intervals), add notes/reminders, and update hour
  meters — matching the original design's "average users can't add or delete equipment,
  but can do everything else."

Admin creates every account from Settings → Users — there's no public sign-up page.

## Notes on this implementation vs. the design prototype

The prototype (in `../project/Farm Fleet Expenses.dc.html`) was a single-device,
localStorage-only mockup with a shared password gate. Per the product decisions made when
this was built out for real:

- **Real accounts replace the shared password.** Each mechanic logs in with their own
  username/password instead of a single settings password; expenses record who entered
  them.
- **A real shared backend replaces localStorage**, so every mechanic sees the same data.
  The app fetches fresh data after every change (not a live socket), matching the
  "on refresh/app open is fine" sync requirement from the design conversation.
- **Invoice reading is fully in-house** — no AI/LLM call. PDFs are read via pdf.js's text
  layer; photos/scans go through Tesseract OCR in the browser; both libraries load
  on demand from a CDN, so **the server this runs on needs outbound internet access**
  for that (and for the Google Fonts stylesheet — the UI falls back to the system font
  if that's blocked).
- **The dashboard's decorative shop-photo banner was omitted** — it was a purely visual
  placeholder in the prototype with no functional behavior, and there was no request to
  wire up photo storage/uploads for it.
- **Sessions are in-memory** (Express's default store) — restarting the server signs
  everyone out. Fine for a small crew; swap in a persistent session store if that
  becomes annoying.

## Backing up

Settings → Backup (or the disk icon in the header) downloads a JSON snapshot of
everything in the database — categories, equipment, suppliers, and every expense.
