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
