import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { isValidIndianMobile } from '../../services/indianValidation';
import { CartzyLogo } from '../../assets/CartzyLogo';

export const FIRST_VISIT_LOGIN_SEEN_KEY = 'cartzy_first_visit_seen_v1';
const OTP_SESSION_TTL_MS = 5 * 60 * 1000;

interface MobileOtpLoginProps {
  onSuccess?: (result: { isNewUser: boolean }) => void;
  onSkipGuest?: () => void;
  showSkipGuest?: boolean;
  subtitle?: string;
  secondaryAuthSlot?: React.ReactNode;
  defaultRole?: 'customer' | 'seller';
  skipOnboardingStep?: boolean;
}

interface ParsedPhoneAuthError {
  code?: string;
  message: string;
  configHint?: 'enable-phone' | 'authorized-domain' | 'billing' | 'quota' | 'captcha';
}

export function formatPhoneAuthError(err: any): ParsedPhoneAuthError {
  const code = String(err?.code || '');
  if (code === 'auth/invalid-phone-number') {
    return {
      code,
      message: 'Please enter a valid 10-digit Indian mobile number (+91 followed by 6–9XXXXXXXXX).',
    };
  }
  if (code === 'auth/missing-phone-number') {
    return {
      code,
      message: 'Enter your 10-digit mobile number to receive an OTP.',
    };
  }
  if (code === 'auth/invalid-verification-code') {
    return {
      code,
      message: 'Incorrect 6-digit OTP. Please check your SMS messages and try again.',
    };
  }
  if (code === 'auth/code-expired' || code === 'auth/session-expired') {
    return {
      code,
      message: 'This OTP has expired. Tap Resend OTP to receive a fresh 6-digit code.',
    };
  }
  if (code === 'auth/too-many-requests') {
    return {
      code,
      message:
        'Too many OTP attempts from this device or number. Please wait a few minutes before requesting another SMS.',
    };
  }
  if (code === 'auth/quota-exceeded') {
    return {
      code,
      message:
        'Firebase Phone Authentication SMS quota has been exceeded for this project.',
      configHint: 'quota',
    };
  }
  if (code === 'auth/billing-not-enabled') {
    return {
      code,
      message:
        'Firebase Phone Auth requires a Cloud Billing (Blaze) account on this Firebase project.',
      configHint: 'billing',
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      message:
        'Phone Sign-In is currently disabled on Firebase project jaunty-grail-c01dl (Starter Tier without billing). Use Google Sign-In or Email & Password.',
      configHint: 'enable-phone',
    };
  }
  if (code === 'auth/captcha-check-failed') {
    return {
      code,
      message:
        'reCAPTCHA security verification failed or expired. Complete the security check and retry.',
      configHint: 'captcha',
    };
  }
  if (
    code === 'auth/unauthorized-domain' ||
    code === 'auth/app-not-authorized' ||
    code === 'auth/missing-client-identifier'
  ) {
    return {
      code,
      message:
        'This domain is not authorized for Firebase Phone Auth reCAPTCHA verification yet.',
      configHint: 'authorized-domain',
    };
  }
  if (code === 'auth/web-storage-unsupported') {
    return {
      code,
      message:
        'Browser storage or third-party cookies required by reCAPTCHA are blocked. Allow cookies or use standard browser mode.',
    };
  }
  if (code === 'auth/network-request-failed' || err?.name === 'TypeError') {
    return {
      code,
      message:
        'Network error while contacting authentication servers. Please check your internet connection and retry.',
    };
  }
  return { code, message: err?.message || 'Verification failed. Please try again.' };
}

export function normalizeMobileInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0091') && digits.length >= 14) {
    return digits.slice(4, 14);
  }
  if (digits.startsWith('091') && digits.length >= 13) {
    return digits.slice(3, 13);
  }
  if (digits.startsWith('91') && digits.length >= 12) {
    return digits.slice(2, 12);
  }
  if (digits.startsWith('0') && digits.length >= 11) {
    return digits.slice(1, 11);
  }
  return digits.slice(0, 10);
}

export function toE164IndianMobile(raw: string): string | null {
  const tenDigit = normalizeMobileInput(raw);
  return isValidIndianMobile(tenDigit) ? `+91${tenDigit}` : null;
}

export const MobileOtpLogin: React.FC<MobileOtpLoginProps> = ({
  onSuccess,
  onSkipGuest,
  showSkipGuest = false,
  subtitle = 'Enter your 10-digit Indian mobile number to sign in or register securely.',
  secondaryAuthSlot,
  defaultRole = 'customer',
  skipOnboardingStep = false,
}) => {
  const { user, profile, syncPhoneAuthUser, completePhoneOnboarding } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp' | 'onboarding'>(() =>
    user && profile?.onboardingCompleted === false ? 'onboarding' : 'phone'
  );
  const [mobile, setMobile] = useState(() => normalizeMobileInput(profile?.mobile || ''));
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [expirySecondsLeft, setExpirySecondsLeft] = useState<number>(0);
  const [recaptchaMode, setRecaptchaMode] = useState<'invisible' | 'normal'>('invisible');
  const [unauthorizedHostDetected, setUnauthorizedHostDetected] = useState<string | null>(null);
  const [phoneProviderBlocked, setPhoneProviderBlocked] = useState<
    'operation_not_allowed' | 'billing_not_enabled' | null
  >(null);

  // New customer onboarding fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [errorInfo, setErrorInfo] = useState<ParsedPhoneAuthError | null>(null);
  const [infoBanner, setInfoBanner] = useState('');

  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaHostRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaModeRef = useRef<'invisible' | 'normal'>('invisible');
  const recaptchaWidgetIdRef = useRef<number | null>(null);
  const recaptchaInitPromiseRef = useRef<Promise<RecaptchaVerifier> | null>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const clearRecaptcha = () => {
    recaptchaInitPromiseRef.current = null;
    recaptchaWidgetIdRef.current = null;
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // ignore cleanup failures on detached nodes
      }
      recaptchaVerifierRef.current = null;
    }
    if (recaptchaHostRef.current) {
      recaptchaHostRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname;
    if (!host) return;
    fetch(`/api/auth/phone-config-check?hostname=${encodeURIComponent(host)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && data.isHostAuthorized === false) {
          setUnauthorizedHostDetected(host);
        } else {
          setUnauthorizedHostDetected(null);
        }
        if (data?.ok && data.phoneProviderEnabled === false) {
          if (
            data.phoneProviderStatus === 'operation_not_allowed' ||
            data.phoneProviderStatus === 'billing_not_enabled'
          ) {
            setPhoneProviderBlocked(data.phoneProviderStatus);
          }
        } else {
          setPhoneProviderBlocked(null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (user && profile?.onboardingCompleted === false && step !== 'onboarding') {
      setStep('onboarding');
      if (profile.mobile && !mobile) {
        setMobile(normalizeMobileInput(profile.mobile));
      }
    }
  }, [user, profile?.onboardingCompleted, profile?.mobile, step, mobile]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (step !== 'otp' || !otpExpiresAt) {
      setExpirySecondsLeft(0);
      return;
    }
    const syncRemaining = () => {
      const left = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setExpirySecondsLeft(left);
    };
    syncRemaining();
    const timer = window.setInterval(syncRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [step, otpExpiresAt]);

  useEffect(() => {
    if (step === 'otp') {
      const t = window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 180);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  const ensureRecaptchaVerifier = async (
    targetMode: 'invisible' | 'normal' = recaptchaMode
  ): Promise<RecaptchaVerifier> => {
    if (
      recaptchaVerifierRef.current &&
      recaptchaModeRef.current === targetMode &&
      recaptchaWidgetIdRef.current !== null
    ) {
      return recaptchaVerifierRef.current;
    }

    if (recaptchaInitPromiseRef.current && recaptchaModeRef.current === targetMode) {
      return recaptchaInitPromiseRef.current;
    }

    clearRecaptcha();
    recaptchaModeRef.current = targetMode;

    const initWork = (async () => {
      const host = recaptchaHostRef.current;
      if (!host) {
        throw new Error('Verification widget is not ready. Please reload and try again.');
      }

      const widgetContainer = document.createElement('div');
      host.appendChild(widgetContainer);

      const verifier = new RecaptchaVerifier(auth, widgetContainer, {
        size: targetMode,
        callback: () => {
          setErrorInfo((prev) => (prev?.configHint === 'captcha' ? null : prev));
        },
        'expired-callback': () => {
          clearRecaptcha();
          setErrorInfo({
            code: 'auth/captcha-check-failed',
            message: 'reCAPTCHA security check expired. Tap Continue / Resend OTP to verify again.',
            configHint: 'captcha',
          });
        },
        'error-callback': () => {
          clearRecaptcha();
          setErrorInfo({
            code: 'auth/captcha-check-failed',
            message:
              'reCAPTCHA challenge could not complete. Switch to visible verification box or retry.',
            configHint: 'captcha',
          });
        },
      });

      const widgetId = await verifier.render();
      recaptchaVerifierRef.current = verifier;
      recaptchaWidgetIdRef.current = widgetId;
      return verifier;
    })();

    recaptchaInitPromiseRef.current = initWork;
    try {
      return await initWork;
    } catch (err) {
      clearRecaptcha();
      throw err;
    } finally {
      if (recaptchaInitPromiseRef.current === initWork) {
        recaptchaInitPromiseRef.current = null;
      }
    }
  };

  // Pre-warm visible reCAPTCHA automatically if user switches to visible checkbox fallback
  useEffect(() => {
    if (recaptchaMode === 'normal' && step !== 'onboarding') {
      ensureRecaptchaVerifier('normal').catch(() => {});
    }
  }, [recaptchaMode, step]);

  const requestOtpForMobile = async (isResend = false) => {
    setErrorInfo(null);
    setInfoBanner('');

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setErrorInfo({
        message: 'You appear to be offline. Please check your internet connection and try again.',
      });
      return;
    }

    const normalized = normalizeMobileInput(mobile);
    if (normalized !== mobile) {
      setMobile(normalized);
    }

    const e164Phone = toE164IndianMobile(normalized);
    if (!e164Phone) {
      setErrorInfo({
        code: 'auth/invalid-phone-number',
        message: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
      phoneInputRef.current?.focus();
      return;
    }

    setSendingOtp(true);
    try {
      const rateRes = await fetch('/api/auth/otp-rate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: normalized, action: 'check' }),
      });
      const rateData = await rateRes.json().catch(() => ({}));
      if (!rateRes.ok || rateData.allowed === false) {
        if (typeof rateData.retryAfterSeconds === 'number' && rateData.retryAfterSeconds > 0) {
          setCountdown((prev) => Math.max(prev, rateData.retryAfterSeconds));
        }
        setErrorInfo({
          message: rateData.error || 'Too many OTP requests. Please wait a moment before trying again.',
        });
        return;
      }

      if (typeof window !== 'undefined') {
        auth.useDeviceLanguage();
      }

      const appVerifier = await ensureRecaptchaVerifier(recaptchaMode);
      const result = await signInWithPhoneNumber(auth, e164Phone, appVerifier);

      confirmationResultRef.current = result;
      setConfirmationResult(result);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpiresAt(Date.now() + OTP_SESSION_TTL_MS);
      setStep('otp');

      // Consume rate-limit slot ONLY after Firebase accepted & dispatched SMS
      await fetch('/api/auth/otp-rate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: normalized, action: 'record' }),
      }).catch(() => {});

      setCountdown(Number(rateData.cooldownSeconds || 60));
      setInfoBanner(
        isResend
          ? `A new 6-digit OTP has been sent to +91 ${normalized}.`
          : `We sent a 6-digit OTP via SMS to +91 ${normalized}.`
      );
    } catch (err: any) {
      clearRecaptcha();
      const parsed = formatPhoneAuthError(err);
      setErrorInfo(parsed);
      if (parsed.configHint === 'captcha' && recaptchaMode === 'invisible') {
        setRecaptchaMode('normal');
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestOtpForMobile(false);
  };

  const handleDigitChange = (index: number, rawVal: string) => {
    const cleanDigits = rawVal.replace(/\D/g, '');
    setErrorInfo(null);

    if (cleanDigits.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        if (index + i < 6 && cleanDigits[i]) {
          next[index + i] = cleanDigits[i];
        }
      }
      setOtpDigits(next);
      const nextFocus = Math.min(5, index + cleanDigits.length);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = cleanDigits;
    setOtpDigits(next);

    if (cleanDigits && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const next = [...otpDigits];
        next[index - 1] = '';
        setOtpDigits(next);
        otpInputRefs.current[index - 1]?.focus();
      } else {
        const next = [...otpDigits];
        next[index] = '';
        setOtpDigits(next);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtpDigits(next);
    setErrorInfo(null);
    const focusIdx = Math.min(5, pasted.length - 1);
    otpInputRefs.current[focusIdx]?.focus();
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorInfo(null);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setErrorInfo({
        message: 'No internet connection detected. Reconnect and verify your OTP.',
      });
      return;
    }

    const code = otpDigits.join('');
    if (code.length !== 6) {
      setErrorInfo({ message: 'Please enter all 6 digits of the OTP sent to your mobile.' });
      const firstEmpty = otpDigits.findIndex((d) => !d);
      otpInputRefs.current[firstEmpty >= 0 ? firstEmpty : 0]?.focus();
      return;
    }

    const activeConfirmation = confirmationResultRef.current || confirmationResult;
    if (!activeConfirmation || (otpExpiresAt > 0 && Date.now() > otpExpiresAt)) {
      setErrorInfo({
        message: 'Your OTP has expired. Tap Resend OTP to receive a fresh 6-digit verification code.',
      });
      return;
    }

    setVerifyingOtp(true);
    try {
      const guardRes = await fetch('/api/auth/otp-verify-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, action: 'check' }),
      });
      const guardData = await guardRes.json().catch(() => ({}));
      if (!guardRes.ok || guardData.allowed === false) {
        setErrorInfo({
          message: guardData.error || 'Verification temporarily locked. Please try again later.',
        });
        return;
      }

      const credential = await activeConfirmation.confirm(code);
      await fetch('/api/auth/otp-verify-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, action: 'success' }),
      }).catch(() => {});

      const { isNewUser } = await syncPhoneAuthUser(credential.user, defaultRole);
      confirmationResultRef.current = null;
      clearRecaptcha();

      if (isNewUser && !skipOnboardingStep) {
        setErrorInfo(null);
        setInfoBanner('Mobile number verified! Complete your profile to get started.');
        setStep('onboarding');
        return;
      }

      localStorage.setItem(FIRST_VISIT_LOGIN_SEEN_KEY, '1');
      onSuccess?.({ isNewUser });
    } catch (err: any) {
      const failRes = await fetch('/api/auth/otp-verify-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, action: 'fail' }),
      }).catch(() => null);
      const failData = failRes ? await failRes.json().catch(() => ({})) : {};

      if (failRes && failRes.status === 429 && failData?.error) {
        setErrorInfo({ message: failData.error });
      } else {
        const parsed = formatPhoneAuthError(err);
        if (
          err?.code === 'auth/invalid-verification-code' &&
          typeof failData?.remainingAttempts === 'number' &&
          failData.remainingAttempts > 0
        ) {
          parsed.message = `${parsed.message} (${failData.remainingAttempts} attempt${
            failData.remainingAttempts === 1 ? '' : 's'
          } remaining)`;
        }
        setErrorInfo(parsed);
      }
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleOnboardingPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorInfo({ message: 'Please select a valid JPG, PNG, or WebP image file.' });
      return;
    }
    setErrorInfo(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorInfo(null);
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setErrorInfo({ message: 'Please enter your full name (at least 2 characters).' });
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorInfo({ message: 'Please enter a valid email address or leave it blank.' });
      return;
    }

    setSavingOnboarding(true);
    try {
      await completePhoneOnboarding({
        fullName: trimmedName,
        email: trimmedEmail || undefined,
        photoFile,
      });
      localStorage.setItem(FIRST_VISIT_LOGIN_SEEN_KEY, '1');
      onSuccess?.({ isNewUser: true });
    } catch (err: any) {
      setErrorInfo({ message: err?.message || 'Unable to save your profile right now. Please retry.' });
    } finally {
      setSavingOnboarding(false);
    }
  };

  const handleChangeNumber = () => {
    setStep('phone');
    setOtpDigits(['', '', '', '', '', '']);
    confirmationResultRef.current = null;
    setConfirmationResult(null);
    setOtpExpiresAt(0);
    setErrorInfo(null);
    setInfoBanner('');
    clearRecaptcha();
  };

  const cleanMobileDisplay = mobile || profile?.mobile || '';
  const formattedMobilePreview =
    cleanMobileDisplay.length === 10
      ? `+91 ${cleanMobileDisplay.slice(0, 5)} ${cleanMobileDisplay.slice(5)}`
      : `+91 ${cleanMobileDisplay}`;
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isOtpExpired = step === 'otp' && otpExpiresAt > 0 && expirySecondsLeft === 0;
  const expiryMinutes = Math.floor(expirySecondsLeft / 60);
  const expirySeconds = expirySecondsLeft % 60;

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
      {/* CARTZY Branded Header Strip */}
      <div className="bg-gradient-to-br from-[#14213D] via-[#1B2D52] to-[#14213D] px-6 sm:px-8 pt-7 pb-6 text-white relative">
        <div className="flex items-center justify-between gap-3">
          <div className="bg-white rounded-xl px-2.5 py-1.5 shadow-sm inline-flex">
            <CartzyLogo size="sm" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-200 bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FCA311]" />
            {step === 'onboarding' ? 'Verified Customer' : 'OTP Verified'}
          </span>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-widest text-[#FCA311] mt-4">
          Your Local Shopping Marketplace
        </p>

        <h1 className="text-xl sm:text-2xl font-extrabold mt-1 tracking-tight">
          {step === 'phone'
            ? 'Welcome to CARTZY'
            : step === 'otp'
              ? 'Verify Your Mobile OTP'
              : 'Complete Your Profile'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
          {step === 'phone'
            ? subtitle
            : step === 'otp'
              ? `Enter the 6-digit verification code sent to ${formattedMobilePreview}.`
              : 'Add your name and optional photo so sellers & delivery partners can reach you easily.'}
        </p>
      </div>

      {/* Interactive Auth Body */}
      <div className="p-6 sm:p-8 space-y-5">
        <AnimatePresence mode="wait">
          {step === 'phone' && (
            <motion.form
              key="phone-step"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              onSubmit={handlePhoneSubmit}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="cartzy-mobile-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Indian Mobile Number
                </label>
                <div className="flex items-stretch rounded-xl border border-slate-300 focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 bg-white overflow-hidden transition">
                  <div className="flex items-center gap-1.5 px-3.5 bg-slate-50 border-r border-slate-200 text-sm font-bold text-[#14213D] select-none shrink-0">
                    <span aria-hidden="true">🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    ref={phoneInputRef}
                    id="cartzy-mobile-input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={24}
                    placeholder="Enter 10-digit mobile number"
                    value={mobile}
                    onChange={(e) => {
                      setMobile(normalizeMobileInput(e.target.value));
                      setErrorInfo(null);
                    }}
                    disabled={sendingOtp}
                    className="flex-1 min-w-0 px-3.5 py-3 text-base font-mono font-semibold text-[#1F2937] placeholder:font-sans placeholder:font-normal placeholder:text-sm placeholder:text-slate-400 outline-none bg-transparent"
                  />
                  {mobile.length > 0 && (
                    <div className="flex items-center pr-3 text-xs font-mono text-slate-400">
                      {mobile.length}/10
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  New to CARTZY? We&apos;ll help you create your profile right after verification.
                </p>
              </div>

              {unauthorizedHostDetected && !errorInfo && (
                <div
                  role="alert"
                  className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 leading-relaxed"
                >
                  <strong>Domain setup required for OTP:</strong> Add{' '}
                  <code className="font-mono bg-amber-100 px-1 rounded">{unauthorizedHostDetected}</code> under{' '}
                  <strong>Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains</strong>.
                </div>
              )}

              {phoneProviderBlocked && !errorInfo && (
                <div
                  role="status"
                  className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-950 leading-relaxed space-y-1"
                >
                  <p className="font-bold">
                    Firebase Phone Auth unavailable on Starter Tier (without billing)
                  </p>
                  <p>
                    Project <code className="font-mono bg-amber-100 px-1 rounded">jaunty-grail-c01dl</code> reports{' '}
                    <code className="font-mono bg-amber-100 px-1 rounded">
                      {phoneProviderBlocked === 'billing_not_enabled'
                        ? 'BILLING_NOT_ENABLED'
                        : 'OPERATION_NOT_ALLOWED'}
                    </code>
                    . Google AI Studio Starter Tier projects without a Blaze billing account cannot enable Firebase Phone Auth SMS. Please use{' '}
                    <strong>Google Sign-In</strong> or <strong>Email &amp; Password</strong>.
                  </p>
                </div>
              )}

              {errorInfo && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{errorInfo.message}</span>
                  </div>
                  {errorInfo.configHint === 'enable-phone' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      AI Studio Starter Tier projects do not include Cloud Billing, which Firebase Console requires to save Phone Auth settings. Use <strong>Continue with Google</strong> or <strong>Email &amp; Password</strong>, or link Blaze billing + test numbers in Firebase Console.
                    </p>
                  )}
                  {errorInfo.configHint === 'billing' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Firebase requires a <strong>Blaze (Pay-as-you-go)</strong> billing account to activate Phone Auth on this project. Use <strong>Google Sign-In</strong> or <strong>Email &amp; Password</strong> on Starter Tier.
                    </p>
                  )}
                  {errorInfo.configHint === 'quota' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Firebase Setup: Daily SMS quota reached or project SMS cap exceeded. Check <strong>Firebase Console &rarr; Authentication &rarr; Usage</strong>.
                    </p>
                  )}
                  {errorInfo.configHint === 'authorized-domain' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Firebase Setup: Add <code className="font-mono bg-red-100 px-1 rounded">{currentHost}</code> under{' '}
                      <strong>Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains</strong>.
                    </p>
                  )}
                  {errorInfo.configHint === 'captcha' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Complete the reCAPTCHA box below and tap <strong>Continue</strong> again. Ensure third-party cookies / Google reCAPTCHA are not blocked.
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={sendingOtp}
                className="w-full py-3.5 px-5 rounded-xl bg-[#FCA311] hover:bg-amber-500 disabled:opacity-60 text-[#14213D] font-extrabold text-sm shadow-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {sendingOtp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.form>
          )}

          {step === 'otp' && (
            <motion.form
              key="otp-step"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleVerifyOtp}
              className="space-y-4"
            >
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <KeyRound className="w-4 h-4 text-[#2563EB] shrink-0" />
                  <span className="text-xs font-mono font-bold text-[#14213D] truncate">
                    {formattedMobilePreview}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleChangeNumber}
                  disabled={verifyingOtp}
                  className="text-xs font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change
                </button>
              </div>

              {infoBanner && !errorInfo && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{infoBanner}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Enter 6-Digit OTP
                  </label>
                  {otpExpiresAt > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold tabular-nums ${
                        isOtpExpired ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {isOtpExpired
                        ? 'OTP expired'
                        : `Valid for ${expiryMinutes}:${String(expirySeconds).padStart(2, '0')}`}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-2 sm:gap-2.5" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpInputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      aria-label={`OTP digit ${index + 1}`}
                      value={digit}
                      disabled={verifyingOtp || isOtpExpired}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(index, e)}
                      className={`h-12 sm:h-13 w-full text-center text-lg sm:text-xl font-mono font-extrabold rounded-xl border transition outline-none ${
                        digit
                          ? 'border-[#2563EB] bg-blue-50/40 text-[#14213D]'
                          : 'border-slate-300 bg-white text-[#1F2937]'
                      } focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:bg-slate-100 disabled:text-slate-400`}
                    />
                  ))}
                </div>
              </div>

              {(errorInfo || isOtpExpired) && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">
                      {errorInfo?.message || 'This OTP has expired. Tap Resend OTP below to get a fresh code.'}
                    </span>
                  </div>
                  {errorInfo?.configHint === 'enable-phone' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Firebase Setup: Enable <strong>Phone</strong> in Sign-in method and allow <strong>+91</strong> in SMS region policy.
                    </p>
                  )}
                  {errorInfo?.configHint === 'billing' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Firebase Setup: Link a <strong>Blaze</strong> billing account for live SMS OTP delivery.
                    </p>
                  )}
                  {errorInfo?.configHint === 'authorized-domain' && (
                    <p className="text-[11px] text-red-700 pl-6 leading-relaxed">
                      Firebase Setup: Authorize <code className="font-mono bg-red-100 px-1 rounded">{currentHost}</code> in Firebase Console.
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingOtp || isOtpExpired}
                className="w-full py-3.5 px-5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] disabled:opacity-60 text-white font-extrabold text-sm shadow-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {verifyingOtp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Didn&apos;t receive the SMS?</span>
                {countdown > 0 ? (
                  <span className="font-mono font-semibold text-slate-500 tabular-nums">
                    Resend in 00:{String(countdown).padStart(2, '0')}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={sendingOtp || verifyingOtp}
                    onClick={() => requestOtpForMobile(true)}
                    className="font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sendingOtp ? 'animate-spin' : ''}`} />
                    {sendingOtp ? 'Sending...' : 'Resend OTP'}
                  </button>
                )}
              </div>
            </motion.form>
          )}

          {step === 'onboarding' && (
            <motion.form
              key="onboarding-step"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleOnboardingSubmit}
              className="space-y-4"
            >
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-mono font-bold truncate">{formattedMobilePreview}</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 shrink-0">Verified</span>
              </div>

              {/* Optional Profile Photo Upload */}
              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-[#14213D] text-[#FCA311] font-extrabold text-xl flex items-center justify-center overflow-hidden border border-slate-300">
                    {photoPreviewUrl ? (
                      <img
                        src={photoPreviewUrl}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>
                        {fullName.trim()
                          ? fullName
                              .trim()
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((w) => w[0]?.toUpperCase() || '')
                              .join('')
                          : 'CZ'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={savingOnboarding}
                    aria-label="Choose profile photo"
                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white flex items-center justify-center shadow cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleOnboardingPhotoSelect}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#14213D]">Profile Photo (Optional)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    JPG, PNG, or WebP · Compressed safely
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
                    >
                      {photoPreviewUrl ? 'Change Photo' : 'Upload Photo'}
                    </button>
                    {photoPreviewUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setPhotoPreviewUrl('');
                          setPhotoFile(null);
                        }}
                        className="text-xs font-semibold text-red-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="cartzy-onboarding-name"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="cartzy-onboarding-name"
                    required
                    autoFocus
                    maxLength={100}
                    autoComplete="name"
                    placeholder="e.g. Sai Kiran Reddy"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setErrorInfo(null);
                    }}
                    disabled={savingOnboarding}
                    className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="cartzy-onboarding-email"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Email Address <span className="font-normal normal-case text-slate-400">(Optional)</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="cartzy-onboarding-email"
                    type="email"
                    maxLength={160}
                    autoComplete="email"
                    placeholder="you@example.com (for GST invoices)"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorInfo(null);
                    }}
                    disabled={savingOnboarding}
                    className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              </div>

              {errorInfo && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{errorInfo.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingOnboarding}
                className="w-full py-3.5 px-5 rounded-xl bg-[#FCA311] hover:bg-amber-500 disabled:opacity-60 text-[#14213D] font-extrabold text-sm shadow-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {savingOnboarding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Your Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Save &amp; Start Shopping</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Dedicated reCAPTCHA mount host (visible when interactive fallback is needed) */}
        <div className={recaptchaMode === 'normal' ? 'flex flex-col items-center pt-1' : ''}>
          <div id="cartzy-recaptcha-container" ref={recaptchaHostRef} />
        </div>

        {step !== 'onboarding' && secondaryAuthSlot && (
          <div className="pt-4 border-t border-slate-100 space-y-3">{secondaryAuthSlot}</div>
        )}

        {step !== 'onboarding' && showSkipGuest && onSkipGuest && (
          <div className="pt-3 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={onSkipGuest}
              className="text-xs font-semibold text-slate-600 hover:text-[#14213D] hover:underline cursor-pointer"
            >
              Browse CARTZY storefront as guest &rarr;
            </button>
          </div>
        )}

        <p className="text-[11px] text-center text-slate-400 leading-relaxed">
          By continuing, you agree to CARTZY&apos;s{' '}
          <Link to="/legal/terms" className="text-[#2563EB] font-semibold hover:underline">
            Terms of Service
          </Link>{' '}
          &amp;{' '}
          <Link to="/legal/privacy" className="text-[#2563EB] font-semibold hover:underline">
            Privacy Policy
          </Link>
          . Protected by Firebase Authentication &amp; reCAPTCHA.
        </p>
      </div>
    </div>
  );
};
