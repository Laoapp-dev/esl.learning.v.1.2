# Migration Guide — Excel → Firestore → App (no more duplicates)

## ⚠️ Repo mix-up — please read this first

While investigating a duplicate-word report, I checked both
`github.com/Laoapp-dev/esl.app` and `github.com/Laoapp-dev/esl.learning` —
**these are two different repositories.** The one actually live at your
GitHub Pages URL (`laoapp-dev.github.io/esl.learning/`) is **`esl.learning`**.
`esl.app` is an older/stale copy: it's still on the old absolute base path,
old "LexoMaster" branding, and has no Firebase/Google sign-in code at all.
If you're editing or checking things in `esl.app`, that's why changes never
seem to show up on the live site — it isn't the one being deployed. Going
forward, do everything (pushes, secrets, Pages settings) in `esl.learning`.
This zip's code is built on top of `esl.learning`.

## Duplicate words — found real corruption in your live data

I checked your actual synced data in `esl.learning`'s `data/users/*/vocab.json`
files. One user's word list had **1077 total entries, only ~300 of them
unique** — one word ("diligent") appeared 11 times with identical content.
This is leftover corruption from before the sync-dedup fix existed: that fix
stops *new* duplicates but doesn't clean up data that was already duplicated
in local storage or a GitHub backup before the fix was deployed.

**New: an admin-side duplicate check + cleanup tool**, in Admin Panel →
Google Sheet tab:
- **Check for Duplicates** — re-pulls your sheet (without merging anything)
  and reports any word appearing on more than one row there, *and* separately
  scans the app's current word list for existing duplicate entries. These
  are checked independently since they're different problems: one is about
  your source data, the other is about data already loaded into the app.
- **Clean Up Duplicates Now** — collapses existing duplicate entries in the
  app down to one per word. Keeps the most complete content across the
  copies (first non-empty field wins) and merges study progress (highest
  study/correct count, starred/learned if any copy was) instead of
  arbitrarily picking one copy and discarding progress on the others.

Run "Clean Up Duplicates Now" once after deploying this update to fix the
existing corruption — new syncs won't need it since they no longer create
duplicates in the first place.

---

This document explains (1) the bug that was fixed, (2) how to set up Firestore
as your new vocabulary source of truth, and (3) how to keep everything on
free tiers.

---

## 0. App renamed + blank-page fix (read this first)

**Renamed:** "LexoMaster" → "ESL Learning" everywhere — browser tab title, PWA
name/icon label, login screen, sidebar, meta tags, `package.json`.

**Blank page on GitHub Pages — root cause:** `vite.config.ts` built asset
URLs using an *absolute* path like `/esl.learning/`, which only works if it
exactly matches your live URL's subpath. If that build-time value was ever
missing or mismatched (e.g. built without the right env var, or the repo
name changed), every JS/CSS file 404s silently, `index.html` loads but the
app itself never starts — which is exactly a blank white page with no error
shown, because there's no JS running yet to show one.

**Fix:** switched to a *relative* base path (`base: './'` in
`vite.config.ts`). Every asset is now requested relative to wherever
`index.html` itself was loaded from, so it works correctly no matter what
subpath, repo name, or custom domain the site ends up on — this class of bug
can't happen again. Verified by building the app and serving it locally
under a simulated `/esl.learning/` subpath: all assets return 200.

After redeploying, if you still see a blank page:
1. Hard refresh (Ctrl/Cmd+Shift+R) — old cached assets from before this fix
   can otherwise stick around, especially with the PWA service worker.
2. GitHub repo → Settings → Pages → confirm **Source** is set to
   "GitHub Actions" (not "Deploy from a branch") — if it's on a branch, the
   workflow's build output isn't what's actually being served.
3. Open DevTools (F12) → Console tab → check for any red errors and share
   them if the page is still blank; that pinpoints anything beyond the
   asset-path issue.

---



Your Google Sheet sync used a helper called `mergeSharedWords`, which checks
"does this word already exist?" before adding it. But the **admin Sync
buttons** (both the manual "Sync Now" and the timed auto-sync) were wired to
a *different* function, `importWords`, which just appends every row from the
sheet to your list every single time — no duplicate check at all. On top of
that, `AdminPanel` had registered a second, separate auto-sync listener that
duplicated the effect further.

**Fixed in this update:**
- All sync paths (Google Sheet sync, GitHub pull, CSV import) now go through
  `mergeSharedWords`, which **adds new words and updates existing ones** (by
  matching word text) instead of blindly appending.
- Removed the duplicate auto-sync listener in `AdminPanel.tsx`.
- Re-uploading the same file, clicking "Sync Now" repeatedly, or letting
  auto-sync run on a timer is now safe — it will never create duplicate
  entries again.

This alone solves your current problem even if you never touch Firestore.
Deploy this update first and confirm the duplication stops.

---

## 1b. The bigger issue: sync only reached the admin's own browser

Even with duplication fixed, there was a second problem: **the sync only
updated whichever browser clicked "Sync Now."** Every device (desktop,
phone, different browser) has its own separate `localStorage` — nothing you
do in your browser is visible in anyone else's. So a regular user, on their
own phone, would never see the admin's synced words automatically, no matter
how many times the admin synced on their own machine. You'd have needed
every single user to open Admin Settings and sync it themselves, which
obviously isn't the "admin manages it, users just receive it" model you want.

**Fixed by baking the vocabulary source into the app build itself**, so it's
identical on every visitor's device from the moment they load the page —
admin or regular user, no setup or button click required on their end:

- `src/App.tsx` now auto-fetches your Google Sheet CSV (`VITE_SHEET_CSV_URL`,
  set once as a GitHub secret — see Step 0 below) for **every** authenticated
  user, immediately on load and again every `VITE_SHEET_AUTO_SYNC_MIN`
  minutes while the tab is open. Not gated by role, not dependent on any
  per-browser setting.
- `src/hooks/useFirestoreLiveVocabulary.ts` (new) does the same thing but in
  real time via Firestore's live listener (`onSnapshot`) — if you set up
  Firestore (Section 2), updates reach every open app within seconds of the
  admin's import script running, with no polling delay at all.
- Regular users have **no UI to write vocabulary** anywhere in the app —
  there's no "upload" affordance exposed to them. The only paths that can
  modify the shared word list are Admin Panel actions and, for Firestore, the
  Node import script run by whoever has the service-account key. That's the
  access-control boundary, not anything client-side.

### Step 0 — one-time setup for the sheet auto-sync
1. Publish your Google Sheet: File → Share → **Publish to web** → CSV. Copy
   the link (or just the normal share link — the app converts it either way).
2. In your GitHub repo: Settings → Secrets and variables → Actions → New
   repository secret → name it `VITE_SHEET_CSV_URL`, paste the link.
   (Optional: also add `VITE_SHEET_AUTO_SYNC_MIN`, default is 15 minutes.)
3. Push to `main` (or re-run the "Deploy to GitHub Pages" workflow). The
   updated `deploy.yml` already passes these secrets into the build.
4. Done. From now on: edit the sheet → within ~15 minutes (or on next visit),
   every user's app has the new words. Nothing else to do, ever, per user.

If you want changes to appear instantly instead of within 15 minutes, use
the Firestore path in Section 2 instead (or alongside) — it pushes updates
live instead of polling.

---



## 2. Moving to Firestore (recommended next step)

Your plan — Excel → Firestore → app pulls only what changed — is exactly what
this scaffold implements. Here's the architecture:

```
Your Excel file  →  npm run import:words  →  Firestore "vocabulary" collection
                                                        │
                                                        │  (each doc ID = the word itself,
                                                        │   so it can never be duplicated
                                                        │   server-side)
                                                        ▼
                                      App queries: "give me docs changed
                                      since my last sync" → merges in
                                      (add new / update changed, no duplicates)
```

### Step 1 — Create a free Firebase project
1. Go to https://console.firebase.google.com → **Add project** (no credit
   card required for the free "Spark" plan).
2. Once created, go to **Build → Firestore Database → Create database**.
   Choose a region close to your users, start in **production mode**.
3. Go to **Project settings → General → Your apps → Add app → Web (`</>`)**.
   Register it (no need for Firebase Hosting — you're keeping GitHub Pages).
   Copy the `firebaseConfig` values shown.

### Step 2 — Configure the app
1. Copy `.env.example` to `.env` in the project root.
2. Paste in the six `VITE_FIREBASE_*` values from Step 1.
3. `.env` is already ignored by `.gitignore` conventions for Vite projects —
   double check it's not committed. **Never commit a service account key.**

### Step 3 — Deploy Firestore security rules
`firestore.rules` (included) allows anyone to **read** vocabulary (so the app
works for all learners) but blocks all **writes** from the browser — only
your admin script (using a privileged service-account key, which bypasses
rules) can write. Deploy it with the Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore    # point it at your existing firestore.rules file
firebase deploy --only firestore:rules
```
(Or paste the contents of `firestore.rules` directly into Firebase Console →
Firestore Database → Rules → publish.)

### Step 4 — Get a service account key (for the import script only)
1. Firebase Console → Project settings → **Service accounts** →
   **Generate new private key**. This downloads a JSON file.
2. Save it *outside* your repo, e.g. `~/keys/esl-app-service-account.json`.
   Never commit this file — it grants full admin access to your database.
3. Set an environment variable pointing to it before running the import
   script:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=~/keys/esl-app-service-account.json
   ```

### Step 5 — Import your vocabulary
```bash
npm install
npm run import:words -- ./path/to/your-vocabulary.xlsx
```
This reads the sheet, and for each row:
- Computes a document ID from the word itself (e.g. "Serendipity" →
  `serendipity`) — this is *why duplicates are structurally impossible* now.
- Compares a content hash against what's already stored; if nothing changed,
  it skips the write entirely (saves your free-tier write quota).
- Otherwise it upserts the word and stamps `updatedAt` with the current
  server time.

Run this **every time you edit your Excel file**. It's idempotent — safe to
re-run as many times as you want.

### Step 6 — Sync in the app
In the Admin Panel, a new **Firestore** tab now has a **Sync Now** button.
It asks Firestore only for documents where `updatedAt` is newer than the
last successful sync (stored locally), so after the first sync, subsequent
syncs are small and fast — exactly the "sync only the words I just updated"
behavior you wanted.

There's also a **Force Full Resync** button for the first sync, or if you
ever need to rebuild the local cache from scratch — it's still duplicate-safe
because of the upsert logic.

### Step 7 (optional) — Automate the import with GitHub Actions
If you'd rather not run the script manually, commit your Excel file to the
repo (e.g. `data/vocabulary.xlsx`) and add a workflow that runs the import
whenever that file changes:

```yaml
# .github/workflows/import-vocab.yml
name: Import vocabulary to Firestore
on:
  push:
    paths: ['data/vocabulary.xlsx']
jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm run import:words -- ./data/vocabulary.xlsx
        env:
          FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
```
Store the *entire contents* of your service account JSON file as a repo
secret named `FIREBASE_SERVICE_ACCOUNT_JSON` (Settings → Secrets and
variables → Actions → New repository secret). The script already checks for
this env var as an alternative to `GOOGLE_APPLICATION_CREDENTIALS`.

With this in place: edit Excel → commit & push → GitHub Action imports
changed rows to Firestore automatically → users see updates next time they
sync, with zero duplicates, zero manual steps.

---

## 3. Staying on free tiers

| Piece | Free tier | Notes |
|---|---|---|
| **GitHub Pages** (hosting) | Free, unlimited for public repos | You're already using this — no change needed. |
| **Firestore** (Spark plan) | 1 GiB storage, 50K reads/day, 20K writes/day, 20K deletes/day | A vocabulary list of a few thousand words is a few MB. Incremental sync means most days you'll use only a handful of reads/writes, not tens of thousands. |
| **Firebase Auth** | Not required — your app has its own auth system already; Firestore rules here don't need Firebase Auth since reads are public and writes go through the admin SDK only. | |
| **GitHub Actions** (optional automation) | 2,000 free minutes/month for private repos, unlimited for public repos | The import job takes seconds, not minutes. |

**If you ever outgrow Firestore's free tier** (very unlikely for a
vocabulary app — you'd need tens of thousands of active daily syncers), the
next-cheapest step up is Firebase's pay-as-you-go Blaze plan, which still has
the same free quota before any charges kick in — you're never billed for
usage under the Spark limits.

**Alternative if you'd rather avoid Firebase entirely:** Supabase's free tier
(Postgres-based) offers a similar "generous free database + REST API" model
and could replace Firestore with a comparable amount of rework — worth
knowing about, but Firestore is the more natural fit here since Firestore's
document-per-word model maps cleanly onto "one row per word" from Excel.

---

## 4. Quick summary of file changes in this update

- `src/hooks/useVocabulary.ts` — `mergeSharedWords` now upserts (adds new,
  updates existing) instead of only skipping duplicates.
- `src/pages/AdminPanel.tsx` — all sync/import actions use `mergeSharedWords`
  instead of `importWords`; removed the duplicate auto-sync listener; added a
  Firestore tab.
- `src/components/ImportExportModal.tsx` — personal CSV import is now
  dedup-safe too.
- `src/lib/firebase.ts` — Firebase client init (new).
- `src/hooks/useFirestoreVocabulary.ts` — incremental Firestore sync hook
  (new).
- `scripts/import-excel-to-firestore.mjs` — admin script to push Excel/CSV
  rows into Firestore, upsert-only (new).
- `firestore.rules` — public read, admin-only write (new).
- `.env.example` — Firebase config template (new).
- `src/App.tsx` — auto-syncs shared vocabulary for every authenticated user
  automatically (Google Sheet on an interval + Firestore live listener),
  independent of any per-browser admin setting.
- `src/hooks/useFirestoreLiveVocabulary.ts` — real-time Firestore listener
  (new); pushes updates to all open apps instantly, no polling.
- `.github/workflows/deploy.yml` — passes `VITE_SHEET_CSV_URL` and Firebase
  config through as GitHub Actions secrets so they're baked into the build
  every user's browser downloads.
