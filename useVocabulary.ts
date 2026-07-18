import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, GraduationCap, Settings, User, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function MobileNav() {
  const { currentUser } = useAuth();
  const location = useLocation();

  const mobileNavItems = [
    { path: '/', label: 'Home', icon: LayoutDashboard, exact: true, matchPrefix: '/' },
    { path: '/words', label: 'Words', icon: BookOpen, exact: false, matchPrefix: '/words' },
    { path: '/study/flashcards', label: 'Study', icon: GraduationCap, exact: false, matchPrefix: '/study' },
    { path: '/settings', label: 'Settings', icon: Settings, exact: false, matchPrefix: '/settings' },
    currentUser?.role === 'admin'
      ? { path: '/admin', label: 'Admin', icon: Shield, exact: false, matchPrefix: '/admin' }
      : { path: '/my-account', label: 'Account', icon: User, exact: false, matchPrefix: '/my-account' },
  ];

  return (
    <nav className="sidebar-mobile fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#1A1A2E] mobile-nav-safe">
      <div className="flex items-center justify-around px-1 pt-1 pb-1">
        {mobileNavItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.matchPrefix);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium transition-all ${
                isActive
                  ? 'text-[#F5A623] bg-white/5'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <item.icon
                className={`h-5 w-5 ${isActive ? 'text-[#F5A623]' : ''}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
