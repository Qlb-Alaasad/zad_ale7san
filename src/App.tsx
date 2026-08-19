import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GuestRoute, PendingRoute } from '@/components/AuthRoutes';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import PendingPage from '@/pages/PendingPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import AdminDashboard from '@/pages/AdminDashboard';
import StudentPortal from '@/pages/StudentPortal';
import TeacherDashboard from '@/pages/TeacherDashboard';
import LandingPage from '@/pages/LandingPage';
import { Loading } from '@/components/ui';
import { dashboardPathForRole } from '@/lib/roles';
import type { UserRole } from '@/lib/types';

/**
 * Sprint 1: role-aware guard. `allow` lists the roles permitted on a route;
 * anyone else is bounced to their own dashboard (no dead ends).
 */
function ProtectedRoute({ children, allow }: { children: ReactNode; allow: UserRole[] }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  // While the initial session check is running, trust a cached profile
  // from localStorage so logged-in users don't flash to /login on refresh.
  if (loading && !profile) return <Loading />;

  if (!session && !profile) return <Navigate to="/login" state={{ from: location }} replace />;

  // Use cached profile for routing decisions while session restores
  const effectiveProfile = profile;

  if (effectiveProfile?.status === 'pending') return <Navigate to="/pending" replace />;
  if (effectiveProfile?.status === 'rejected') return <Navigate to="/pending" replace />;

  if (effectiveProfile && !allow.includes(effectiveProfile.role)) {
    return <Navigate to={dashboardPathForRole(effectiveProfile.role)} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/pending" element={<PendingRoute><PendingPage /></PendingRoute>} />
            <Route path="/admin" element={<ProtectedRoute allow={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/teacher" element={<ProtectedRoute allow={['teacher', 'admin']}><TeacherDashboard /></ProtectedRoute>} />
            <Route path="/portal" element={<ProtectedRoute allow={['student']}><StudentPortal /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
