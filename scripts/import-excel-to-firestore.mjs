#!/usr/bin/env node
/**
 * import-excel-to-firestore.mjs
 * ---------------------------------------------------------------------------
 * Reads a vocabulary Excel/CSV file and upserts rows into Firestore, at
 * collection "vocabulary", one document per word (doc ID = slug of the word).
 *
 * WHY NO DUPLICATES ARE POSSIBLE:
 *  - The document ID is derived from the word itself (e.g. "Serendipity" ->
 *    "serendipity"). Writing the same word twice always updates the SAME
 *    document — Firestore doc IDs are unique by definition.
 *  - We also skip writing a document at all if its content hasn't changed
 *    since last time (content hash comparison), so re-running the script on
 *    an unchanged file costs zero writes and doesn't touch `updatedAt` —
 *    which means clients doing incremental sync see nothing new either.
 *
 * USAGE
 *   1. In Firebase Console → Project Settings → Service accounts →
 *      "Generate new private key". Save the JSON file somewhere safe,
 *      OUTSIDE this repo (never commit it).
 *   2. Set the environment variable GOOGLE_APPLICATION_CREDENTIALS to the
 *      path of that JSON file, e.g. (macOS/Linux):
 *         export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *      or on Windows (PowerShell):
 *         $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
 *   3. Run:
 *         npm run import:words -- ./data/vocabulary.xlsx
 *      (accepts .xlsx, .xls, or .csv — must have a header row)
 *
 * EXPECTED COLUMNS (case-insensitive, flexible naming — same as the app's
 * CSV import): word, definition, partOfSpeech, cefrLevel, exampleSentence,
 * synonym, antonym, category, difficulty, laoTranslation, thaiTranslation
 * ---------------------------------------------------------------------------
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';

// ── 1. Parse CLI args ────────────────────────────────────────────────────────
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run import:words -- <path-to-excel-or-csv>');
  process.exit(1);
}
if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// ── 2. Init Firebase Admin ──────────────────────────────────────────────────
// Uses GOOGLE_APPLICATION_CREDENTIALS env var automatically if set.
// Alternatively, set FIREBASE_SERVICE_ACCOUNT_JSON to the raw JSON string
// (handy for GitHub Actions secrets — see MIGRATION_GUIDE.md).
function initAdmin() {
  if (admin.apps.length) return;
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(inlineJson)) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}
initAdmin();
const db = admin.firestore();
const COLLECTION = 'vocabulary';

// ── 3. Helpers ───────────────────────────────────────────────────────────────
function slugify(word) {
  return word
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const VALID_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const VALID_POS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'phrase'];
const VALID_DIFF = ['easy', 'medium', 'hard'];

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

function normalizeRow(row) {
  const word = pick(row, 'word', 'Word');
  const definition = pick(row, 'definition', 'Definition', 'meaning');
  if (!word || !definition) return null;

  const cefrRaw = pick(row, 'cefrLevel', 'cefr_level', 'level', 'Level').toUpperCase() || 'B1';
  const posRaw = pick(row, 'partOfSpeech', 'part_of_speech', 'pos', 'POS').toLowerCase() || 'noun';
  const diffRaw = pick(row, 'difficulty', 'Difficulty').toLowerCase() || 'medium';

  return {
    word,
    definition,
    partOfSpeech: VALID_POS.includes(posRaw) ? posRaw : 'noun',
    cefrLevel: VALID_CEFR.includes(cefrRaw) ? cefrRaw : 'B1',
    exampleSentence: pick(row, 'exampleSentence', 'example_sentence', 'example'),
    synonym: pick(row, 'synonym'),
    antonym: pick(row, 'antonym'),
    category: pick(row, 'category'),
    difficulty: VALID_DIFF.includes(diffRaw) ? diffRaw : 'medium',
    laoTranslation: pick(row, 'laoTranslation', 'lao'),
    thaiTranslation: pick(row, 'thaiTranslation', 'thai'),
  };
}

function contentHash(data) {
  const { word, definition, partOfSpeech, cefrLevel, exampleSentence, synonym, antonym, category, difficulty, laoTranslation, thaiTranslation } = data;
  const flat = [word, definition, partOfSpeech, cefrLevel, exampleSentence, synonym, antonym, category, difficulty, laoTranslation, thaiTranslation].join('|');
  return createHash('sha256').update(flat).digest('hex');
}

// ── 4. Read the file ─────────────────────────────────────────────────────────
console.log(`Reading ${filePath} ...`);
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
console.log(`Found ${rawRows.length} rows in sheet "${wb.SheetNames[0]}".`);

const rows = rawRows.map(normalizeRow).filter(Boolean);
const skipped = rawRows.length - rows.length;
if (skipped > 0) console.warn(`Skipped ${skipped} row(s) missing word/definition.`);

// ── 5. Upsert into Firestore, only writing what actually changed ────────────
async function run() {
  let created = 0, updated = 0, unchanged = 0;
  const BATCH_SIZE = 400; // Firestore batch limit is 500 writes
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    let batchHasWrites = false;

    // Fetch existing docs for this chunk in parallel to compare hashes
    const refs = chunk.map(r => db.collection(COLLECTION).doc(slugify(r.word)));
    const snaps = await db.getAll(...refs);

    chunk.forEach((r, idx) => {
      const hash = contentHash(r);
      const existing = snaps[idx];
      if (existing.exists && existing.data().contentHash === hash) {
        unchanged++;
        return; // no-op — saves a write, and clients won't see a "change"
      }
      batch.set(refs[idx], {
        ...r,
        contentHash: hash,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deleted: false,
      }, { merge: true });
      batchHasWrites = true;
      existing.exists ? updated++ : created++;
    });

    if (batchHasWrites) await batch.commit();
    console.log(`Processed ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} rows...`);
  }

  console.log('\nDone.');
  console.log(`  New words:      ${created}`);
  console.log(`  Updated words:  ${updated}`);
  console.log(`  Unchanged:      ${unchanged} (skipped, no write)`);
  console.log('\nClients will pick these up on their next incremental sync.');
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
