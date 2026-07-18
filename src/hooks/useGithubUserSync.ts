/**
 * useGithubUserSync
 * ─────────────────────────────────────────────────────────────────────────────
 * Syncs user accounts AND vocabulary across devices using GitHub as the
 * shared database. Works for both admin and regular users.
 *
 * HOW IT WORKS:
 *  • A single GitHub repo stores all data:
 *      data/users/index.json          — list of all accounts (no passwords)
 *      data/users/{userId}/vocab.json — per-user vocabulary + sessions
 *
 *  REGISTRATION on device A:
 *    1. User fills in name / email / password
 *    2. Account saved to localStorage (for offline login)
 *    3. Account pushed to GitHub users/index.json
 *
 *  LOGIN on device B (phone/laptop):
 *    1. App pulls users/index.json from GitHub → merges into localStorage
 *    2. User sees their account and can log in
 *    3. After login, vocabulary pulled from GitHub → merged locally
 *
 *  SYNC:
 *    • Auto-push: whenever words change (debounced 10 s)
 *    • Manual:    "Sync Now" button in My Account page
 *
 * SECURITY NOTE:
 *  Passwords are never stored in GitHub — only hashes stored locally.
 *  For cross-device login, the user must set the same password on all devices
 *  OR use the "Forgot password" flow (resets to a known value via admin).
 *
 * SETUP (one-time, admin only):
 *  Admin Panel → GitHub Sync tab → token + repo → Save → "Push User Registry"
 */

import { useCallback, useRef } from 'react';
import type { AuthUser } from '@/types/auth';
import type { VocabularyWord, StudySession } from '@/types/vocabulary';
import { GITHUB_SYNC_KEY } from '@/types/auth';

export interface GithubSyncConfig {
  token: string;
  repo: string;   // "owner/repo"
  branch: string;
}

function getConfig(): GithubSyncConfig | null {
  try {
    const raw = localStorage.getItem(GITHUB_SYNC_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<GithubSyncConfig>;
    if (!c.token || !c.repo) return null;
    return { token: c.token, repo: c.repo, branch: c.branch || 'main' };
  } catch { return null; }
}

async function ghGet(config: GithubSyncConfig, path: string): Promise<{ content: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const data = await res.json();
  const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return { content: decoded, sha: data.sha };
}

async function ghPut(
  config: GithubSyncConfig,
  path: string,
  content: object,
  sha?: string,
  message = 'sync'
): Promise<void> {
  const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  const body: Record<string, string> = {
    message: `[ESL Learning] ${message} — ${new Date().toISOString()}`,
    content: encoded,
    branch: config.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `GitHub PUT failed: ${res.status}`);
  }
}

// ── Public user record (NO password / hash) ───────────────────────────────────
export interface PublicUserRecord {
  id: string;
  username: string;
  email: string;
  role: string;
  joinDate: string;
  cefrLevel: string;
  dailyGoal: number;
  currentStreak: number;
  longestStreak: number;
}

export interface UserVocabData {
  userId: string;
  updatedAt: string;
  words: VocabularyWord[];
  sessions: StudySession[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  count?: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useGithubUserSync() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Push all registered users (public info only) to GitHub ───────────────────
  const pushUserRegistry = useCallback(async (
    users: AuthUser[]
  ): Promise<SyncResult> => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured — set up in Admin Panel → GitHub Sync' };
    try {
      const path = 'data/users/index.json';
      const existing = await ghGet(config, path);
      const publicUsers: PublicUserRecord[] = users.map(u => ({
        id: u.id, username: u.username, email: u.email,
        role: u.role, joinDate: u.joinDate, cefrLevel: u.cefrLevel,
        dailyGoal: u.dailyGoal, currentStreak: u.currentStreak,
        longestStreak: u.longestStreak,
      }));
      await ghPut(config, path, { users: publicUsers, updatedAt: new Date().toISOString() }, existing?.sha, 'update user registry');
      return { success: true, message: `Pushed ${publicUsers.length} users to GitHub`, count: publicUsers.length };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  // ── Pull user registry from GitHub → merge into localStorage ────────────────
  const pullUserRegistry = useCallback(async (): Promise<SyncResult & { users?: PublicUserRecord[] }> => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured' };
    try {
      const file = await ghGet(config, 'data/users/index.json');
      if (!file) return { success: false, message: 'No user registry on GitHub yet — admin needs to push first' };
      const data = JSON.parse(file.content) as { users: PublicUserRecord[] };
      return { success: true, message: `Found ${data.users.length} accounts`, users: data.users, count: data.users.length };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  // ── Push vocabulary for one user ─────────────────────────────────────────────
  const pushVocab = useCallback(async (
    userId: string,
    words: VocabularyWord[],
    sessions: StudySession[]
  ): Promise<SyncResult> => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured' };
    try {
      const path = `data/users/${userId}/vocab.json`;
      const existing = await ghGet(config, path);
      const payload: UserVocabData = { userId, updatedAt: new Date().toISOString(), words, sessions };
      await ghPut(config, path, payload, existing?.sha, `update vocab for ${userId}`);
      return { success: true, message: `Synced ${words.length} words`, count: words.length };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  // ── Push/pull the SHARED curriculum (one file, reaches every learner) ───────
  // Distinct from pushVocab/pullVocab above, which are per-user progress.
  // This is the admin "push to all learners" mechanism: one JSON file at a
  // fixed path that every device pulls on login (see App.tsx), no rebuild or
  // redeploy needed — unlike the VITE_SHEET_CSV_URL build-time approach, this
  // works immediately from a running admin session as long as GitHub Sync is
  // configured (Admin Panel → GitHub Sync).
  const SHARED_VOCAB_PATH = 'data/shared/vocabulary.json';

  const pushSharedVocabulary = useCallback(async (
    words: Partial<VocabularyWord>[],
    pushedBy?: string
  ): Promise<SyncResult> => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured — set up in Admin Panel → GitHub Sync' };
    try {
      const existing = await ghGet(config, SHARED_VOCAB_PATH);
      const payload = {
        words,
        updatedAt: new Date().toISOString(),
        pushedBy: pushedBy || 'admin',
        count: words.length,
      };
      await ghPut(config, SHARED_VOCAB_PATH, payload, existing?.sha, `push shared vocabulary (${words.length} words)`);
      return { success: true, message: `Pushed ${words.length} words to all learners`, count: words.length };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  const pullSharedVocabulary = useCallback(async (): Promise<
    SyncResult & { words?: Partial<VocabularyWord>[]; updatedAt?: string }
  > => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured' };
    try {
      const file = await ghGet(config, SHARED_VOCAB_PATH);
      if (!file) return { success: false, message: 'No shared vocabulary pushed yet' };
      const data = JSON.parse(file.content) as { words: Partial<VocabularyWord>[]; updatedAt: string };
      const words = Array.isArray(data.words) ? data.words : [];
      return { success: true, message: `Found ${words.length} shared words`, words, updatedAt: data.updatedAt, count: words.length };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  // Clears the shared curriculum file on GitHub entirely — the "push" side
  // of an admin's reset-all-data flow, so stale shared vocabulary doesn't
  // get pulled back down to learners' devices after a local reset.
  const clearSharedVocabulary = useCallback(async (): Promise<SyncResult> => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured' };
    try {
      const existing = await ghGet(config, SHARED_VOCAB_PATH);
      if (!existing) return { success: true, message: 'Already empty' };
      await ghPut(config, SHARED_VOCAB_PATH, { words: [], updatedAt: new Date().toISOString(), pushedBy: 'admin (reset)', count: 0 }, existing.sha, 'reset shared vocabulary');
      return { success: true, message: 'Shared vocabulary cleared for all learners' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  // ── Pull vocabulary for one user ─────────────────────────────────────────────
  const pullVocab = useCallback(async (
    userId: string
  ): Promise<SyncResult & { data?: UserVocabData }> => {
    const config = getConfig();
    if (!config) return { success: false, message: 'GitHub not configured' };
    try {
      const file = await ghGet(config, `data/users/${userId}/vocab.json`);
      if (!file) return { success: false, message: 'No vocabulary data on GitHub for this account yet' };
      const data = JSON.parse(file.content) as UserVocabData;
      return { success: true, message: `Loaded ${data.words.length} words`, data, count: data.words.length };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, []);

  // ── Debounced auto-push (called on word changes) ─────────────────────────────
  const schedulePush = useCallback((
    userId: string,
    words: VocabularyWord[],
    sessions: StudySession[],
    delayMs = 10_000
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushVocab(userId, words, sessions).catch(() => {/* silent */});
    }, delayMs);
  }, [pushVocab]);

  return {
    pushUserRegistry, pullUserRegistry, pushVocab, pullVocab, schedulePush,
    pushSharedVocabulary, pullSharedVocabulary, clearSharedVocabulary,
  };
}
