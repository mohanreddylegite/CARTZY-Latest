import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Lock,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_STORE_SETTINGS,
  fetchActiveCategories,
  fetchStoreSettings,
  getServerConfigStatus,
} from '../services/storeService';
import {
  fetchMySellerProfile,
  submitSellerApplication,
  updateMySellerProfile,
  uploadSellerFile,
} from '../services/marketplaceService';
import {
  INDIAN_STATES,
  isValidIndianMobile,
  isValidIndianPincode,
} from '../services/indianValidation';
import { getBrowserMapsApiKey, ParsedGoogleAddress } from '../services/mapsAddressParser';
import { DEFAULT_VIJAYAWADA_ZONES } from '../data/vijayawadaDefaults';
import {
  Category,
  SellerProfile,
  SellerVerificationDoc,
  ServerConfigStatus,
  StoreSettings,
} from '../types';
import { DeliveryLocationPicker } from '../components/maps/DeliveryLocationPicker';
import { MobileOtpLogin } from '../components/auth/MobileOtpLogin';
import { BUSINESS_CONFIG } from '../config/businessConfig';

const SHOP_CATEGORIES = [
  'Groceries',
  'Fashion',
  'Electronics',
  'Home & Kitchen',
  'Beauty & Personal Care',
  'Footwear',
  'Accessories',
  'Mobile Accessories',
  'Sports & Fitness',
  'Books & Stationery',
  'Other',
];

const DOC_TYPES: SellerVerificationDoc['docType'][] = [
  'PAN Card',
  'Shop Act / Trade License',
  'GST Certificate',
  'FSSAI License',
  'Aadhaar / ID Proof',
  'Bank Proof',
  'Other',
];

export const SellerRegisterPage: React.FC = () => {
  const { user, profile, registerSeller, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<SellerProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingRejected, setEditingRejected] = useState(false);

  // Account auth mode for unauthenticated visitors
  const [authMethod, setAuthMethod] = useState<'email' | 'otp'>('email');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    businessName: '',
    ownerName: profile?.fullName || '',
    email: profile?.email || user?.email || '',
    mobile: profile?.mobile || '',
    shopCategory: 'Groceries',
    shopPhone: '',
    description: '',
    logoUrl: '',
    coverImageUrl: '',
    gstin: '',
    houseNo: '',
    street: '',
    locality: 'Bhavanipuram',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    pincode: '520012',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    payoutUpiOrBank: '',
    serviceZones: DEFAULT_VIJAYAWADA_ZONES.map((z) => z.id),
    openTime: '08:00',
    closeTime: '22:00',
  });

  const [verificationDocs, setVerificationDocs] = useState<SellerVerificationDoc[]>([]);
  const [pendingDocType, setPendingDocType] = useState<SellerVerificationDoc['docType']>('PAN Card');
  const [pendingDocUrl, setPendingDocUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      fetchActiveCategories().catch(() => []),
      fetchStoreSettings(),
      getServerConfigStatus(),
      user ? fetchMySellerProfile(user.uid) : Promise.resolve(null),
    ])
      .then(([cats, st, cfg, seller]) => {
        setCategories(cats);
        setSettings(st);
        setServerConfig(cfg);
        setExisting(seller);
        if (seller) {
          setForm({
            businessName: seller.businessName,
            ownerName: seller.ownerName,
            email: seller.email,
            mobile: seller.mobile,
            shopCategory: seller.shopCategory || 'Groceries',
            shopPhone: seller.shopPhone || '',
            description: seller.description || '',
            logoUrl: seller.logoUrl || '',
            coverImageUrl: seller.coverImageUrl || '',
            gstin: seller.gstin || '',
            houseNo: seller.pickupAddress.houseNo,
            street: seller.pickupAddress.street,
            locality: seller.pickupAddress.locality,
            city: seller.pickupAddress.city,
            state: seller.pickupAddress.state,
            pincode: seller.pickupAddress.pincode,
            lat: seller.pickupAddress.lat,
            lng: seller.pickupAddress.lng,
            payoutUpiOrBank: seller.payoutUpiOrBank || '',
            serviceZones:
              seller.serviceZones && seller.serviceZones.length > 0
                ? seller.serviceZones
                : DEFAULT_VIJAYAWADA_ZONES.map((z) => z.id),
            openTime: seller.operatingHours?.openTime || '08:00',
            closeTime: seller.operatingHours?.closeTime || '22:00',
          });
          setVerificationDocs(seller.verificationDocs || []);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (profile && !existing) {
      setForm((prev) => ({
        ...prev,
        ownerName: prev.ownerName || profile.fullName || '',
        email: prev.email || profile.email || user?.email || '',
        mobile: prev.mobile || profile.mobile || '',
      }));
    }
  }, [profile, user?.email, existing]);

  const categoryOptions = Array.from(
    new Set([...categories.map((c) => c.name), ...SHOP_CATEGORIES])
  );

  const handleMapConfirm = (resolved: ParsedGoogleAddress) => {
    setForm((prev) => ({
      ...prev,
      houseNo: resolved.houseNo || prev.houseNo,
      street: resolved.street || prev.street,
      locality: resolved.locality || prev.locality,
      city: resolved.city || prev.city,
      state: INDIAN_STATES.includes(resolved.state) ? resolved.state : prev.state,
      pincode: resolved.pincode || prev.pincode,
      lat: resolved.lat,
      lng: resolved.lng,
    }));
  };

  const handleMediaUpload = async (
    folder: 'logos' | 'covers' | 'docs',
    file?: File | null
  ) => {
    if (!file) return;
    setError('');
    setNotice('');
    if (!user) {
      setError('Complete account verification (Mobile OTP or create account first) before uploading files to storage, or paste an image/document URL below.');
      return;
    }
    setUploadingMedia(folder);
    try {
      const url = await uploadSellerFile({ uid: user.uid, folder, file });
      if (folder === 'logos') {
        setForm((prev) => ({ ...prev, logoUrl: url }));
        setNotice('Shop logo uploaded.');
      } else if (folder === 'covers') {
        setForm((prev) => ({ ...prev, coverImageUrl: url }));
        setNotice('Shop cover banner uploaded.');
      } else {
        setVerificationDocs((prev) =>
          [
            ...prev,
            {
              docType: pendingDocType,
              label: file.name.slice(0, 80),
              url,
              uploadedAt: new Date().toISOString(),
            },
          ].slice(0, 8)
        );
        setNotice(`${pendingDocType} document attached.`);
      }
    } catch (err: any) {
      setError(err?.message || 'File upload failed.');
    } finally {
      setUploadingMedia(null);
    }
  };

  const handleAddDocUrl = () => {
    const cleanUrl = pendingDocUrl.trim();
    if (!cleanUrl) return;
    if (!/^https?:\/\//i.test(cleanUrl)) {
      setError('Document URL must start with https:// or http://');
      return;
    }
    setVerificationDocs((prev) =>
      [
        ...prev,
        {
          docType: pendingDocType,
          label: `${pendingDocType} Link`,
          url: cleanUrl,
          uploadedAt: new Date().toISOString(),
        },
      ].slice(0, 8)
    );
    setPendingDocUrl('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (form.businessName.trim().length < 2) {
      setError('Enter your store or business name.');
      return;
    }
    if (form.ownerName.trim().length < 2) {
      setError('Enter the owner or authorised representative full legal name.');
      return;
    }
    if (!isValidIndianMobile(form.mobile)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (form.shopPhone.trim() && !isValidIndianMobile(form.shopPhone.trim())) {
      setError('Shop contact phone must be a valid 10-digit Indian mobile number.');
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Enter a valid business email address.');
      return;
    }
    if (!isValidIndianPincode(form.pincode)) {
      setError('Enter a valid 6-digit Indian pickup PIN code.');
      return;
    }
    if (!form.houseNo.trim() || !form.street.trim() || !form.locality.trim() || !form.city.trim()) {
      setError('Complete all pickup warehouse/store address fields.');
      return;
    }

    setSubmitting(true);
    try {
      let targetUid = user?.uid;

      if (!targetUid) {
        if (authMethod === 'otp') {
          setError('Please verify your mobile number via 6-digit OTP above before submitting your shop application.');
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setError('Create a seller account password of at least 6 characters.');
          setSubmitting(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Password and Confirm Password do not match.');
          setSubmitting(false);
          return;
        }
        const newUser = await registerSeller({
          fullName: form.ownerName,
          email: form.email,
          mobile: form.mobile,
          password,
        });
        targetUid = newUser.uid;
      }

      const payloadInput = {
        businessName: form.businessName,
        ownerName: form.ownerName,
        email: form.email,
        mobile: form.mobile,
        shopCategory: form.shopCategory,
        shopPhone: form.shopPhone.trim() || form.mobile,
        description: form.description,
        logoUrl: form.logoUrl,
        coverImageUrl: form.coverImageUrl,
        verificationDocs,
        gstin: form.gstin,
        cityId: 'vijayawada',
        serviceZones:
          form.serviceZones.length > 0
            ? form.serviceZones
            : [DEFAULT_VIJAYAWADA_ZONES[0].id],
        operatingHours: {
          openTime: form.openTime || '08:00',
          closeTime: form.closeTime || '22:00',
          daysOpen: [0, 1, 2, 3, 4, 5, 6],
          is24x7: false,
          temporarilyClosed: false,
        },
        pickupAddress: {
          houseNo: form.houseNo.trim(),
          street: form.street.trim(),
          locality: form.locality.trim(),
          city: form.city.trim(),
          state: form.state,
          pincode: form.pincode.trim(),
          ...(typeof form.lat === 'number' ? { lat: form.lat } : {}),
          ...(typeof form.lng === 'number' ? { lng: form.lng } : {}),
        },
        payoutUpiOrBank: form.payoutUpiOrBank,
      };

      if (existing && existing.approvalStatus === 'Rejected' && editingRejected) {
        await updateMySellerProfile(targetUid, {
          ...payloadInput,
          resubmitRejected: true,
        });
        const updated = await fetchMySellerProfile(targetUid);
        setExisting(updated);
        setEditingRejected(false);
        setNotice('Updated shop details resubmitted to CARTZY Admin for verification.');
      } else {
        const created = await submitSellerApplication(
          targetUid,
          payloadInput,
          settings.defaultSellerCommissionPercent
        );
        setExisting(created);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to submit seller registration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Checking seller status...</div>;
  }

  if (existing && !(existing.approvalStatus === 'Rejected' && editingRejected)) {
    const statusCopy: Record<SellerProfile['approvalStatus'], { headline: string; note: string }> = {
      Pending: {
        headline: 'Application Submitted — Pending Review',
        note: 'Your application is queued for verification. Once CARTZY Admin verifies your shop details, you can publish products and fulfill customer orders.',
      },
      'Under Review': {
        headline: 'Verification Under Review',
        note: 'Our onboarding team is actively reviewing your Vijayawada shop address and verification documents.',
      },
      Approved: {
        headline: 'Store Verified & Approved',
        note: `Your store is approved with a ${existing.commissionPercent}% platform commission. Open your Seller Dashboard to publish products and process customer orders.`,
      },
      Rejected: {
        headline: 'Application Needs Updates (Rejected)',
        note: existing.rejectionReason
          ? `Admin feedback: ${existing.rejectionReason}`
          : 'Your seller application was returned by Admin. Update your shop or KYC details and resubmit.',
      },
      Suspended: {
        headline: 'Seller Account Suspended',
        note: existing.rejectionReason
          ? `Reason: ${existing.rejectionReason}. Contact ${BUSINESS_CONFIG.supportEmail} for appeal.`
          : `Your seller store is currently suspended. Contact ${BUSINESS_CONFIG.supportEmail} for assistance.`,
      },
    };

    const currentCopy = statusCopy[existing.approvalStatus];

    return (
      <div className="max-w-xl mx-auto px-4 py-12 pb-24">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
          {existing.approvalStatus === 'Approved' ? (
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          ) : existing.approvalStatus === 'Suspended' || existing.approvalStatus === 'Rejected' ? (
            <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
          ) : (
            <Clock className="w-12 h-12 text-[#FCA311] mx-auto" />
          )}

          {existing.logoUrl && (
            <img
              src={existing.logoUrl}
              alt={existing.businessName}
              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 mx-auto"
            />
          )}

          <h1 className="text-2xl font-extrabold text-[#14213D]">{existing.businessName}</h1>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Status:{' '}
            <span
              className={
                existing.approvalStatus === 'Approved'
                  ? 'text-emerald-700'
                  : existing.approvalStatus === 'Rejected' || existing.approvalStatus === 'Suspended'
                  ? 'text-red-700'
                  : 'text-amber-700'
              }
            >
              {existing.approvalStatus}
            </span>
          </p>
          <p className="text-sm font-semibold text-[#14213D]">{currentCopy.headline}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{currentCopy.note}</p>

          <div className="pt-3 flex flex-wrap justify-center gap-3">
            {existing.approvalStatus === 'Rejected' && (
              <button
                type="button"
                onClick={() => setEditingRejected(true)}
                className="px-5 py-2.5 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Edit &amp; Resubmit Application
              </button>
            )}
            <Link
              to="/seller"
              className="px-5 py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold"
            >
              Go to Seller Dashboard
            </Link>
            <Link
              to="/"
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
            >
              Back to Store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 pb-24">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#14213D] text-[#FCA311] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#14213D]">
                {editingRejected ? 'Revise & Resubmit Shop Application' : 'Register as a CARTZY Seller'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Vijayawada Local Marketplace · Default platform commission:{' '}
                <strong className="text-[#14213D] font-mono tabular-nums">
                  {settings.defaultSellerCommissionPercent}%
                </strong>
              </p>
            </div>
          </div>
          <Link
            to="/seller/login"
            className="text-xs font-bold text-[#2563EB] hover:underline shrink-0"
          >
            Already a seller? Seller Login &rarr;
          </Link>
        </div>

        {user && profile?.role === 'customer' && !existing && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
            <div>
              <strong>Signed in with Customer Account ({profile.email || profile.mobile}):</strong>{' '}
              To keep your Customer and Seller accounts completely separate, you can sign out and register a dedicated Seller email/mobile login.
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Switch Account
            </button>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {notice}
          </div>
        )}

        {/* Account Authentication section for unauthenticated applicants */}
        {!user && (
          <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-[#14213D]">
                  Step 1: Seller Account Authentication
                </h2>
                <p className="text-xs text-slate-500">
                  Create a separate seller login using Email + Password, or verify your +91 mobile via real SMS OTP.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAuthMethod('email')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    authMethod === 'email' ? 'bg-[#14213D] text-white' : 'text-slate-600'
                  }`}
                >
                  Email + Password
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod('otp')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer ${
                    authMethod === 'otp' ? 'bg-[#14213D] text-white' : 'text-slate-600'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Mobile OTP
                </button>
              </div>
            </div>

            {authMethod === 'otp' && (
              <div className="pt-1">
                <MobileOtpLogin
                  defaultRole="seller"
                  skipOnboardingStep
                  subtitle="Verify your 10-digit seller mobile number with real Firebase 6-digit OTP, then complete shop registration below."
                  onSuccess={() => {
                    setNotice('Mobile number verified! Now complete your shop registration below.');
                  }}
                />
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Owner & Business Identity */}
          <div className="space-y-4">
            <h2 className="text-sm font-extrabold text-[#14213D]">
              Shop &amp; Owner Details
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Shop / Business Name *
                </label>
                <input
                  required
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  placeholder="e.g. Sri Lakshmi Supermart"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Owner&apos;s Full Legal Name *
                </label>
                <input
                  required
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  placeholder="Full Name"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Primary Shop Category *
                </label>
                <select
                  value={form.shopCategory}
                  onChange={(e) => setForm({ ...form, shopCategory: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Owner Mobile (+91 10 digits) *
                </label>
                <input
                  required
                  maxLength={10}
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                  placeholder="9876543210"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Shop Contact Phone (Optional)
                </label>
                <input
                  maxLength={10}
                  value={form.shopPhone}
                  onChange={(e) => setForm({ ...form, shopPhone: e.target.value.replace(/\D/g, '') })}
                  placeholder="Store counter phone"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Business Email Address *
                </label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="merchant@shop.in"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  GSTIN (Optional — not mandatory unless legally required)
                </label>
                <input
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  placeholder="37ABCDE1234F1Z5 (leave blank if exempt)"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase"
                />
              </div>
            </div>

            {!user && authMethod === 'email' && (
              <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-[#14213D] mb-1">
                    Seller Password * (min 6 chars)
                  </label>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create seller password"
                      className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#14213D] mb-1">
                    Confirm Seller Password *
                  </label>
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">
                Business Description
              </label>
              <textarea
                rows={3}
                maxLength={1500}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Tell Vijayawada shoppers what your shop sells, specialties, freshness guarantees, etc."
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Shop Logo & Cover Branding */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h2 className="text-sm font-extrabold text-[#14213D] flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-[#2563EB]" />
              Shop Logo &amp; Cover Banner
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#14213D]">Shop Logo</span>
                  {form.logoUrl && (
                    <img
                      src={form.logoUrl}
                      alt="Shop logo preview"
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                    />
                  )}
                </div>
                <input
                  placeholder="Logo Image URL (https://...)"
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-[#14213D] hover:bg-slate-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingMedia === 'logos' ? 'Uploading...' : 'Upload Logo File'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMediaUpload('logos', e.target.files?.[0])}
                  />
                </label>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#14213D]">Shop Cover Banner</span>
                  {form.coverImageUrl && (
                    <img
                      src={form.coverImageUrl}
                      alt="Shop cover preview"
                      className="w-16 h-10 rounded-lg object-cover border border-slate-200"
                    />
                  )}
                </div>
                <input
                  placeholder="Cover Banner URL (https://...)"
                  value={form.coverImageUrl}
                  onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-[#14213D] hover:bg-slate-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingMedia === 'covers' ? 'Uploading...' : 'Upload Cover File'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleMediaUpload('covers', e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Complete Shop Address + Google Maps Pin */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#14213D]">
                Complete Shop Address &amp; Google Maps Location
              </h2>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#FCA311]/15 border border-[#FCA311] text-[#14213D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#14213D]" />
                Pin Shop Location on Google Maps
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <input
                required
                placeholder="Building / Shop / Unit No. *"
                value={form.houseNo}
                onChange={(e) => setForm({ ...form, houseNo: e.target.value })}
                className="border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
              <input
                required
                placeholder="Street / Main Road *"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                className="border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
              <input
                required
                placeholder="Locality / Area (e.g. Bhavanipuram, Benz Circle) *"
                value={form.locality}
                onChange={(e) => setForm({ ...form, locality: e.target.value })}
                className="border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
              <input
                required
                placeholder="City *"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
              >
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <input
                required
                maxLength={6}
                placeholder="6-digit PIN Code *"
                value={form.pincode}
                onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '') })}
                className="border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
              />
            </div>

            {typeof form.lat === 'number' && typeof form.lng === 'number' && (
              <p className="text-xs font-mono text-emerald-700">
                Shop GPS Coordinates pinned: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
              </p>
            )}
          </div>

          {/* Private Business Verification Documents */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#14213D] flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#2563EB]" />
                Private Business Verification Documents (KYC)
              </h2>
              <span className="text-[11px] font-medium text-slate-500">
                Stored privately — visible only to you and CARTZY Admin
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] space-y-3">
              <div className="grid sm:grid-cols-3 gap-2.5 items-center">
                <select
                  value={pendingDocType}
                  onChange={(e) =>
                    setPendingDocType(e.target.value as SellerVerificationDoc['docType'])
                  }
                  className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-[#14213D] hover:bg-slate-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingMedia === 'docs' ? 'Uploading...' : 'Upload PDF / Image'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleMediaUpload('docs', e.target.files?.[0])}
                    />
                  </label>
                  <input
                    placeholder="Or paste verified document URL (https://...)"
                    value={pendingDocUrl}
                    onChange={(e) => setPendingDocUrl(e.target.value)}
                    className="flex-1 min-w-[180px] border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddDocUrl}
                    className="px-3 py-2 rounded-xl bg-[#14213D] text-white text-xs font-bold cursor-pointer"
                  >
                    Attach
                  </button>
                </div>
              </div>

              {verificationDocs.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {verificationDocs.map((d, idx) => (
                    <li
                      key={`${d.docType}_${idx}`}
                      className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2"
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                        <strong className="text-[#14213D] shrink-0">{d.docType}:</strong>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2563EB] truncate hover:underline"
                        >
                          {d.label}
                        </a>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setVerificationDocs((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Remove document"
                        className="text-red-600 hover:text-red-800 p-1 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  Attach PAN, Shop Act / Trade License, FSSAI (for groceries), or optional GST Certificate to speed up approval.
                </p>
              )}
            </div>
          </div>

          {/* Vijayawada Delivery Zones & Opening Hours */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h2 className="text-sm font-extrabold text-[#14213D]">
              Vijayawada Service Zones, Opening Hours &amp; Payout Details
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {DEFAULT_VIJAYAWADA_ZONES.map((z) => {
                const checked = form.serviceZones.includes(z.id);
                return (
                  <label
                    key={z.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer ${
                      checked
                        ? 'border-[#2563EB] bg-blue-50/50 font-semibold text-[#14213D]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          serviceZones: e.target.checked
                            ? [...prev.serviceZones, z.id]
                            : prev.serviceZones.filter((id) => id !== z.id),
                        }));
                      }}
                    />
                    <span>{z.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">Opens At (IST)</label>
                <input
                  type="time"
                  value={form.openTime}
                  onChange={(e) => setForm({ ...form, openTime: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">Closes At (IST)</label>
                <input
                  type="time"
                  value={form.closeTime}
                  onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">
                  Settlement Payout UPI / Bank Ref
                </label>
                <input
                  value={form.payoutUpiOrBank}
                  onChange={(e) => setForm({ ...form, payoutUpiOrBank: e.target.value })}
                  placeholder="shopname@okhdfcbank"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {editingRejected && (
              <button
                type="button"
                onClick={() => setEditingRejected(false)}
                className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white font-bold text-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              {submitting
                ? 'Submitting Seller Application...'
                : editingRejected
                ? 'Resubmit Application for Review'
                : 'Submit Seller Registration'}
            </button>
          </div>
        </form>
      </div>

      <DeliveryLocationPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        apiKey={getBrowserMapsApiKey(serverConfig?.googleMapsApiKey)}
        initialLocation={
          typeof form.lat === 'number' && typeof form.lng === 'number'
            ? { lat: form.lat, lng: form.lng }
            : null
        }
        onConfirm={handleMapConfirm}
      />
    </div>
  );
};
