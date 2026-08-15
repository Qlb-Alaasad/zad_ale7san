import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleAlert as AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { completeAuthSession, resolvePostAuthPath } from '@/lib/auth-helpers';
import { Loading } from '@/components/ui';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { profile, error: authError } = await completeAuthSession();
      if (cancelled) return;

      if (authError || !profile) {
        setError(
          authError === 'no_session'
            ? 'انتهت جلسة تسجيل الدخول. حاول مرة أخرى.'
            : authError === 'profile_missing'
              ? 'تعذر تحميل ملفك الشخصي. يرجى المحاولة مجدداً.'
              : 'فشل تسجيل الدخول عبر Google. يرجى المحاولة مجدداً.'
        );
        setTimeout(() => navigate('/login', { replace: true }), 2500);
        return;
      }

      await refreshProfile();
      if (cancelled) return;

      navigate(resolvePostAuthPath(profile), { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, refreshProfile]);

  if (error) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <div className="flex items-center justify-center gap-2 bg-red-50 text-red-700 rounded-xl p-4 text-sm mb-4">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <p className="text-charcoal-500 text-sm">جارٍ إعادتك إلى صفحة الدخول...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center gap-3 p-4">
      <Loading />
      <p className="text-charcoal-500 text-sm">جارٍ إكمال تسجيل الدخول...</p>
    </div>
  );
}
