/**
 * useGoogleSheet — Google Sheets / Apps Script sync for ESL Learning
 *
 * Supports TWO modes:
 *  1. Published-CSV  : public read-only URL (File → Publish to web → CSV)
 *  2. Apps Script    : a deployed Google Apps Script Web App URL (GET returns JSON words)
 *
 * Words are stored in a shared localStorage key so ALL users see the same
 * admin-managed word list when they open the app (including on mobile).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { VocabularyWord, CEFRLevel, PartOfSpeech } from '@/types/vocabulary';

// ── Storage key shared across all users ───────────────────────────────────────
export const GS_CONFIG_KEY  = 'moe_gsheet_config';
export const GS_WORDS_KEY   = 'moe_gsheet_words';   // shared word list from sheet
export const GS_LAST_SYNC   = 'moe_gsheet_lastsync';

export interface GSConfig {
  mode: 'csv' | 'script';     // which method to use
  csvUrl: string;              // published CSV URL
  scriptUrl: string;           // Apps Script Web App URL
  autoIntervalMin: number;     // 0 = off
  lastSyncAt: string | null;
  lastSyncCount: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: GSConfig = {
  mode: 'csv',
  csvUrl: '',
  scriptUrl: '',
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

function normalise(v: string, options: string[], fallback: string): string {
  const t = (v || '').trim().toLowerCase();
  return options.includes(t) ? t : fallback;
}

type RawWord = Record<string, string>;

/** Map one CSV/JSON row → VocabularyWord partial (no id/dates/counts yet) */
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

/** Parse raw CSV text → array of row objects */
function parseCsv(text: string): RawWord[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Respect quoted fields
  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
      cur += c;
    }
    result.push(cur);
    return result;
  }

  const headers = splitLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj: RawWord = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
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
      const res = await fetch(proxy(url), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
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
    try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(GS_CONFIG_KEY) || '{}') }; }
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

  // ── Fetch & parse from Apps Script ──────────────────────────────────────────
  const fetchFromScript = useCallback(async (urlOverride?: string) => {
    const url = urlOverride ?? config.scriptUrl;
    if (!url) throw new Error('No Apps Script URL configured');
    // Apps Script returns JSON: { words: [...] } or just [...]
    const text = await fetchWithProxy(url);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error('Apps Script did not return valid JSON'); }
    const rows: RawWord[] = Array.isArray(json) ? json : (json.words ?? json.data ?? []);
    if (!Array.isArray(rows)) throw new Error('Unexpected JSON structure from Apps Script');
    return rows.map(parseRow).filter(Boolean) as ReturnType<typeof parseRow>[];
  }, [config.scriptUrl]);

  // ── Core sync ────────────────────────────────────────────────────────────────
  /**
   * Fetch words from the configured source and merge into the shared word store.
   * importFn is vocabulary.importWords — called with the new words.
   * Returns { success, count, error? }
   */
  const syncNow = useCallback(async (
    importFn?: (words: any[]) => void,
    overrides?: { csvUrl?: string; scriptUrl?: string; mode?: 'csv' | 'script' }
  ): Promise<{ success: boolean; count: number; error?: string }> => {
    setSyncing(true);
    setError(null);
    try {
      const mode = overrides?.mode ?? config.mode;
      const words = mode === 'script'
        ? await fetchFromScript(overrides?.scriptUrl)
        : await fetchFromCsv(overrides?.csvUrl);

      if (words.length === 0) throw new Error('No valid words found — check column headers');

      // Persist shared word list so all users see it on page load
      localStorage.setItem(GS_WORDS_KEY, JSON.stringify(words));

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
  }, [config.mode, fetchFromCsv, fetchFromScript, saveConfig]);

  // ── Check the SHEET ITSELF for duplicate rows, without merging anything ─────
  // Answers "does my Google Sheet have the same word typed in more than one
  // row?" — a separate question from app-side duplication (which
  // mergeSharedWords/dedupeWords already handle). Useful for an admin who
  // wants to clean the source data, not just the app's copy of it.
  const checkForDuplicates = useCallback(async (
    overrides?: { csvUrl?: string; scriptUrl?: string; mode?: 'csv' | 'script' }
  ): Promise<{ success: boolean; totalRows: number; duplicates: { word: string; count: number }[]; error?: string }> => {
    try {
      const mode = overrides?.mode ?? config.mode;
      const rows = mode === 'script'
        ? await fetchFromScript(overrides?.scriptUrl)
        : await fetchFromCsv(overrides?.csvUrl);

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
  }, [config.mode, fetchFromCsv, fetchFromScript]);

  // ── Test connection (dry run, no import) ─────────────────────────────────────
  const testConnection = useCallback(async (
    overrides?: { csvUrl?: string; scriptUrl?: string; mode?: 'csv' | 'script' }
  ) => {
    return syncNow(undefined, overrides);
  }, [syncNow]);

  // ── Load shared words on mount (for regular users who don't trigger sync) ────
  const getSharedWords = useCallback((): any[] => {
    try {
      const stored = localStorage.getItem(GS_WORDS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      // Defensive: drop any null/undefined/word-less entries so callers
      // (App.tsx → vocabulary.mergeSharedWords) never see them.
      return Array.isArray(parsed) ? parsed.filter((w) => w && typeof w === 'object' && w.word) : [];
    } catch { return []; }
  }, []);

  // ── Auto-sync timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.autoIntervalMin > 0 && (config.csvUrl || config.scriptUrl) && config.enabled) {
      timerRef.current = setInterval(() => {
        window.dispatchEvent(new CustomEvent('moe-gsheet-autosync'));
      }, config.autoIntervalMin * 60_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [config.autoIntervalMin, config.csvUrl, config.scriptUrl, config.enabled]);

  return {
    config, saveConfig,
    syncing, error, setError,
    lastSync,
    syncNow, testConnection, getSharedWords, checkForDuplicates,
  };
}
