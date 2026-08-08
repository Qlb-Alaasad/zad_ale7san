import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import PendingPage from '@/pages/PendingPage';
import AdminDashboard from '@/pages/AdminDashboard';
import StudentPortal from '@/pages/StudentPortal';
import LandingPage from '@/pages/LandingPage';
import { Loading } from '@/components/ui';

function ProtectedRoute({ children, requireAdmin }: { children: ReactNode; requireAdmin?: boolean }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;

  if (profile?.status === 'pending') return <Navigate to="/pending" replace />;
  if (profile?.status === 'rejected') return <Navigate to="/pending" replace />;

  if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/portal" replace />;
  if (!requireAdmin && profile?.role === 'admin') return <Navigate to="/admin" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/pending" element={<PendingPage />} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
          <Route path="/portal" element={<ProtectedRoute><StudentPortal /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
