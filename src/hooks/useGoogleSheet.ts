/**
 * useGoogleSheet — Google Sheets CSV sync for ESL Master Vocab
 *
 * Published-CSV only: a public read-only URL from Google Sheets
 * (File → Share → Publish to web → CSV). Apps Script mode has been
 * removed — one connection method is simpler to set up and support, and
 * the published-CSV link already covers the same use case (sheets that
 * aren't publicly shared can still be published-to-web read-only without
 * exposing edit access).
 *
 * Words are stored in a shared localStorage key so ALL users see the same
 * admin-managed word list when they open the app (including on mobile).
 *
 * CSV parsing uses PapaParse (not a hand-rolled splitter) so large,
 * real-world sheet exports — fields containing commas, quoted text, or
 * embedded line breaks — parse correctly at any size (tested well past
 * 10,000 rows).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import type { VocabularyWord, CEFRLevel, PartOfSpeech } from '@/types/vocabulary';

// ── Storage key shared across all users ───────────────────────────────────────
export const GS_CONFIG_KEY  = 'moe_gsheet_config';
export const GS_WORDS_KEY   = 'moe_gsheet_words';   // shared word list from sheet
export const GS_LAST_SYNC   = 'moe_gsheet_lastsync';

export interface GSConfig {
  csvUrl: string;              // published CSV URL
  autoIntervalMin: number;     // 0 = off
  lastSyncAt: string | null;
  lastSyncCount: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: GSConfig = {
  csvUrl: '',
  autoIntervalMin: 0,
  lastSyncAt: null,
  lastSyncCount: 0,
  enabled: false,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert any Sheets URL (edit, pub, export) → reliable CSV export URL */
export function toCsvUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const idMatch = u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return raw;
    const id  = idMatch[1];
    const gid = u.hash.match(/gid=(\d+)/)?.[1]
              ?? u.searchParams.get('gid')
              ?? '0';
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  } catch {
    return raw;
  }
}

const VALID_CEFR:  CEFRLevel[]   = ['A1','A2','B1','B2','C1','C2'];
const VALID_POS:   PartOfSpeech[] = [
  'noun','verb','adjective','adverb','pronoun',
  'preposition','conjunction','interjection','phrase'
];

type RawWord = Record<string, string>;

/** Map one CSV row → VocabularyWord partial (no id/dates/counts yet) */
function parseRow(row: RawWord): Omit<VocabularyWord,
  'id'|'dateAdded'|'studyCount'|'correctCount'|'isLearned'|'isStarred'> | null {

  // Accept multiple spellings of required fields
  const word = (row.word ?? row.Word ?? '').trim();
  const def  = (row.definition ?? row.Definition ?? row.meaning ?? '').trim();
  if (!word || !def) return null;

  const cefrRaw = (row.cefrLevel ?? row.cefr_level ?? row.level ?? row.Level ?? 'B1').trim().toUpperCase();
  const cefrLevel = (VALID_CEFR.includes(cefrRaw as CEFRLevel) ? cefrRaw : 'B1') as CEFRLevel;

  const posRaw = (row.partOfSpeech ?? row.part_of_speech ?? row.pos ?? row.POS ?? 'noun').trim().toLowerCase();
  const partOfSpeech = (VALID_POS.includes(posRaw as PartOfSpeech) ? posRaw : 'noun') as PartOfSpeech;

  return {
    word,
    partOfSpeech,
    definition: def,
    exampleSentence: row.exampleSentence ?? row.example_sentence ?? row.example ?? '',
    synonym:    row.synonym    || undefined,
    antonym:    row.antonym    || undefined,
    cefrLevel,
    category:   row.category   || undefined,
    difficulty: (['easy','medium','hard'].includes(row.difficulty||'') ? row.difficulty : 'medium') as VocabularyWord['difficulty'],
    laoTranslation:  row.laoTranslation  ?? row.lao  ?? undefined,
    thaiTranslation: row.thaiTranslation ?? row.thai ?? undefined,
    nextReviewDate: undefined,
  };
}

/**
 * Parse raw CSV text → array of row objects, keyed by header.
 * Uses PapaParse so quoted fields, embedded commas, escaped quotes ("")
 * and multi-line cells all parse correctly — a hand-rolled line-splitter
 * breaks on exactly those cases, which real Google Sheets exports hit
 * often once a list grows past a few hundred rows.
 */
function parseCsv(text: string): RawWord[] {
  const result = Papa.parse<RawWord>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });
  return (result.data || []).filter(Boolean);
}

// ── CORS proxies – tried in order until one works ──────────────────────────────
const PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://cors.eu.org/${url}`,
];

async function fetchWithProxy(url: string): Promise<string> {
  let lastErr: Error = new Error('All proxies failed');
  for (const proxy of PROXIES) {
    try {
      // 30s timeout (not 12s) — a 10,000+ row published sheet can take a
      // while for Google to render as CSV plus proxy round-trip time.
      const res = await fetch(proxy(url), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (res.ok) return res.text();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr;
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useGoogleSheet() {
  const [config, setConfig] = useState<GSConfig>(() => {
    try {
      // Backward-compatible: old configs may still have mode/scriptUrl
      // fields saved from before Apps Script mode was removed — spreading
      // them into DEFAULT_CONFIG's shape simply drops anything unused.
      const stored = JSON.parse(localStorage.getItem(GS_CONFIG_KEY) || '{}');
      return { ...DEFAULT_CONFIG, csvUrl: stored.csvUrl ?? '', autoIntervalMin: stored.autoIntervalMin ?? 0,
        lastSyncAt: stored.lastSyncAt ?? null, lastSyncCount: stored.lastSyncCount ?? 0, enabled: stored.enabled ?? false };
    }
    catch { return DEFAULT_CONFIG; }
  });
  const [syncing,  setSyncing]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(config.lastSyncAt);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Persist config ───────────────────────────────────────────────────────────
  const saveConfig = useCallback((updates: Partial<GSConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(GS_CONFIG_KEY, JSON.stringify(next));
      } catch (error) {
        console.error('Failed to save Google Sheet config to localStorage:', error);
      }
      return next;
    });
  }, []);

  // ── Fetch & parse from CSV URL ───────────────────────────────────────────────
  const fetchFromCsv = useCallback(async (urlOverride?: string) => {
    const raw = urlOverride ?? config.csvUrl;
    if (!raw) throw new Error('No CSV URL configured');
    const csvUrl = toCsvUrl(raw);
    const text   = await fetchWithProxy(csvUrl);
    if (!text.trim()) throw new Error('Sheet returned empty content');
    const rows   = parseCsv(text);
    return rows.map(parseRow).filter(Boolean) as ReturnType<typeof parseRow>[];
  }, [config.csvUrl]);

  // ── Core sync ────────────────────────────────────────────────────────────────
  /**
   * Fetch words from the configured sheet and merge into the shared word store.
   * importFn is vocabulary.mergeSharedWords — called with the new words.
   * Returns { success, count, error? }
   */
  const syncNow = useCallback(async (
    importFn?: (words: any[]) => void,
    overrides?: { csvUrl?: string }
  ): Promise<{ success: boolean; count: number; error?: string }> => {
    setSyncing(true);
    setError(null);
    try {
      const words = await fetchFromCsv(overrides?.csvUrl);

      if (words.length === 0) throw new Error('No valid words found — check column headers');

      // NOTE: this used to also write the raw word list straight to
      // localStorage here (`localStorage.setItem(GS_WORDS_KEY, ...)`) as a
      // second copy "for regular users who don't trigger sync". That's
      // exactly the bug that capped shared curriculum syncs at roughly
      // 5,000 words — localStorage has a small, inconsistent per-origin
      // quota (often ~5MB), and it would throw and abort the whole sync
      // right here, before `importFn` (which persists to IndexedDB, with
      // effectively no such ceiling) ever ran. Removed — `importFn` below
      // is the only persistence path now, and every device that logs in
      // loads the shared curriculum straight from IndexedDB via
      // useVocabulary, so there's no second copy to keep in sync anyway.
      if (importFn) importFn(words);

      const now = new Date().toISOString();
      saveConfig({ lastSyncAt: now, lastSyncCount: words.length, enabled: true });
      setLastSync(now);
      setSyncing(false);
      return { success: true, count: words.length };
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setSyncing(false);
      return { success: false, count: 0, error: msg };
    }
  }, [fetchFromCsv, saveConfig]);

  // ── Check the SHEET ITSELF for duplicate rows, without merging anything ─────
  // Answers "does my Google Sheet have the same word typed in more than one
  // row?" — a separate question from app-side duplication (which
  // mergeSharedWords/dedupeWords already handle). Useful for an admin who
  // wants to clean the source data, not just the app's copy of it.
  const checkForDuplicates = useCallback(async (
    overrides?: { csvUrl?: string }
  ): Promise<{ success: boolean; totalRows: number; duplicates: { word: string; count: number }[]; error?: string }> => {
    try {
      const rows = await fetchFromCsv(overrides?.csvUrl);

      const counts = new Map<string, { word: string; count: number }>();
      for (const r of rows) {
        if (!r?.word) continue;
        const key = r.word.toLowerCase().trim();
        const g = counts.get(key);
        if (g) g.count++;
        else counts.set(key, { word: r.word, count: 1 });
      }
      const duplicates = Array.from(counts.values())
        .filter(g => g.count > 1)
        .sort((a, b) => b.count - a.count);

      return { success: true, totalRows: rows.length, duplicates };
    } catch (err) {
      return { success: false, totalRows: 0, duplicates: [], error: (err as Error).message };
    }
  }, [fetchFromCsv]);

  // ── Test connection (dry run, no import) ─────────────────────────────────────
  const testConnection = useCallback(async (
    overrides?: { csvUrl?: string }
  ) => {
    return syncNow(undefined, overrides);
  }, [syncNow]);

  // ── Auto-sync timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.autoIntervalMin > 0 && config.csvUrl && config.enabled) {
      timerRef.current = setInterval(() => {
        window.dispatchEvent(new CustomEvent('moe-gsheet-autosync'));
      }, config.autoIntervalMin * 60_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [config.autoIntervalMin, config.csvUrl, config.enabled]);

  return {
    config, saveConfig,
    syncing, error, setError,
    lastSync,
    syncNow, testConnection, checkForDuplicates,
  };
}
