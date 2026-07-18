# ESL Learning — Update Notes (this package)

## 1. "Still loading…" stuck-boot screen — auto-recovery added

That screen was already a deliberate safety net (see `index.html`) that
appears when the app fails to start within 6 seconds — most commonly caused
by a stale service worker / browser cache still pointing at JS files from a
previous deploy (every deploy replaces all filenames with new hashes, so old
cached references 404 silently). Previously the ONLY fix was a human seeing
the message and tapping the button after already waiting 6 seconds.

**What changed (`index.html`):**
- The page now listens for the exact failure directly (a script/stylesheet
  404, or a lazy page-chunk import failing) and clears the stale
  cache + service worker and reloads **immediately** and **automatically** —
  no more waiting for the timeout, and for most people the broken-cache
  screen won't appear at all anymore, it'll just silently self-heal on the
  very first failed load.
- Capped to one automatic attempt per browser tab session so it can never
  loop; a manual tap on the button always still works regardless.
- This is a client-side self-heal only. It cannot fix a genuinely broken
  deploy (e.g. a real build error on the server) — only stale-cache cases,
  which is what the existing safety-net message describes.

## 2. Built-in ~5,500-word default vocabulary bank

Added `src/data/defaultVocabulary.json` — cleaned, de-duplicated, and
normalized from the supplied `7000_ESL_Learning.json` (actually a CSV):

- **5,483 unique words** (source had 7,076 rows; 1,593 were exact duplicates
  and were merged, keeping the most complete copy of each)
- 7 rows with corrupted/column-shifted source data (e.g. "million",
  "conservation", "livestock", "boutique", "cay", "desert", "fjord") were
  manually repaired rather than imported broken
- Each entry has: word, definition, part of speech, CEFR level (A1–C2),
  example sentence, difficulty, and — where present in the source —
  synonym, antonym, category, Lao translation, Thai translation
- 174 categories, spread across all 6 CEFR levels

**How it's wired in (`src/App.tsx`, `src/hooks/useVocabulary.ts`):**
- Seeded automatically into the shared curriculum store the first time a
  browser has none (fresh install, or after a full data reset) — no admin
  setup required.
- Loaded via a **dynamic import**, so it's its own ~295KB (gzipped) chunk
  fetched only after login, in the background — it never blocks or slows
  down the initial app boot.
- Uses the existing add-only merge path, so it never overwrites or removes
  anything an admin has already pushed via Google Sheet / GitHub sync, and
  never re-seeds once any shared curriculum exists.
- Because every study mode (Flashcards, Quiz, Matching, Spelling,
  Categories, Level Journey, Word List, Favorites) already reads from the
  same shared `vocabulary.words` list, all of them get the full word bank
  automatically — no per-feature changes needed.

## Deploying
Same as before — push this to your `esl.learning` repo's `main` branch (or
wherever your GitHub Actions Pages workflow builds from). No new secrets or
config needed for the word bank; it's baked into the build.

## 3. Category cleanup (this update)

Reviewed all categories generated from the word list and cleaned them up:

- **175 → 99 categories.** Merged naming inconsistencies from the source
  file (e.g. "Political" + "Politics" → **Politics**; "Economics" +
  "Economy" → **Economy**; "Flower"/"Flowers" → **Nature**; "House" →
  **Home**), and folded ~50 one-off categories that only existed because a
  single idiomatic phrase (e.g. "bank on", "grow apart", "wrestle with")
  had been given its own unique category name into one real, useful
  category: **Phrasal Verbs & Idioms** (48 entries).
- **Fixed 15 words with corrupted source data** (comma inside a field had
  shifted every column after it) so their definition, example, category,
  etc. are all correct instead of garbled: million, conservation,
  livestock, boutique, cay, desert, fjord, besides, delegate, otherwise,
  so, therefore, unlike, archipelago.
- **0 uncategorized words** (was 2) and **0 singleton categories** (was 15+)
  — every one of the 99 categories now has a meaningful number of words in
  it, so Categories/Level Journey/Flashcards etc. are all useful to browse.
- All 5,483 words are still present — this only touched the `category`
  field and the 15 corrupted rows' text, not word count.

## 4. This update: clean app + real import system + 16-category word list

**App is now clean by default.** `src/data/defaultVocabulary.json` is an
empty array — the app no longer bundles or auto-loads any word list, and
the risky first-login "merge 5,483 words into localStorage" step from the
previous update is fully removed. This was the most likely cause of the
error screen on open, and removing it also shrank the production bundle
significantly (precached assets dropped from ~3.3MB to ~1.8MB), which
should make first load noticeably faster and more reliable on slow
connections too.

**Import system (already existed, now also handles JSON everywhere):**
- **Admin Panel → Import/Export tab**: upload a `.csv` or `.json` file to
  push words into the shared curriculum every learner sees. Supports up to
  **20,000 words per file** (50MB) — comfortably over the 10,000-word
  requirement. A "Push to All Learners" button syncs it to every device via
  GitHub.
- **Admin Panel → Google Sheet tab**: paste a published Google Sheet CSV
  link (or an Apps Script URL) and sync directly — no file upload needed.
- **My Words → Import/Export** (every learner): now also accepts `.json`
  files, not just `.csv`/`.xlsx`/`.xls`, for personal word list imports.
- **New: Admin Panel → Import/Export → Danger Zone → "Full Factory Reset &
  Sign Out"**. This app doesn't use Firebase — everything (login session,
  vocabulary, settings) lives only in the browser's own storage. This new
  button clears ALL of it (localStorage, sessionStorage, IndexedDB, cached
  files, the service worker) and signs out, exactly like a fresh install —
  for when the app is stuck and nothing else has fixed it.

**Category-organized starter word list (delivered separately, not
bundled):** `esl_vocabulary_16categories_5517words.json` /
`.csv` — the word list re-organized into exactly the 16 categories
requested, ready to import via Admin Panel:

- People, Family, & Relationships (325) · Time & Sequences (142) ·
  Food & Drink (134) · Places & Locations (429) · Common Actions / Verbs
  (1,061) · Body Parts & Health (329) · Money & Commerce (190) ·
  Work, Study, & Technology (828) · Weather & Nature (258) ·
  Describing People (1,181) · Agriculture & Farming (49) ·
  Forestry & Land Management (29) · Environment & Ecology (113) ·
  Climate & Atmospheric Dynamics (36) · Economy & Finance (111) ·
  Policy & Governance (302)
- **5,517 words total.** This is the accurate, verified word set from your
  original file, re-categorized — not fabricated. Reaching 10,000+ with
  the same accuracy (correct definitions AND correct Lao/Thai translations)
  needs a larger source list; the import system itself already supports
  20,000+ words whenever one is available, and the smaller Forestry/Climate
  categories were hand-supplemented with ~50 additional verified English
  entries so every one of the 16 categories has solid coverage.

To load this into the app: Admin Panel → Import/Export → Import CSV/JSON →
select `esl_vocabulary_16categories_5517words.json` → Push to All Learners.

## 5. This update: Firebase fully removed + words loaded into the app

**Firebase double-checked and fully removed.** The earlier check only
searched `src/`, which is why these were missed — they're now deleted:
- `firestore.rules` (orphaned Firestore security rules, unused by the app)
- `scripts/import-excel-to-firestore.mjs` (orphaned admin script, not
  referenced by any `package.json` script — dead code)
- `VITE_FIREBASE_*` secrets removed from `.github/workflows/deploy.yml`
  (they were being injected into the build but nothing in the app ever
  read them)
- `MIGRATION_GUIDE.md` rewritten to remove all Firebase/Firestore setup
  instructions (which described files that were never actually built) and
  accurately describe the two systems that really exist: GitHub Sync and
  Google Sheet sync.
- Confirmed: no `firebase` package.json dependency, no `.env` file with
  Firebase keys, no Firebase imports anywhere in `src/`.

**The 16-category word list is now loaded into the app.** 
`src/data/defaultVocabulary.json` is restored — but now containing the
5,517-word list organized into your 16 requested categories (not the old
99-category set), so Categories, Flashcards, Quiz, Matching, and Spelling
all have real content from first install.

Seeded more carefully than the version that shipped before:
- Loaded as its own ~294KB (gzipped) chunk, fetched only after login —
  never part of the initial bundle.
- Merged in **11 batches of 500 words** on a timer instead of one big
  synchronous pass, so it can't block the UI.
- Every batch is individually wrapped so one bad batch can only get
  skipped — it can never take down the app.
- Only runs the very first time a browser's shared curriculum is empty;
  an admin's own CSV/JSON import or Google Sheet sync always takes
  priority and is never overwritten.
