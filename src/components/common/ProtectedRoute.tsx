import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BUSINESS_CONFIG } from '../../config/businessConfig';

export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  requireAdmin?: boolean;
  loginRedirect?: string;
}> = ({ children, requireAdmin = false, loginRedirect = '/login' }) => {
  const { user, profile, isAdmin, isSuspended, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`${loginRedirect}?next=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  if (isSuspended && !isAdmin) {
    return (
      <div className="max-w-lg mx-auto my-16 bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
        <h1 className="text-xl font-bold text-[#14213D]">Account Suspended</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Your CARTZY account has been temporarily suspended
          {profile?.suspensionReason ? `: ${profile.suspensionReason}` : '.'} Please contact{' '}
          <a href={`mailto:${BUSINESS_CONFIG.supportEmail}`} className="text-[#2563EB] font-semibold underline">
            {BUSINESS_CONFIG.supportEmail}
          </a>{' '}
          for assistance.
        </p>
        <button
          type="button"
          onClick={() => logout()}
          className="px-5 py-2.5 rounded-xl bg-[#14213D] text-white text-xs font-bold hover:bg-[#2563EB]"
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="max-w-lg mx-auto my-16 bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold text-[#14213D]">Administrator Access Required</h1>
        <p className="text-sm text-slate-600 mt-2">
          Your account does not have store administrator permissions. Please sign in with an authorized administrator account.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
