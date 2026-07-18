# Migration Guide — history of fixes for esl.learning

## ⚠️ Repo mix-up — please read this first

While investigating a duplicate-word report, both `esl.app` and
`esl.learning` repos were checked — **these are two different
repositories.** The one actually live at your GitHub Pages URL
(`laoapp-dev.github.io/esl.learning/`) is **`esl.learning`**. `esl.app` is
an older/stale copy on the old absolute base path with old "LexoMaster"
branding. If you're editing or checking things in `esl.app`, that's why
changes never show up on the live site — it isn't the one being deployed.
Do everything (pushes, secrets, Pages settings) in `esl.learning`.

## Duplicate words — found real corruption in old live data

An earlier audit of synced data in `esl.learning`'s `data/users/*/vocab.json`
files found real corruption: one user's word list had **1077 total entries,
only ~300 of them unique** — one word ("diligent") appeared 11 times with
identical content. That was leftover from before the sync-dedup fix
existed: the fix stops *new* duplicates but doesn't retroactively clean up
data that was already duplicated.

**Admin-side duplicate check + cleanup tool**, in Admin Panel → Google
Sheet tab:
- **Check for Duplicates** — re-pulls your sheet (without merging anything)
  and reports any word appearing on more than one row there, *and*
  separately scans the app's current word list for existing duplicate
  entries.
- **Clean Up Duplicates Now** — collapses existing duplicate entries down
  to one per word. Keeps the most complete content across the copies and
  merges study progress (highest study/correct count, starred/learned if
  any copy was) instead of arbitrarily discarding progress.

---

## 0. App renamed + blank-page fix

**Renamed:** "LexoMaster" → "ESL Learning" everywhere — browser tab title,
PWA name/icon label, login screen, sidebar, meta tags, `package.json`.

**Blank page on GitHub Pages — root cause:** `vite.config.ts` used to build
asset URLs with an *absolute* path like `/esl.learning/`, which only works
if it exactly matches the live URL's subpath. If that build-time value was
ever missing or mismatched, every JS/CSS file 404s silently — `index.html`
loads but the app never starts, with no visible error since there's no JS
running yet to show one.

**Fix:** switched to a *relative* base path (`base: './'` in
`vite.config.ts`). Every asset is now requested relative to wherever
`index.html` itself was loaded from, so it works no matter the subpath,
repo name, or custom domain.

If you still see a blank page after redeploying:
1. Hard refresh (Ctrl/Cmd+Shift+R) — old cached assets from before the fix
   can stick around, especially with the PWA service worker. The app now
   also auto-detects a stale/broken cache and clears it automatically on
   the very next load (see `index.html`).
2. GitHub repo → Settings → Pages → confirm **Source** is "GitHub Actions"
   (not "Deploy from a branch").
3. Open DevTools (F12) → Console tab → check for red errors.

---

## 1. Sync duplication bug (fixed)

The Google Sheet sync used a helper called `mergeSharedWords`, which checks
"does this word already exist?" before adding it. But the admin Sync
buttons were wired to a *different* function that just appended every row
every time — no duplicate check. `AdminPanel` also had a second, separate
auto-sync listener duplicating the effect further.

**Fixed:**
- All sync paths (Google Sheet sync, GitHub pull, CSV/JSON import) now go
  through `mergeSharedWords`, which adds new words and updates existing
  ones (by matching word text) instead of blindly appending.
- Removed the duplicate auto-sync listener in `AdminPanel.tsx`.
- Re-uploading the same file, clicking "Sync Now" repeatedly, or letting
  auto-sync run on a timer is safe — it will never create duplicates.

---

## 2. The bigger issue: sync only reached the admin's own browser (fixed)

Even with duplication fixed, sync only updated whichever browser clicked
"Sync Now" — every device has its own separate `localStorage`, so a
regular user on their own phone never saw the admin's synced words.

**Fixed via GitHub Sync:** Admin Panel → GitHub Sync tab, set a repo +
token once. After an import or Google Sheet sync, click **"Push to All
Learners"** and every learner's app pulls the update on their next login
(or within ~15 minutes if auto-sync is on) — no action needed on their end.
Regular users have no UI to write shared vocabulary anywhere in the app;
only Admin Panel actions can modify it.

### One-time setup for Google Sheet auto-sync
1. Publish your Google Sheet: File → Share → **Publish to web** → CSV.
   Copy the link.
2. Admin Panel → Google Sheet tab → paste the link → Save → Sync Now.
   (Optional: set an auto-sync interval, default 15 minutes.)
3. From then on: edit the sheet → within ~15 minutes (or on next visit),
   every user's app has the new words.

---

## 3. Vocabulary sync — GitHub Sync & Google Sheet (no external backend)

There is **no Firebase, Firestore, or any other paid backend** anywhere in
this app. The two supported ways to distribute a shared curriculum to
every learner:

- **Admin Panel → Import/Export**: upload a `.csv` or `.json` file
  (supports 20,000+ words), then click "Push to All Learners" to sync it
  to every device via GitHub Sync.
- **Admin Panel → Google Sheet tab**: paste a published Google Sheet CSV
  link and sync directly, with optional auto-sync on an interval.

Both write into the same local, per-browser storage every other part of
the app already uses, then optionally push to a GitHub repo file for
cross-device distribution — no separate database or paid service required,
and both GitHub Pages hosting and GitHub Actions (for the deploy workflow)
are free for public repos.

---

## 4. Quick summary of what actually exists in this codebase today

- `src/hooks/useVocabulary.ts` — all vocabulary state (personal + shared
  curriculum), backed by `localStorage`. `mergeSharedWords` upserts (adds
  new, updates existing) rather than blindly appending.
- `src/pages/AdminPanel.tsx` — user management, GitHub Sync config, Google
  Sheet sync config, CSV/JSON import+export, duplicate cleanup, and a full
  factory-reset (Danger Zone) that clears all local storage.
- `src/components/ImportExportModal.tsx` — personal CSV/JSON/XLSX import,
  available to any signed-in learner from My Words.
- `src/hooks/useGithubUserSync.ts` / `useGoogleSheet.ts` — the two sync
  mechanisms described above. No other backend integration exists.
- `src/data/defaultVocabulary.json` — the app's bundled starter word list
  (see below for how it's organized).
- `.github/workflows/deploy.yml` — builds and deploys to GitHub Pages;
  passes only `VITE_SHEET_CSV_URL` / `VITE_SHEET_AUTO_SYNC_MIN` as secrets.
