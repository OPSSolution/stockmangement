import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function UnauthorizedPage() {
  const { profile } = useAuth();

  return (
    <div className="relative flex flex-col items-center justify-center h-screen text-center px-4 bg-gray-50 overflow-hidden">
      {/* Background watermark */}
      <span className="absolute bottom-0 text-[12rem] font-black text-gray-100 select-none pointer-events-none z-0 leading-none">
        403
      </span>

      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-2">
          <i className="ri-lock-2-line text-3xl text-red-400"></i>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Access Denied</h1>
        <p className="text-gray-500 max-w-sm">
          Your account role{' '}
          {profile?.role && (
            <span className="font-semibold text-gray-700 capitalize">({profile.role})</span>
          )}{' '}
          does not have permission to view this page.
        </p>

        {/* Role badge */}
        {profile?.role && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            profile.role === 'admin'
              ? 'bg-purple-100 text-purple-700'
              : profile.role === 'staff'
              ? 'bg-sky-100 text-sky-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            <i className={`${
              profile.role === 'admin' ? 'ri-shield-star-line' :
              profile.role === 'staff' ? 'ri-user-settings-line' :
              'ri-eye-line'
            } text-sm`}></i>
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </span>
        )}

        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"
        >
          <i className="ri-home-4-line"></i>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
