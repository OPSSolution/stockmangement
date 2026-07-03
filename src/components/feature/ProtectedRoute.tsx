import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Roles allowed to access this route. Omit to allow any authenticated user. */
  roles?: UserRole[];
  /** Page permission key that must be viewable to access this route. */
  permKey?: string;
}

export default function ProtectedRoute({ children, roles, permKey }: ProtectedRouteProps) {
  const { profile, loading, canAccess } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (permKey && !canAccess(permKey)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
