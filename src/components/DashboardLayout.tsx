import { type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

export interface DashboardNavItem {
  id?: string;
  path?: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
}

interface DashboardLayoutProps {
  children: ReactNode;
  navItems: DashboardNavItem[];
}

export function DashboardLayout({ children, navItems }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleNavClick = (item: DashboardNavItem) => {
    setMobileOpen(false);
    if (item.id === 'notifications') {
      setNotificationsOpen(true);
      return;
    }
    item.onClick?.();
  };

  const renderNavItem = (item: DashboardNavItem) => {
    const active = item.active ?? (item.path ? isActive(item.path) : false);
    const className = `flex items-center gap-3 px-4 py-3 rounded-xl transition-colors w-full text-right ${
      active ? 'bg-gold-400 text-forest-900 font-bold' : 'text-cream-200 hover:bg-forest-800'
    }`;

    if (item.onClick || !item.path) {
      return (
        <button
          key={item.id || item.label}
          type="button"
          onClick={() => handleNavClick(item)}
          className={className}
        >
          {item.icon}
          <span className="text-sm">{item.label}</span>
        </button>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={className}
      >
        {item.icon}
        <span className="text-sm">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-cream-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 right-0 h-screen w-64 bg-forest-900 text-cream-50 z-40 transition-transform duration-300 flex flex-col ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 flex items-center gap-3 border-b border-forest-800 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gold-400 flex items-center justify-center flex-shrink-0">
            <span className="text-forest-900 font-bold text-lg">ز</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-cream-50 truncate">زاد الإحسان</h1>
            <p className="text-cream-300 text-xs">{profile?.role === 'admin' ? 'لوحة الشيخ' : 'بوابة الطالب'}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map(renderNavItem)}
        </nav>

        <div className="shrink-0 p-4 border-t border-forest-800 space-y-3">
          <div className="px-2">
            <p className="text-cream-200 text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-cream-400 text-xs truncate">{profile?.role === 'admin' ? 'إدارة' : 'طالب'}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl w-full font-medium text-sm bg-red-600/20 text-red-300 border border-red-500/40 hover:bg-red-600/35 hover:text-red-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-forest-950/50 z-30 lg:hidden backdrop-blur-[1px]"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-cream-50/90 backdrop-blur-sm border-b border-cream-200 px-3 sm:px-4 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-cream-100 shrink-0"
              aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            >
              {mobileOpen ? <X className="w-5 h-5 text-forest-800" /> : <Menu className="w-5 h-5 text-forest-800" />}
            </button>
            <div className="hidden lg:flex items-center gap-2 text-forest-800 min-w-0">
              <BookOpen className="w-5 h-5 shrink-0" />
              <span className="font-medium truncate">أكاديمية زاد الإحسان</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <NotificationBell open={notificationsOpen} onOpenChange={setNotificationsOpen} />
            <UserMenu onSignOut={handleSignOut} />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full">{children}</main>
      </div>
    </div>
  );
}
