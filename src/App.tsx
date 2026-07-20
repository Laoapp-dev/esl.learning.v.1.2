import { Routes, Route } from 'react-router-dom';
import { createContext, useContext, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { useVocabulary } from '@/hooks/useVocabulary';
import { useToast } from '@/hooks/useToast';
import { useAuth, AuthProvider } from '@/hooks/useAuth';
import { useGoogleSheet } from '@/hooks/useGoogleSheet';
import { useGithubUserSync } from '@/hooks/useGithubUserSync';
import { Sidebar } from '@/components/Sidebar';
import { MobileNav } from '@/components/MobileNav';
import { ToastContainer } from '@/components/ToastContainer';
import { AuthPage } from '@/pages/AuthPage';
import type { VocabularyWord } from '@/types/vocabulary';

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
// Every page below is its own separate JS chunk, loaded on demand instead of
// all being bundled into one giant file that every visitor has to download
// (and that has to succeed loading perfectly) before anything can render.
const Dashboard      = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const WordList       = lazy(() => import('@/pages/WordList').then(m => ({ default: m.WordList })));
const Favorites      = lazy(() => import('@/pages/Favorites').then(m => ({ default: m.Favorites })));
const LevelJourney   = lazy(() => import('@/pages/LevelJourney').then(m => ({ default: m.LevelJourney })));
const Categories     = lazy(() => import('@/pages/Categories').then(m => ({ default: m.Categories })));
const StudyLayout    = lazy(() => import('@/pages/StudyLayout').then(m => ({ default: m.StudyLayout })));
const Flashcards     = lazy(() => import('@/pages/Flashcards').then(m => ({ default: m.Flashcards })));
const Quiz           = lazy(() => import('@/pages/Quiz').then(m => ({ default: m.Quiz })));
const Matching       = lazy(() => import('@/pages/Matching').then(m => ({ default: m.Matching })));
const Spelling       = lazy(() => import('@/pages/Spelling').then(m => ({ default: m.Spelling })));
const Settings       = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Profile        = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })));
const AdminPanel     = lazy(() => import('@/pages/AdminPanel').then(m => ({ default: m.AdminPanel })));
const UserDashboard  = lazy(() => import('@/pages/UserDashboard').then(m => ({ default: m.UserDashboard })));
const PreTest        = lazy(() => import('@/pages/PreTest').then(m => ({ default: m.PreTest })));
const Practice       = lazy(() => import('@/pages/Practice').then(m => ({ default: m.Practice })));

function PageLoading() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 border-[3px] border-[#1A1A2E]/20 border-t-[#1A1A2E] rounded-full animate-spin" />
    </div>
  );
}

interface AppContextType {
  vocabulary: ReturnType<typeof useVocabulary>;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => string;
  gsheet: ReturnType<typeof useGoogleSheet>;
  githubSync: ReturnType<typeof useGithubUserSync>;
}

export const AppContext = createContext<AppContextType | null>(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

function AppInner() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const vocabulary = useVocabulary(currentUser?.dataKey);
  const { toasts, addToast, removeToast } = useToast();
  const gsheet = useGoogleSheet();
  const githubSync = useGithubUserSync();

  // Track previous auth state to fire effects only on login transition
  const prevAuthRef = useRef(false);

  // Surface warnings/notices bubbled up from useVocabulary as toasts —
  // the hook itself has no UI, so App.tsx is where these become visible.
  useEffect(() => {
    if (vocabulary.storageWarning) {
      addToast(vocabulary.storageWarning, 'error');
      vocabulary.clearStorageWarning();
    }
  }, [vocabulary.storageWarning]); // eslint-disable-line

  useEffect(() => {
    if (vocabulary.externalSyncNotice) {
      const { added, updated } = vocabulary.externalSyncNotice;
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} new word${added === 1 ? '' : 's'}`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (parts.length > 0) addToast(`✨ Vocabulary synced from another tab — ${parts.join(', ')}`, 'success');
      vocabulary.clearExternalSyncNotice();
    }
  }, [vocabulary.externalSyncNotice]); // eslint-disable-line

  // On login: pull vocab from GitHub (shared curriculum itself is loaded
  // by useVocabulary directly from IndexedDB on mount — see that hook)
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    if (prevAuthRef.current) return; // already ran for this session
    prevAuthRef.current = true;

    // Pull vocab from GitHub in background (cross-device sync)
    githubSync.pullVocab(currentUser.id).then(r => {
      if (r.success && r.data?.words && r.data.words.length > 0) {
        vocabulary.mergeSharedWords(r.data.words);
      }
    }).catch(() => {/* silent — GitHub not configured yet */});

  }, [isAuthenticated, currentUser?.id]); // eslint-disable-line

  // ── Seed the built-in word bank ───────────────────────────────────────────
  // src/data/defaultVocabulary.json ships with a curated, CEFR-tagged
  // starter curriculum organized into 16 topic categories (People/Family,
  // Time & Sequences, Food & Drink, Places & Locations, Common Actions/
  // Verbs, Body & Health, Money & Commerce, Work/Study/Technology, Weather
  // & Nature, Describing People, Agriculture & Farming, Forestry & Land
  // Management, Environment & Ecology, Climate & Atmospheric Dynamics,
  // Economy & Finance, Policy & Governance) so every Category lesson has
  // real words in it from the moment the app is installed — no admin setup
  // required first. An admin's own CSV/JSON import or Google Sheet sync
  // always takes priority: this only runs once, the very first time a
  // browser's shared curriculum is empty, and never overwrites anything.
  //
  // Loaded via a dynamic import (its own separate ~1.7MB chunk, fetched
  // only after login) so it never becomes part of the initial bundle the
  // browser has to download before the app can render — that keeps first
  // paint fast even on slow connections. The merge itself is chunked into
  // small batches on a timer (not one big synchronous pass) so it can
  // never block the main thread long enough to feel like a freeze, and
  // every step is wrapped so a failure here can only skip the seeding —
  // it can never crash the app.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!vocabulary.sharedLoaded) return; // wait for the real IndexedDB load to resolve first
    if (vocabulary.sharedWordCount > 0) return;
    let cancelled = false;

    import('@/data/defaultVocabulary.json')
      .then((mod) => {
        if (cancelled) return;
        const all = ((mod as { default?: unknown }).default ?? mod) as unknown;
        if (!Array.isArray(all) || all.length === 0) return;

        const BATCH_SIZE = 500;
        let i = 0;
        const seedNextBatch = () => {
          if (cancelled) return;
          try {
            const batch = all.slice(i, i + BATCH_SIZE);
            if (batch.length > 0) {
              vocabulary.mergeSharedWords(batch as Partial<VocabularyWord>[], 'shared');
            }
          } catch {
            /* one bad batch should never stop the rest, or crash the app */
          }
          i += BATCH_SIZE;
          if (i < all.length && !cancelled) {
            setTimeout(seedNextBatch, 0);
          }
        };
        seedNextBatch();
      })
      .catch(() => {/* built-in word bank unavailable — non-fatal, app still works empty until an admin imports */});

    return () => { cancelled = true; };
  }, [isAuthenticated, vocabulary.sharedLoaded, vocabulary.sharedWordCount]); // eslint-disable-line

  // Reset prevAuthRef when user logs out
  useEffect(() => {
    if (!isAuthenticated) prevAuthRef.current = false;
  }, [isAuthenticated]);

  // ── Auto-sync shared vocabulary for EVERY user, automatically ────────────────
  // This is the piece that makes "admin syncs once → all users see it" actually
  // work. The old auto-sync only fired if the CURRENT browser had a CSV URL
  // saved locally in Settings — which only the admin's own browser ever had.
  // A regular user's device never had it configured, so it silently did
  // nothing for them. Fix: the source URL is baked into the app at build time
  // (VITE_SHEET_CSV_URL in .env), so it's identical and present on every
  // visitor's device — admin or not — with zero setup required from them.
  const sheetUrl = import.meta.env.VITE_SHEET_CSV_URL as string | undefined;
  useEffect(() => {
    if (!isAuthenticated || !sheetUrl) return;

    const run = () => {
      gsheet.syncNow((words) => vocabulary.mergeSharedWords(words), { csvUrl: sheetUrl });
    };

    run(); // fetch once immediately on login/app open
    const minutes = Number(import.meta.env.VITE_SHEET_AUTO_SYNC_MIN) || 15;
    const id = setInterval(run, minutes * 60_000); // and keep refreshing while the tab stays open
    return () => clearInterval(id);
  }, [isAuthenticated, sheetUrl]); // eslint-disable-line

  // ── Shared curriculum sync via GitHub (EVERY user, works without a rebuild) ──
  // This is what makes "admin resets + imports CSV/Sheet + pushes" actually
  // reach other devices: a fixed file in the admin's configured GitHub repo
  // that every learner's app pulls on login and periodically thereafter.
  // Uses replaceSharedWords (reconciling replace), not mergeSharedWords (add
  // -only) — so when the admin pushes a fresh curriculum snapshot, words
  // that are no longer in it actually disappear from learners' devices
  // instead of piling up next to the new ones forever. A learner's own
  // manually-added words (source:'manual') are never touched by this.
  useEffect(() => {
    if (!isAuthenticated) return;

    const run = () => {
      githubSync.pullSharedVocabulary().then(r => {
        if (r.success && r.words && r.words.length > 0) {
          vocabulary.replaceSharedWords(r.words);
        }
      }).catch(() => {/* silent — GitHub not configured, or nothing pushed yet */});
    };

    run(); // once on login
    const id = setInterval(run, 15 * 60_000); // and every 15 min while the tab stays open
    return () => clearInterval(id);
  }, [isAuthenticated]); // eslint-disable-line

  // Legacy per-browser auto-sync (Admin Panel "auto sync" timer + interval
  // config). Kept for backward compatibility / manual testing by admin, but
  // NOT what makes vocabulary reach other users — see the effect above.
  useEffect(() => {
    const handler = () => {
      gsheet.syncNow((words) => vocabulary.mergeSharedWords(words));
    };
    window.addEventListener('moe-gsheet-autosync', handler);
    return () => window.removeEventListener('moe-gsheet-autosync', handler);
  }, []); // eslint-disable-line

  // Auto-push vocab to GitHub when words change (debounced 10s)
  // Only runs when authenticated and words are loaded
  useEffect(() => {
    if (!currentUser || !isAuthenticated || vocabulary.words.length === 0) return;
    githubSync.schedulePush(currentUser.id, vocabulary.words, vocabulary.sessions);
  }, [vocabulary.words.length, currentUser?.id, isAuthenticated]); // eslint-disable-line

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-[3px] border-[#1A1A2E]/20 border-t-[#1A1A2E] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <AuthPage />;

  return (
    <AppContext.Provider value={{ vocabulary, addToast, gsheet, githubSync }}>
      <div className="flex h-screen w-screen overflow-hidden bg-background dot-grid-bg">
        <div className="sidebar-desktop hidden md:block">
          <Sidebar profile={vocabulary.profile} currentStreak={vocabulary.profile.currentStreak} />
        </div>
        <main className="flex-1 overflow-y-auto main-content">
          <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8 md:py-8 main-content-mobile-pad md:pb-8">
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/"              element={<Dashboard />} />
                <Route path="/words"         element={<WordList />} />
                <Route path="/favorites"     element={<Favorites />} />
                <Route path="/pretest"       element={<PreTest />} />
                <Route path="/study"         element={<StudyLayout />}>
                  <Route path="level"        element={<LevelJourney />} />
                  <Route path="categories"   element={<Categories />} />
                  <Route path="flashcards"   element={<Flashcards />} />
                  <Route path="quiz"         element={<Quiz />} />
                  <Route path="matching"     element={<Matching />} />
                  <Route path="spelling"     element={<Spelling />} />
                </Route>
                <Route path="/settings"      element={<Settings />} />
                <Route path="/profile"       element={<Profile />} />
                <Route path="/my-account"    element={<UserDashboard />} />
                <Route path="/practice"        element={<Practice />} />
                {currentUser?.role === 'admin' && (
                  <Route path="/admin" element={<AdminPanel />} />
                )}
              </Routes>
            </Suspense>
          </div>
        </main>
        <MobileNav />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
