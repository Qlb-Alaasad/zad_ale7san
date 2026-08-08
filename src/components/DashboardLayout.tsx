import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Trophy, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { NotificationBell } from './NotificationBell';

interface DashboardLayoutProps {
  children: ReactNode;
  navItems: { path: string; label: string; icon: ReactNode }[];
}

export function DashboardLayout({ children, navItems }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-cream-50 flex">
      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 right-0 h-screen w-64 bg-forest-900 text-cream-50 z-40 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 flex items-center gap-3 border-b border-forest-800">
          <div className="w-10 h-10 rounded-xl bg-gold-400 flex items-center justify-center flex-shrink-0">
            <span className="text-forest-900 font-bold text-lg">ز</span>
          </div>
          <div>
            <h1 className="font-bold text-cream-50">زاد الإحسان</h1>
            <p className="text-cream-300 text-xs">{profile?.role === 'admin' ? 'لوحة الشيخ' : 'بوابة الطالب'}</p>
          </div>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive(item.path) ? 'bg-gold-400 text-forest-900 font-bold' : 'text-cream-200 hover:bg-forest-800'}`}
            >
              {item.icon}
              <span className="text-sm">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-forest-800">
          <div className="mb-3 px-2">
            <p className="text-cream-200 text-sm font-medium truncate">{profile?.full_name}</p>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-cream-200 hover:bg-forest-800 transition-colors w-full">
            <LogOut className="w-4 h-4" />
            <span className="text-sm">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-forest-950/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-cream-50/90 backdrop-blur-sm border-b border-cream-200 px-4 lg:px-8 py-4 flex items-center justify-between">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg hover:bg-cream-100">
            {mobileOpen ? <X className="w-5 h-5 text-forest-800" /> : <Menu className="w-5 h-5 text-forest-800" />}
          </button>
          <div className="hidden lg:flex items-center gap-2 text-forest-800">
            <BookOpen className="w-5 h-5" />
            <span className="font-medium">أكاديمية زاد الإحسان</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="w-9 h-9 rounded-full bg-forest-700 text-cream-50 flex items-center justify-center font-bold text-sm">
              {profile?.full_name?.charAt(0) || '?'}
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-8 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
