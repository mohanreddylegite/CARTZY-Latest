import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  Store,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchMySellerProfile } from '../services/marketplaceService';
import { SellerProfile } from '../types';
import { CartzyLogo } from '../assets/CartzyLogo';
import { MobileOtpLogin } from '../components/auth/MobileOtpLogin';

function formatSellerAuthError(err: any): string {
  const code = String(err?.code || '');
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Incorrect email or password. Use Forgot Password or try Mobile OTP.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Please wait a few minutes or reset your password.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is disabled in Firebase Console. Sign in via Mobile OTP instead.';
  }
  return err?.message || 'Unable to sign in to Seller Portal.';
}

export const SellerLoginPage: React.FC = () => {
  const { user, profile, loginCustomer, resetPassword, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextUrl = params.get('next') || '/seller';

  const [mode, setMode] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const [checkingSeller, setCheckingSeller] = useState(false);
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);

  useEffect(() => {
    if (!user) {
      setSellerProfile(null);
      return;
    }
    setCheckingSeller(true);
    fetchMySellerProfile(user.uid)
      .then((sp) => setSellerProfile(sp))
      .finally(() => setCheckingSeller(false));
  }, [user]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setIsSuccess(false);
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setMsg('Enter your registered Seller Email address to sign in with password, or switch to the Mobile OTP tab.');
      return;
    }
    setSubmitting(true);
    try {
      await loginCustomer(trimmed, password);
      navigate(nextUrl);
    } catch (err: any) {
      setMsg(formatSellerAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setMsg('');
    setIsSuccess(false);
    if (!email.trim() || !email.includes('@')) {
      setMsg('Enter your Seller Email address above first to receive a password reset link.');
      return;
    }
    try {
      await resetPassword(email);
      setIsSuccess(true);
      setMsg('Password reset link sent to your seller email inbox.');
    } catch (err: any) {
      setMsg(formatSellerAuthError(err));
    }
  };

  if (user && checkingSeller) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-slate-500">
        Checking Seller Portal access...
      </div>
    );
  }

  if (user && sellerProfile) {
    return (
      <div className="min-h-[calc(100dvh-140px)] flex items-center justify-center px-4 py-10 bg-[#F8FAFC]">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-7 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <CartzyLogo size="sm" />
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-100 text-[#14213D]">
              {sellerProfile.approvalStatus}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
              Signed In Seller Store
            </p>
            <h1 className="text-xl font-extrabold text-[#14213D]">{sellerProfile.businessName}</h1>
            <p className="text-xs text-slate-500">
              {sellerProfile.ownerName} · {sellerProfile.email || sellerProfile.mobile}
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <Link
              to="/seller"
              className="w-full py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <span>Open Seller Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="w-full py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out / Switch Seller Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-140px)] flex items-center justify-center px-3.5 sm:px-4 py-8 pb-24 md:pb-12 bg-[#F8FAFC]">
      <div className="w-full max-w-lg space-y-4">
        {user && !sellerProfile && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
            <div>
              <p className="font-bold">
                Currently signed in as Customer ({profile?.email || profile?.mobile || 'Active Session'})
              </p>
              <p className="text-amber-800 mt-0.5">
                This account does not have a registered Seller store. Sign out to log in with separate Seller credentials, or register your Vijayawada shop.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/seller/register"
                className="px-3 py-1.5 rounded-lg bg-[#14213D] text-white font-bold"
              >
                Register Shop
              </Link>
              <button
                type="button"
                onClick={() => logout()}
                className="px-3 py-1.5 rounded-lg border border-amber-400 bg-white text-amber-900 font-bold cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="bg-[#14213D] px-6 sm:px-8 pt-7 pb-6 text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="bg-white rounded-xl px-2.5 py-1.5 inline-flex">
                <CartzyLogo size="sm" />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FCA311]">
                <Store className="w-4 h-4" />
                Seller Central · Vijayawada
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold mt-4 tracking-tight">
              Seller Portal Sign In
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Manage your shop catalog, stock, customer orders, and settlements on CARTZY.
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
              <button
                type="button"
                onClick={() => {
                  setMode('email');
                  setMsg('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  mode === 'email'
                    ? 'bg-white text-[#14213D] shadow-sm'
                    : 'text-slate-600 hover:text-[#14213D]'
                }`}
              >
                <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Email &amp; Password</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('otp');
                  setMsg('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  mode === 'otp'
                    ? 'bg-white text-[#14213D] shadow-sm'
                    : 'text-slate-600 hover:text-[#14213D]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Mobile OTP (+91)</span>
              </button>
            </div>

            {mode === 'email' ? (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Seller Email Address
                  </label>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    placeholder="shop@business.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter seller password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl pl-4 pr-11 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Protected seller session
                  </span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>

                {msg && (
                  <div
                    className={`rounded-xl p-3 text-xs flex items-start gap-2 ${
                      isSuccess
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    {isSuccess ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <span>{msg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] disabled:opacity-60 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{submitting ? 'Signing In...' : 'Sign In to Seller Dashboard'}</span>
                </button>
              </form>
            ) : (
              <div className="pt-1">
                <MobileOtpLogin
                  defaultRole="seller"
                  skipOnboardingStep
                  subtitle="Verify your registered seller mobile number (+91) with 6-digit SMS OTP."
                  onSuccess={() => navigate(nextUrl)}
                />
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 text-center space-y-2 text-xs">
              <p className="text-slate-600">
                New merchant in Vijayawada?{' '}
                <Link to="/seller/register" className="text-[#2563EB] font-bold hover:underline">
                  Register Your Shop on CARTZY
                </Link>
              </p>
              <p className="text-[11px] text-slate-400">
                Looking for customer shopping?{' '}
                <Link to="/login" className="text-slate-600 font-semibold hover:underline">
                  Customer Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
