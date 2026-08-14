import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { resolvePostAuthPath } from '@/lib/auth-helpers';
import { Loading } from '@/components/ui';

/** Redirect authenticated users away from public auth pages (prevents OAuth/login loops). */
export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading && !profile) return <Loading />;

  if (session || profile) {
    if (profile) {
      const target = resolvePostAuthPath(profile);
      if (location.pathname !== target) {
        return <Navigate to={target} replace />;
      }
    } else {
      return <Navigate to="/pending" replace />;
    }
  }

  return <>{children}</>;
}

/** Poll profile status on pending page so approved students are redirected automatically. */
export function PendingRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, refreshProfile } = useAuth();

  useEffect(() => {
    if (!session?.user) return;
    const interval = setInterval(() => {
      refreshProfile();
    }, 15000);
    return () => clearInterval(interval);
  }, [session?.user, refreshProfile]);

  if (loading && !profile) return <Loading />;

  if (!session && !profile) return <Navigate to="/login" replace />;

  if (profile?.status === 'approved') {
    return <Navigate to={resolvePostAuthPath(profile)} replace />;
  }

  return <>{children}</>;
}
