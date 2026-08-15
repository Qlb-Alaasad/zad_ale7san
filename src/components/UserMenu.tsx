import { useState } from 'react';
import { LogOut, User, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

interface UserMenuProps {
  onSignOut?: () => void;
}

export function UserMenu({ onSignOut }: UserMenuProps) {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const initial = profile?.full_name?.charAt(0) || '?';
  const email = session?.user?.email;

  const handleSignOut = async () => {
    setOpen(false);
    if (onSignOut) {
      await onSignOut();
    } else {
      await signOut();
      navigate('/login');
    }
  };

  const statusLabel =
    profile?.status === 'approved' ? 'مفعّل' :
    profile?.status === 'pending' ? 'قيد المراجعة' : 'مرفوض';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowAccount(false);
        }}
        className="flex items-center gap-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-forest-200 transition-all"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="w-9 h-9 rounded-full bg-forest-700 text-cream-50 flex items-center justify-center font-bold text-sm shrink-0">
          {initial}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-forest-600 hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-forest-950/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[min(16rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-2xl border border-cream-200 z-50 overflow-hidden animate-slide-up">
            {!showAccount ? (
              <>
                <div className="px-4 py-3 border-b border-cream-100 bg-cream-50">
                  <p className="font-bold text-forest-900 text-sm truncate">{profile?.full_name}</p>
                  {email && <p className="text-xs text-charcoal-400 truncate mt-0.5">{email}</p>}
                </div>
                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAccount(true)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-charcoal-700 hover:bg-cream-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-forest-700" />
                    معلومات الحساب
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    تسجيل الخروج
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-cream-100 flex items-center justify-between">
                  <h3 className="font-bold text-forest-900 text-sm">معلومات الحساب</h3>
                  <button
                    type="button"
                    onClick={() => setShowAccount(false)}
                    className="text-xs text-forest-600 hover:underline"
                  >
                    رجوع
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-charcoal-400 mb-0.5">الاسم</p>
                    <p className="font-medium text-forest-900">{profile?.full_name || '—'}</p>
                  </div>
                  {email && (
                    <div>
                      <p className="text-xs text-charcoal-400 mb-0.5">البريد</p>
                      <p className="font-medium text-forest-900 break-all">{email}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-charcoal-400 mb-0.5">الدور</p>
                    <p className="font-medium text-forest-900">{profile?.role === 'admin' ? 'شيخ / إدارة' : 'طالب'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-charcoal-400 mb-0.5">الحالة</p>
                    <p className="font-medium text-forest-900">{statusLabel}</p>
                  </div>
                  {profile?.parent_phone && (
                    <div>
                      <p className="text-xs text-charcoal-400 mb-0.5">هاتف ولي الأمر</p>
                      <p className="font-medium text-forest-900" dir="ltr">{profile.parent_phone}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
