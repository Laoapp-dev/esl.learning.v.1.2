/**
 * idbStore — minimal promise-based IndexedDB key-value helper.
 *
 * WHY THIS EXISTS:
 * localStorage has a hard per-origin quota that's small and inconsistent
 * across browsers — commonly ~5MB, sometimes measured in UTF-16 code units
 * (so a 5MB quota effectively caps out around 5,000 richly-tagged
 * vocabulary words, ~500 bytes each once id/dates/study-counts are added).
 * Writes past that limit fail (QuotaExceededError), which is exactly the
 * wall an admin hits trying to push a 10,000+ word shared curriculum.
 *
 * IndexedDB has no such small fixed limit — browsers grant it a share of
 * available disk space (typically tens of MB up to several GB), and it
 * stores structured data directly via the structured clone algorithm, so
 * there's no JSON.stringify/parse round-trip or UTF-16 string-doubling
 * overhead either. This module is intentionally tiny: one object store,
 * get/set/delete by string key — everything this app needs for the one
 * thing that actually needs to scale past localStorage (the shared
 * curriculum), without pulling in a full IndexedDB wrapper library.
 *
 * All calls resolve to `null` on any failure (browser has IndexedDB
 * disabled, private-mode restrictions, etc.) rather than throwing, so
 * callers can treat "no IndexedDB available" the same as "no data yet".
 */

const DB_NAME = 'esl_learning_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDelete(key: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
