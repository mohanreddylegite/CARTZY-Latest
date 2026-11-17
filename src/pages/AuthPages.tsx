import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isValidIndianMobile } from '../services/indianValidation';
import { MobileOtpLogin } from '../components/auth/MobileOtpLogin';
import { CartzyLogo } from '../assets/CartzyLogo';

function formatAuthError(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in provider is not yet enabled in Firebase Console (Authentication -> Sign-in method). Use Mobile OTP or "Continue with Google".';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please check your credentials.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in window was closed before completing login.';
  }
  return err?.message || 'Authentication error. Please try again.';
}

export const LoginPage: React.FC = () => {
  const { loginCustomer, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextUrl = params.get('next') || '/';

  const [mode, setMode] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setIsSuccess(false);
    setSubmitting(true);
    try {
      await loginCustomer(email, password);
      navigate(nextUrl);
    } catch (err: any) {
      setMsg(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setMsg('');
    setIsSuccess(false);
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
      navigate(nextUrl);
    } catch (err: any) {
      setMsg(formatAuthError(err));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleReset = async () => {
    setMsg('');
    setIsSuccess(false);
    if (!email.trim()) {
      setMsg('Enter your email address above first to receive a password reset link.');
      return;
    }
    try {
      await resetPassword(email);
      setIsSuccess(true);
      setMsg('Password reset link sent to your email address. Check your inbox.');
    } catch (err: any) {
      setMsg(formatAuthError(err));
    }
  };

  const modeSwitcher = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
        <button
          type="button"
          onClick={() => {
            setMode('otp');
            setMsg('');
          }}
          className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
            mode === 'otp' ? 'bg-white text-[#14213D] shadow-sm' : 'text-slate-600 hover:text-[#14213D]'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>Mobile OTP</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('email');
            setMsg('');
          }}
          className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
            mode === 'email' ? 'bg-white text-[#14213D] shadow-sm' : 'text-slate-600 hover:text-[#14213D]'
          }`}
        >
          <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>Email &amp; Password</span>
        </button>
      </div>

      <button
        type="button"
        disabled={googleBusy}
        onClick={handleGoogle}
        className="w-full py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-bold text-[#14213D] hover:bg-slate-50 inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
      >
        {googleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        <span>Continue with Google</span>
      </button>

      <div className="text-center text-xs text-slate-500 space-y-1.5">
        <div>
          New to CARTZY?{' '}
          <Link to="/register" className="text-[#2563EB] font-bold hover:underline">
            Create Customer Account
          </Link>
        </div>
        <div className="text-[11px] text-slate-400">
          <Link to="/support" className="hover:text-[#14213D] hover:underline">
            Need help signing in?
          </Link>
          {' · '}
          <Link to="/legal/account-deletion" className="hover:text-[#14213D] hover:underline">
            Account Deletion Info
          </Link>
        </div>
      </div>
    </div>
  );

  if (mode === 'otp') {
    return (
      <div className="min-h-[calc(100dvh-140px)] flex items-center justify-center px-3.5 sm:px-4 py-6 sm:py-10 pb-24 sm:pb-12 bg-gradient-to-b from-slate-50 to-slate-100/70">
        <MobileOtpLogin
          onSuccess={() => navigate(nextUrl)}
          secondaryAuthSlot={modeSwitcher}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-140px)] flex items-center justify-center px-3.5 sm:px-4 py-6 sm:py-10 pb-24 sm:pb-12 bg-gradient-to-b from-slate-50 to-slate-100/70">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-[#14213D] via-[#1B2D52] to-[#14213D] px-6 sm:px-8 pt-7 pb-6 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="bg-white rounded-xl px-2.5 py-1.5 shadow-sm inline-flex">
              <CartzyLogo size="sm" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-200 bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FCA311]" />
              Secure Login
            </span>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#FCA311] mt-4">
            Your Local Shopping Marketplace
          </p>
          <h1 className="text-xl sm:text-2xl font-extrabold mt-1 tracking-tight">
            Sign In to Your Account
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5">
            Access your saved addresses, synced cart, wishlist, and order tracking.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Email Address
              </label>
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
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
                  placeholder="Enter your password"
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

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
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
              <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100">{modeSwitcher}</div>
          <p className="text-[11px] text-center text-slate-400 leading-relaxed">
            By continuing, you agree to CARTZY&apos;s{' '}
            <Link to="/legal/terms" className="text-[#2563EB] font-semibold hover:underline">
              Terms of Service
            </Link>{' '}
            &amp;{' '}
            <Link to="/legal/privacy" className="text-[#2563EB] font-semibold hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export const RegisterPage: React.FC = () => {
  const { registerCustomer, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!isValidIndianMobile(form.mobile)) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await registerCustomer(form);
      navigate('/account?tab=profile&welcome=1');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-140px)] flex items-center justify-center px-3.5 sm:px-4 py-6 sm:py-10 pb-24 sm:pb-12 bg-gradient-to-b from-slate-50 to-slate-100/70">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-[#14213D] via-[#1B2D52] to-[#14213D] px-6 sm:px-8 pt-7 pb-6 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="bg-white rounded-xl px-2.5 py-1.5 shadow-sm inline-flex">
              <CartzyLogo size="sm" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-200 bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FCA311]" />
              Email Verified
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold mt-5 tracking-tight">
            Create CARTZY Account
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5">
            Save addresses, sync your cart across devices, and track every order.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          <button
            type="button"
            onClick={() =>
              loginWithGoogle()
                .then(() => navigate('/account'))
                .catch((e) => setError(formatAuthError(e)))
            }
            className="w-full py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-bold text-[#14213D] hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Sign Up with Google
          </button>

          <div className="relative text-center text-[11px] uppercase tracking-wider text-slate-400">
            <span className="bg-white px-2.5 relative z-10">or register with email</span>
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
              <input
                required
                autoComplete="name"
                placeholder="e.g. Aarav Sharma"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address *</label>
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                10-Digit Mobile Number *
              </label>
              <div className="flex items-stretch rounded-xl border border-slate-300 focus-within:border-[#2563EB] overflow-hidden">
                <span className="px-3 bg-slate-50 border-r border-slate-200 text-xs font-bold text-[#14213D] flex items-center">
                  +91
                </span>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                  className="flex-1 px-3.5 py-2.5 text-sm font-mono outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password * (min 6 characters)
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl pl-4 pr-11 py-2.5 text-sm outline-none focus:border-[#2563EB]"
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

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Confirm Password *
              </label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#2563EB]"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-[#FCA311] hover:bg-amber-500 disabled:opacity-60 text-[#14213D] font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{submitting ? 'Creating Account...' : 'Register & Verify Email'}</span>
            </button>
          </form>

          <p className="text-xs text-center text-slate-500 pt-1">
            Already have an account?{' '}
            <Link to="/login" className="text-[#2563EB] font-bold hover:underline">
              Sign In
            </Link>
          </p>
          <p className="text-[11px] text-center text-slate-400 leading-relaxed">
            By creating an account, you agree to CARTZY&apos;s{' '}
            <Link to="/legal/terms" className="text-[#2563EB] font-semibold hover:underline">
              Terms of Service
            </Link>{' '}
            &amp;{' '}
            <Link to="/legal/privacy" className="text-[#2563EB] font-semibold hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
