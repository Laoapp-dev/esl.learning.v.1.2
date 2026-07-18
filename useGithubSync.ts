import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Layers, HelpCircle, Puzzle,
  Keyboard, Settings, Flame, LogOut, Shield, User,
} from 'lucide-react';
import type { UserProfile } from '@/types/vocabulary';
import { useAuth } from '@/hooks/useAuth';

interface SidebarProps {
  profile: UserProfile;
  currentStreak: number;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/words', label: 'My Words', icon: BookOpen, end: false },
];

const studyItems = [
  { path: '/study/flashcards', label: 'Flashcards', icon: Layers },
  { path: '/study/quiz', label: 'Quiz', icon: HelpCircle },
  { path: '/study/matching', label: 'Matching', icon: Puzzle },
  { path: '/study/spelling', label: 'Spelling', icon: Keyboard },
];

function SideNavLink({
  to,
  icon: Icon,
  label,
  end = false,
  accent = false,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  accent?: boolean;
}) {
  const location = useLocation();
  // For study sub-routes, match by startsWith so the active state works
  const isActive = end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(to + '/') || location.pathname === to;

  return (
    <NavLink
      to={to}
      end={end}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/50 hover:bg-white/5 hover:text-white'
      }`}
    >
      {isActive && (
        <div className="absolute left-0 h-4 w-[3px] rounded-r-full bg-[#F5A623]" />
      )}
      <Icon
        className={`h-5 w-5 ${accent ? 'text-[#F5A623]' : ''}`}
        strokeWidth={1.5}
      />
      <span className={accent ? 'text-[#F5A623]' : ''}>{label}</span>
    </NavLink>
  );
}

export function Sidebar({ profile, currentStreak }: SidebarProps) {
  const { currentUser, logout } = useAuth();

  return (
    <aside className="flex h-full w-[200px] flex-col bg-[#1A1A2E] text-white">
      {/* Logo */}
      <div className="flex items-center px-5 py-6">
        <span className="text-xl font-bold tracking-tight">Master of English</span>
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#F5A623]"></span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto">
        <div className="mb-6 space-y-1">
          {navItems.map((item) => (
            <SideNavLink
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={item.label}
              end={item.end}
            />
          ))}
        </div>

        {/* Study Section */}
        <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">
          Study
        </div>
        <div className="mb-6 space-y-1">
          {studyItems.map((item) => (
            <SideNavLink
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>

        {/* Bottom Navigation */}
        <div className="space-y-1">
          <SideNavLink to="/settings" icon={Settings} label="Settings" />
          <SideNavLink to="/my-account" icon={User} label="My Account" />
          {currentUser?.role === 'admin' && (
            <SideNavLink to="/admin" icon={Shield} label="Admin Panel" accent />
          )}
        </div>
      </nav>

      {/* User Profile */}
      <div className="mt-auto border-t border-white/10 px-3 py-3">
        <NavLink
          to="/my-account"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors mb-1 ${
              isActive ? 'bg-white/10' : 'hover:bg-white/5'
            }`
          }
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0 ${
              currentUser?.role === 'admin' ? 'bg-[#F5A623]' : 'bg-[#4A90E2]'
            }`}
          >
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{profile.username}</div>
            <div className="flex items-center gap-1 text-[11px] text-white/50">
              <Flame className="h-3 w-3 text-[#F5A623]" />
              <span>{currentStreak} day streak</span>
            </div>
          </div>
        </NavLink>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
