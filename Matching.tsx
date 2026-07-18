import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AuthUser, AuthState, LoginCredentials, RegisterCredentials, GithubConfig } from '@/types/auth';
import { AUTH_STORAGE_KEY, AUTH_CREDS_KEY, AUTH_SESSION_KEY, GITHUB_SYNC_KEY } from '@/types/auth';

// Simple hash for demo (in production, use bcrypt on a server)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function loadUsers(): AuthUser[] {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveUsers(users: AuthUser[]) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
}

function loadCreds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AUTH_CREDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCreds(creds: Record<string, string>) {
  localStorage.setItem(AUTH_CREDS_KEY, JSON.stringify(creds));
}

function getSessionUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY) || localStorage.getItem(AUTH_SESSION_KEY + '_persist');
    if (!raw) return null;
    const id = raw;
    const users = loadUsers();
    return users.find(u => u.id === id) || null;
  } catch { return null; }
}

function ensureAdminExists() {
  let users = loadUsers();
  let creds = loadCreds();

  // Migrate old admin email if present
  const OLD_EMAIL = 'admin@lexicon.app';
  const NEW_EMAIL = 'berndvh015@gmail.com';
  const oldAdmin = users.find(u => u.role === 'admin' && u.email.toLowerCase() === OLD_EMAIL);
  if (oldAdmin) {
    users = users.map(u =>
      u.id === oldAdmin.id ? { ...u, email: NEW_EMAIL, username: 'Beun Donsavanh' } : u
    );
    delete creds[OLD_EMAIL];
    creds[NEW_EMAIL] = simpleHash('admin123');
    saveUsers(users);
    saveCreds(creds);
    return;
  }

  // Create admin if no admin exists at all
  if (!users.find(u => u.role === 'admin')) {
    const adminId = uuidv4();
    const admin: AuthUser = {
      id: adminId,
      username: 'Beun Donsavanh',
      email: NEW_EMAIL,
      role: 'admin',
      joinDate: new Date().toISOString(),
      isActive: true,
      cefrLevel: 'C2',
      dailyGoal: 20,
      currentStreak: 0,
      longestStreak: 0,
      dataKey: `lexicon_data_${adminId}`,
    };
    users.push(admin);
    saveUsers(users);
    creds[NEW_EMAIL] = simpleHash('admin123');
    saveCreds(creds);
    return;
  }

  // Ensure the correct admin always has a valid credential entry
  const admin = users.find(u => u.role === 'admin');
  if (admin && !creds[admin.email.toLowerCase()]) {
    creds[admin.email.toLowerCase()] = simpleHash('admin123');
    saveCreds(creds);
  }
}

interface AuthContextType extends AuthState {
  login: (creds: LoginCredentials, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (creds: RegisterCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  getAllUsers: () => AuthUser[];
  updateUser: (id: string, updates: Partial<AuthUser>) => void;
  deleteUser: (id: string) => void;
  toggleUserActive: (id: string) => void;
  updateCurrentUserProfile: (updates: Partial<AuthUser>) => void;
  changePassword: (currentPassword: string, newPassword: string) => { success: boolean; error?: string };
  getGithubConfig: () => GithubConfig | null;
  saveGithubConfig: (config: GithubConfig) => void;
  syncToGithub: (data: object, userId: string) => Promise<{ success: boolean; message: string }>;
  loadFromGithub: (userId: string) => Promise<{ success: boolean; data?: object; message: string }>;
  isOnline: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    ensureAdminExists();
    const user = getSessionUser();
    if (user) setCurrentUser(user);
    setIsLoading(false);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const login = useCallback(async (creds: LoginCredentials, remember = false): Promise<{ success: boolean; error?: string }> => {
    const users = loadUsers();
    const storedCreds = loadCreds();
    const user = users.find(u => u.email.toLowerCase() === creds.email.toLowerCase());
    if (!user) return { success: false, error: 'No account found with this email' };
    if (!user.isActive) return { success: false, error: 'Account is deactivated. Contact admin.' };
    const hash = simpleHash(creds.password);
    if (storedCreds[user.email.toLowerCase()] !== hash) return { success: false, error: 'Incorrect password' };

    const updated = { ...user, lastLogin: new Date().toISOString() };
    const newUsers = users.map(u => u.id === user.id ? updated : u);
    saveUsers(newUsers);
    setCurrentUser(updated);
    if (remember) {
      localStorage.setItem(AUTH_SESSION_KEY + '_persist', user.id);
    } else {
      sessionStorage.setItem(AUTH_SESSION_KEY, user.id);
    }
    return { success: true };
  }, []);

  const register = useCallback(async (creds: RegisterCredentials): Promise<{ success: boolean; error?: string }> => {
    const users = loadUsers();
    const storedCreds = loadCreds();
    if (users.find(u => u.email.toLowerCase() === creds.email.toLowerCase())) {
      return { success: false, error: 'An account with this email already exists' };
    }
    if (creds.password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };
    const id = uuidv4();
    const newUser: AuthUser = {
      id,
      username: creds.username.trim(),
      email: creds.email.toLowerCase(),
      role: 'user',
      joinDate: new Date().toISOString(),
      isActive: true,
      cefrLevel: 'A2',
      dailyGoal: 10,
      currentStreak: 0,
      longestStreak: 0,
      dataKey: `lexicon_data_${id}`,
    };
    users.push(newUser);
    saveUsers(users);
    storedCreds[creds.email.toLowerCase()] = simpleHash(creds.password);
    saveCreds(storedCreds);
    setCurrentUser(newUser);
    sessionStorage.setItem(AUTH_SESSION_KEY, id);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY + '_persist');
  }, []);

  const getAllUsers = useCallback(() => loadUsers(), []);

  const updateUser = useCallback((id: string, updates: Partial<AuthUser>) => {
    const users = loadUsers();
    const newUsers = users.map(u => u.id === id ? { ...u, ...updates } : u);
    saveUsers(newUsers);
    if (currentUser?.id === id) setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
  }, [currentUser]);

  const deleteUser = useCallback((id: string) => {
    const users = loadUsers();
    const user = users.find(u => u.id === id);
    if (user) {
      const creds = loadCreds();
      delete creds[user.email.toLowerCase()];
      saveCreds(creds);
      // Remove user data
      localStorage.removeItem(user.dataKey + '_words');
      localStorage.removeItem(user.dataKey + '_sessions');
      localStorage.removeItem(user.dataKey + '_profile');
      localStorage.removeItem(user.dataKey + '_settings');
    }
    saveUsers(users.filter(u => u.id !== id));
  }, []);

  const toggleUserActive = useCallback((id: string) => {
    const users = loadUsers();
    const newUsers = users.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u);
    saveUsers(newUsers);
  }, []);

  const changePassword = useCallback((currentPassword: string, newPassword: string): { success: boolean; error?: string } => {
    if (!currentUser) return { success: false, error: 'Not logged in' };
    if (newPassword.length < 6) return { success: false, error: 'New password must be at least 6 characters' };
    const creds = loadCreds();
    const hash = simpleHash(currentPassword);
    if (creds[currentUser.email.toLowerCase()] !== hash) return { success: false, error: 'Current password is incorrect' };
    creds[currentUser.email.toLowerCase()] = simpleHash(newPassword);
    saveCreds(creds);
    return { success: true };
  }, [currentUser]);

  const updateCurrentUserProfile = useCallback((updates: Partial<AuthUser>) => {
    if (!currentUser) return;
    updateUser(currentUser.id, updates);
  }, [currentUser, updateUser]);

  const getGithubConfig = useCallback((): GithubConfig | null => {
    try {
      const raw = localStorage.getItem(GITHUB_SYNC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const saveGithubConfig = useCallback((config: GithubConfig) => {
    localStorage.setItem(GITHUB_SYNC_KEY, JSON.stringify(config));
  }, []);

  const syncToGithub = useCallback(async (data: object, userId: string): Promise<{ success: boolean; message: string }> => {
    if (!isOnline) return { success: false, message: 'No internet connection. Data saved offline.' };
    const config = getGithubConfig();
    if (!config?.token || !config?.repo) return { success: false, message: 'GitHub not configured' };

    const path = `data/users/${userId}.json`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;

    try {
      // Get existing SHA if file exists
      let sha: string | undefined;
      const getRes = await fetch(url, {
        headers: { Authorization: `token ${config.token}`, Accept: 'application/vnd.github.v3+json' }
      });
      if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
      }

      const body: Record<string, string> = {
        message: `Update vocab data for user ${userId} - ${new Date().toISOString()}`,
        content,
        branch: config.branch || 'main',
      };
      if (sha) body.sha = sha;

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `token ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!putRes.ok) {
        const err = await putRes.json();
        return { success: false, message: err.message || 'GitHub sync failed' };
      }
      return { success: true, message: 'Synced to GitHub successfully' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, [isOnline, getGithubConfig]);

  const loadFromGithub = useCallback(async (userId: string): Promise<{ success: boolean; data?: object; message: string }> => {
    if (!isOnline) return { success: false, message: 'No internet connection' };
    const config = getGithubConfig();
    if (!config?.token || !config?.repo) return { success: false, message: 'GitHub not configured' };

    const path = `data/users/${userId}.json`;
    const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `token ${config.token}`, Accept: 'application/vnd.github.v3+json' }
      });
      if (!res.ok) return { success: false, message: 'No data found on GitHub' };
      const file = await res.json();
      const decoded = decodeURIComponent(escape(atob(file.content)));
      return { success: true, data: JSON.parse(decoded), message: 'Loaded from GitHub' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }, [isOnline, getGithubConfig]);

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: !!currentUser,
      isLoading,
      isOnline,
      login,
      register,
      logout,
      getAllUsers,
      updateUser,
      deleteUser,
      toggleUserActive,
      updateCurrentUserProfile,
      changePassword,
      getGithubConfig,
      saveGithubConfig,
      syncToGithub,
      loadFromGithub,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
