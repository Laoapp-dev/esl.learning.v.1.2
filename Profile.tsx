import { Routes, Route, useLocation } from 'react-router-dom';
import { createContext, useContext, useCallback } from 'react';
import { useVocabulary } from '@/hooks/useVocabulary';
import { useToast } from '@/hooks/useToast';
import { useAuth, AuthProvider } from '@/hooks/useAuth';
import { useGithubSync } from '@/hooks/useGithubSync';
import { Sidebar } from '@/components/Sidebar';
import { MobileNav } from '@/components/MobileNav';
import { ToastContainer } from '@/components/ToastContainer';
import { Dashboard } from '@/pages/Dashboard';
import { WordList } from '@/pages/WordList';
import { StudyLayout } from '@/pages/StudyLayout';
import { Flashcards } from '@/pages/Flashcards';
import { Quiz } from '@/pages/Quiz';
import { Matching } from '@/pages/Matching';
import { Spelling } from '@/pages/Spelling';
import { Settings } from '@/pages/Settings';
import { Profile } from '@/pages/Profile';
import { AuthPage } from '@/pages/AuthPage';
import { AdminPanel } from '@/pages/AdminPanel';
import { UserDashboard } from '@/pages/UserDashboard';
import type { VocabularyWord } from '@/types/vocabulary';

interface AppContextType {
  vocabulary: ReturnType<typeof useVocabulary>;
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => string;
  publishWords: () => Promise<{ success: boolean; message: string; wordCount?: number }>;
  pullWords: (force?: boolean) => Promise<{ success: boolean; message: string; wordCount?: number }>;
}

export const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

function AppInner() {
  const { currentUser, isAuthenticated, isLoading, isOnline } = useAuth();
  const vocabulary = useVocabulary(currentUser?.dataKey);
  const { toasts, addToast, removeToast } = useToast();
  const isAdmin = currentUser?.role === 'admin';

  // Merge incoming shared words — add new ones, don't overwrite existing study progress
  const handleWordsReceived = useCallback((incoming: VocabularyWord[]) => {
    vocabulary.mergeSharedWords(incoming);
  }, [vocabulary]);

  const { publishWords, pullWords } = useGithubSync(
    vocabulary.words,
    handleWordsReceived,
    isAdmin,
    isOnline
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-3 border-[#1A1A2E]/20 border-t-[#1A1A2E] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <AppContext.Provider value={{ vocabulary, addToast, publishWords, pullWords }}>
      <div className="flex h-screen w-screen overflow-hidden bg-background dot-grid-bg">
        {/* Desktop Sidebar */}
        <div className="sidebar-desktop hidden md:block">
          <Sidebar
            profile={vocabulary.profile}
            currentStreak={vocabulary.profile.currentStreak}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto main-content">
          <div className="mx-auto max-w-[960px] px-4 py-6 md:px-8 md:py-8 main-content-mobile-pad md:pb-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/words" element={<WordList />} />
              <Route path="/study" element={<StudyLayout />}>
                <Route path="flashcards" element={<Flashcards />} />
                <Route path="quiz" element={<Quiz />} />
                <Route path="matching" element={<Matching />} />
                <Route path="spelling" element={<Spelling />} />
              </Route>
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/my-account" element={<UserDashboard />} />
              {currentUser?.role === 'admin' && (
                <Route path="/admin" element={<AdminPanel />} />
              )}
            </Routes>
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNav />

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
