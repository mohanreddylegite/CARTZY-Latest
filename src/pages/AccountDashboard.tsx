import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
  AlertCircle,
  Award,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Heart,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Minus,
  Navigation,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  Truck,
  User,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { DEFAULT_PRIVACY_SETTINGS, useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { getCartItemKey, useCart } from '../contexts/CartContext';
import { useLocationService } from '../contexts/LocationContext';
import {
  DEFAULT_STORE_SETTINGS,
  fetchActiveCoupons,
  fetchOrCreateRewardAccount,
  fetchProductsByIds,
  fetchStoreSettings,
  fetchUserSupportTickets,
  getServerConfigStatus,
  saveSupportTicket,
} from '../services/storeService';
import {
  INDIAN_STATES,
  formatINR,
  isValidIndianMobile,
  isValidIndianPincode,
} from '../services/indianValidation';
import { evaluateLocationServiceability } from '../services/serviceabilityService';
import { getBrowserMapsApiKey, ParsedGoogleAddress } from '../services/mapsAddressParser';
import {
  Address,
  Coupon,
  PrivacySettings,
  Product,
  RewardAccount,
  ServerConfigStatus,
  StoreSettings,
  SupportTicket,
} from '../types';
import { SafeImage } from '../components/common/SafeImage';
import { DeliveryLocationPicker } from '../components/maps/DeliveryLocationPicker';
import { CustomerOrdersPanel } from './MyOrdersPage';

export const AccountDashboard: React.FC = () => {
  const {
    user,
    profile,
    isAdmin,
    logout,
    updateCustomerProfile,
    updateCustomerEmail,
    changePassword,
    uploadProfilePhoto,
    removeProfilePhoto,
    resendVerification,
    deleteCustomerAccount,
  } = useAuth();
  const {
    items: cartItems,
    totalCount: cartCount,
    subtotal: cartSubtotal,
    wishlistIds,
    toggleWishlist,
    addToCart,
    updateQuantity,
    removeFromCart,
    showToast,
  } = useCart();
  const { dataset, updateCustomerLocation, customerLocation, checkProductDeliverable } =
    useLocationService();

  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'profile';
  const welcomeBanner = params.get('welcome') === '1';

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState('');
  const [photoError, setPhotoError] = useState('');

  // Profile fields
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [mobile, setMobile] = useState(profile?.mobile || '');
  const [emailInput, setEmailInput] = useState(profile?.email || user?.email || '');
  const [defaultPincode, setDefaultPincode] = useState(profile?.defaultPincode || '');
  const [emailReauthPassword, setEmailReauthPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [profileError, setProfileError] = useState('');

  // Change / Link Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Wishlist, Addresses, Notifications, Support
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [wishProductsMap, setWishProductsMap] = useState<Map<string, Product>>(new Map());
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  const [newAddr, setNewAddr] = useState<{
    label: 'Home' | 'Work' | 'Other';
    fullName: string;
    mobile: string;
    houseNo: string;
    street: string;
    locality: string;
    landmark: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
    lat?: number;
    lng?: number;
    placeId?: string;
    formattedAddress?: string;
  }>({
    label: 'Home',
    fullName: profile?.fullName || '',
    mobile: profile?.mobile || '',
    houseNo: '',
    street: '',
    locality: '',
    landmark: '',
    city: '',
    district: '',
    state: 'Andhra Pradesh',
    pincode: '',
  });
  const [addrError, setAddrError] = useState('');
  const [addrSuccess, setAddrSuccess] = useState('');

  const [supportForm, setSupportForm] = useState({ topic: 'Order Inquiry', orderNumber: '', message: '' });
  const [supportStatus, setSupportStatus] = useState('');

  // Rewards, Coupons & Account Deletion
  const [rewardAccount, setRewardAccount] = useState<RewardAccount | null>(null);
  const [activeCoupons, setActiveCoupons] = useState<Coupon[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Privacy Settings state
  const [privacyPrefs, setPrivacyPrefs] = useState<PrivacySettings>(
    profile?.privacySettings || DEFAULT_PRIVACY_SETTINGS
  );
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState('');
  const [privacyError, setPrivacyError] = useState('');
  const [addressCheckRequested, setAddressCheckRequested] = useState(false);

  useEffect(() => {
    getServerConfigStatus().then(setServerConfig);
    fetchStoreSettings().then(setStoreSettings);
    fetchActiveCoupons().then(setActiveCoupons);
  }, []);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '');
      setMobile(profile.mobile || '');
      setEmailInput(profile.email || user?.email || '');
      setDefaultPincode(profile.defaultPincode || '');
      if (profile.privacySettings) {
        setPrivacyPrefs({ ...DEFAULT_PRIVACY_SETTINGS, ...profile.privacySettings });
      }
      setNewAddr((prev) => ({
        ...prev,
        fullName: prev.fullName || profile.fullName || '',
        mobile: prev.mobile || profile.mobile || '',
      }));
    }
  }, [profile, user?.email]);

  const loadAccountData = async () => {
    if (!user) return;
    try {
      const [addrSnap, ticketList, reward] = await Promise.all([
        getDocs(query(collection(db, 'addresses'), where('userId', '==', user.uid))),
        fetchUserSupportTickets(user.uid),
        fetchOrCreateRewardAccount(user.uid, profile?.referralCode).catch(() => null),
      ]);
      setAddresses(addrSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Address)));
      setSupportTickets(ticketList);
      if (reward) setRewardAccount(reward);
    } catch (error) {
      console.error('Failed loading account data:', error);
    }
  };

  useEffect(() => {
    loadAccountData();
  }, [user]);

  useEffect(() => {
    if (wishlistIds.length === 0) {
      setWishProductsMap(new Map());
      return;
    }
    let cancelled = false;
    fetchProductsByIds(wishlistIds).then((map) => {
      if (!cancelled) setWishProductsMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [wishlistIds]);

  const hasPasswordProvider = Boolean(
    user?.providerData.some((p) => p.providerId === 'password')
  );
  const avatarSrc = profile?.photoUrl || user?.photoURL || '';
  const initials = (profile?.fullName || user?.displayName || 'C')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setPhotoStatus('');
    setUploadingPhoto(true);
    try {
      await uploadProfilePhoto(file);
      setPhotoStatus('Profile photo updated.');
    } catch (err: any) {
      setPhotoError(err?.message || 'Unable to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusNote('');
    setProfileError('');

    if (!fullName.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    if (mobile && !isValidIndianMobile(mobile)) {
      setProfileError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (defaultPincode && !isValidIndianPincode(defaultPincode)) {
      setProfileError('Default PIN code must be a valid 6-digit Indian PIN.');
      return;
    }
    const cleanEmail = emailInput.trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setProfileError('Enter a valid email address.');
      return;
    }

    setSavingProfile(true);
    try {
      let emailNotice = '';
      if (cleanEmail && cleanEmail !== (profile?.email || user?.email || '')) {
        const res = await updateCustomerEmail(cleanEmail, emailReauthPassword || undefined);
        setEmailReauthPassword('');
        emailNotice = res.verificationSent
          ? ' Verification email sent to your new address — click the link to confirm.'
          : '';
      }

      await updateCustomerProfile({
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        onboardingCompleted: true,
        ...(cleanEmail && !user?.email ? { email: cleanEmail } : {}),
        ...(defaultPincode ? { defaultPincode: defaultPincode.trim() } : {}),
      });
      if (defaultPincode.trim()) {
        localStorage.setItem('cartzy_pincode', defaultPincode.trim());
      }
      setStatusNote(`Profile updated successfully.${emailNotice}`);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/requires-recent-login') {
        setProfileError(
          'To change your login email, please enter your current password below or sign in again first.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setProfileError('Current password entered for email change is incorrect.');
      } else if (code === 'auth/email-already-in-use') {
        setProfileError('That email address is already linked to another account.');
      } else {
        setProfileError(err?.message || 'Could not update profile.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus('');
    setPasswordError('');

    if (hasPasswordProvider && !currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const outcome = await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus(
        outcome === 'linked'
          ? 'Password set! You can now sign in with Email & Password too.'
          : 'Password updated securely.'
      );
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError('Current password is incorrect.');
      } else if (code === 'auth/weak-password') {
        setPasswordError('Please choose a stronger password (min 6 characters).');
      } else if (code === 'auth/requires-recent-login') {
        setPasswordError('For security, please log out and sign in again before changing your password.');
      } else {
        setPasswordError(err?.message || 'Failed to update password.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const resetAddressForm = () => {
    setEditingAddress(null);
    setNewAddr({
      label: 'Home',
      fullName: profile?.fullName || '',
      mobile: profile?.mobile || '',
      houseNo: '',
      street: '',
      locality: '',
      landmark: '',
      city: '',
      district: '',
      state: 'Andhra Pradesh',
      pincode: '',
    });
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAddrError('');
    setAddrSuccess('');
    if (
      !newAddr.fullName.trim() ||
      !newAddr.houseNo.trim() ||
      !newAddr.street.trim() ||
      !newAddr.locality.trim() ||
      !newAddr.city.trim() ||
      !newAddr.district.trim()
    ) {
      setAddrError('Please fill in all required address fields.');
      return;
    }
    if (!isValidIndianMobile(newAddr.mobile)) {
      setAddrError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!isValidIndianPincode(newAddr.pincode)) {
      setAddrError('Enter a valid 6-digit Indian PIN code.');
      return;
    }

    const hasCoords =
      typeof newAddr.lat === 'number' &&
      !Number.isNaN(newAddr.lat) &&
      typeof newAddr.lng === 'number' &&
      !Number.isNaN(newAddr.lng);

    if (
      hasCoords &&
      (newAddr.lat! < -90 || newAddr.lat! > 90 || newAddr.lng! < -180 || newAddr.lng! > 180)
    ) {
      setAddrError('Latitude/Longitude values are out of valid range.');
      return;
    }

    const hasPin = isValidIndianPincode(newAddr.pincode);
    const liveServiceability =
      hasCoords || hasPin || newAddr.locality.trim()
        ? evaluateLocationServiceability({
            location: {
              city: newAddr.city.trim(),
              state: newAddr.state,
              locality: newAddr.locality.trim(),
              formattedAddress:
                newAddr.formattedAddress ||
                `${newAddr.houseNo.trim()}, ${newAddr.street.trim()}, ${newAddr.locality.trim()}, ${newAddr.city.trim()}`,
              pincode: newAddr.pincode.trim(),
              lat: hasCoords ? newAddr.lat : undefined,
              lng: hasCoords ? newAddr.lng : undefined,
            },
            dataset,
          })
        : null;

    const now = new Date().toISOString();
    const payload = {
      userId: user.uid,
      label: newAddr.label,
      fullName: newAddr.fullName.trim(),
      mobile: newAddr.mobile.trim(),
      houseNo: newAddr.houseNo.trim(),
      street: newAddr.street.trim(),
      locality: newAddr.locality.trim(),
      ...(newAddr.landmark.trim() ? { landmark: newAddr.landmark.trim() } : {}),
      city: newAddr.city.trim(),
      district: newAddr.district.trim(),
      state: newAddr.state,
      pincode: newAddr.pincode.trim(),
      ...(hasCoords ? { lat: newAddr.lat, lng: newAddr.lng } : {}),
      ...(newAddr.placeId ? { placeId: newAddr.placeId } : {}),
      ...(newAddr.formattedAddress ? { formattedAddress: newAddr.formattedAddress } : {}),
      ...(liveServiceability?.matchedZoneId ? { zoneId: liveServiceability.matchedZoneId } : {}),
      ...(typeof liveServiceability?.matchedWardNumber === 'number'
        ? { wardNumber: liveServiceability.matchedWardNumber }
        : {}),
    };

    try {
      if (editingAddress) {
        await updateDoc(doc(db, 'addresses', editingAddress.id), {
          ...payload,
          userId: editingAddress.userId,
          isDefault: editingAddress.isDefault,
          createdAt: editingAddress.createdAt,
          updatedAt: now,
        });
        setAddrSuccess('Delivery address updated.');
      } else {
        await addDoc(collection(db, 'addresses'), {
          ...payload,
          isDefault: addresses.length === 0,
          createdAt: now,
        });
        setAddrSuccess('New delivery address saved.');
      }
      resetAddressForm();
      setAddressCheckRequested(false);
      await loadAccountData();
    } catch (error) {
      setAddrError('Could not save delivery address. Please verify all fields.');
      handleFirestoreError(
        error,
        editingAddress ? OperationType.UPDATE : OperationType.CREATE,
        editingAddress ? `addresses/${editingAddress.id}` : 'addresses'
      );
    }
  };

  const handleEditAddress = (a: Address) => {
    setAddrError('');
    setAddrSuccess('');
    setEditingAddress(a);
    setNewAddr({
      label: a.label,
      fullName: a.fullName,
      mobile: a.mobile,
      houseNo: a.houseNo,
      street: a.street,
      locality: a.locality,
      landmark: a.landmark || '',
      city: a.city,
      district: a.district,
      state: a.state,
      pincode: a.pincode,
      lat: a.lat,
      lng: a.lng,
      placeId: a.placeId,
      formattedAddress: a.formattedAddress,
    });
  };

  const handleSetDefaultAddress = async (target: Address) => {
    const now = new Date().toISOString();
    try {
      await Promise.all(
        addresses.map((a) => {
          if (a.id === target.id && !a.isDefault) {
            return updateDoc(doc(db, 'addresses', a.id), { isDefault: true, updatedAt: now });
          }
          if (a.id !== target.id && a.isDefault) {
            return updateDoc(doc(db, 'addresses', a.id), { isDefault: false, updatedAt: now });
          }
          return Promise.resolve();
        })
      );
      setAddrSuccess(`${target.label} set as default delivery address.`);
      await loadAccountData();
    } catch (error) {
      setAddrError('Unable to update default address.');
      handleFirestoreError(error, OperationType.UPDATE, `addresses/${target.id}`);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      if (editingAddress?.id === id) resetAddressForm();
      await deleteDoc(doc(db, 'addresses', id));
      setAddrSuccess('Delivery address removed.');
      await loadAccountData();
    } catch (error) {
      setAddrError('Unable to delete address.');
      handleFirestoreError(error, OperationType.DELETE, `addresses/${id}`);
    }
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSupportStatus('Submitting ticket...');
    await saveSupportTicket({
      userId: user.uid,
      userRole: 'customer',
      name: profile?.fullName || user.displayName || 'Customer',
      email: profile?.email || user.email || '',
      orderNumber: supportForm.orderNumber,
      topic: supportForm.topic,
      message: supportForm.message,
    });
    setSupportForm({ topic: 'Order Inquiry', orderNumber: '', message: '' });
    setSupportStatus('Support ticket submitted! Track replies below.');
    await loadAccountData();
  };

  const handleSavePrivacySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrivacyStatus('');
    setPrivacyError('');
    setSavingPrivacy(true);
    try {
      await updateCustomerProfile({ privacySettings: privacyPrefs });
      setPrivacyStatus('Your privacy & communication preferences have been saved.');
    } catch (err: any) {
      setPrivacyError(err?.message || 'Unable to save privacy preferences right now.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const formHasServiceabilityInput = Boolean(
    (typeof newAddr.lat === 'number' && typeof newAddr.lng === 'number') ||
      isValidIndianPincode(newAddr.pincode) ||
      newAddr.locality.trim().length >= 3 ||
      addressCheckRequested
  );

  const formServiceability = useMemo(() => {
    if (!formHasServiceabilityInput) return null;
    return evaluateLocationServiceability({
      location: {
        city: newAddr.city.trim(),
        state: newAddr.state,
        locality: newAddr.locality.trim(),
        formattedAddress:
          newAddr.formattedAddress ||
          [newAddr.street.trim(), newAddr.locality.trim(), newAddr.city.trim(), newAddr.pincode.trim()]
            .filter(Boolean)
            .join(', '),
        pincode: newAddr.pincode.trim(),
        lat: typeof newAddr.lat === 'number' && !Number.isNaN(newAddr.lat) ? newAddr.lat : undefined,
        lng: typeof newAddr.lng === 'number' && !Number.isNaN(newAddr.lng) ? newAddr.lng : undefined,
      },
      dataset,
    });
  }, [
    formHasServiceabilityInput,
    newAddr.city,
    newAddr.state,
    newAddr.locality,
    newAddr.formattedAddress,
    newAddr.street,
    newAddr.pincode,
    newAddr.lat,
    newAddr.lng,
    dataset,
  ]);

  const navItems = [
    { id: 'profile', label: 'Profile & Security', icon: User },
    { id: 'orders', label: 'My Orders', icon: Package },
    { id: 'rewards', label: 'CARTZY Rewards', icon: Award },
    { id: 'cart', label: `My Cart (${cartCount})`, icon: ShoppingCart },
    { id: 'addresses', label: `Saved Addresses (${addresses.length})`, icon: MapPin },
    { id: 'wishlist', label: `Wishlist (${wishlistIds.length})`, icon: Heart },
    { id: 'privacy', label: 'Privacy Settings', icon: Lock },
    { id: 'notifications', label: `Notifications (${unreadCount})`, icon: Bell },
    { id: 'support', label: 'Customer Support', icon: HelpCircle },
  ];

  const emailChanged =
    Boolean(emailInput.trim()) &&
    emailInput.trim() !== (profile?.email || user?.email || '');

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-4 md:px-6 py-5 md:py-8 pb-24 md:pb-10 space-y-6">
      {/* Top Customer Summary Header */}
      <div className="bg-gradient-to-r from-[#14213D] via-[#1B2C50] to-[#14213D] rounded-3xl p-5 sm:p-7 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#FCA311] text-[#14213D] font-extrabold text-xl sm:text-2xl flex items-center justify-center overflow-hidden border-2 border-white/25 shadow-md">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={profile?.fullName || 'Customer avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initials || 'CZ'}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              aria-label="Upload profile photo"
              title="Upload profile photo"
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white flex items-center justify-center shadow border border-white/30 cursor-pointer"
            >
              {uploadingPhoto ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-extrabold truncate">
                {profile?.fullName || user?.displayName || 'CARTZY Customer'}
              </h1>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="text-[11px] font-bold bg-[#FCA311] text-[#14213D] px-2 py-0.5 rounded-md"
                >
                  Admin
                </Link>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-300 truncate mt-0.5">
              {profile?.email || user?.email || (profile?.mobile ? `+91 ${profile.mobile}` : 'CARTZY Member')}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {user?.emailVerified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="w-3 h-3" /> Email Verified
                </span>
              )}
              {(user?.phoneNumber || profile?.phoneVerified) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded-md">
                  <ShieldCheck className="w-3 h-3" /> Phone Verified
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setParams({ tab: 'cart' })}
            className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl px-3.5 py-2.5 text-center transition cursor-pointer"
          >
            <p className="text-base sm:text-lg font-extrabold font-mono">{cartCount}</p>
            <p className="text-[11px] text-slate-300">Cart Items</p>
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: 'addresses' })}
            className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl px-3.5 py-2.5 text-center transition cursor-pointer"
          >
            <p className="text-base sm:text-lg font-extrabold font-mono">{addresses.length}</p>
            <p className="text-[11px] text-slate-300">Addresses</p>
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: 'wishlist' })}
            className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl px-3.5 py-2.5 text-center transition cursor-pointer"
          >
            <p className="text-base sm:text-lg font-extrabold font-mono">{wishlistIds.length}</p>
            <p className="text-[11px] text-slate-300">Wishlist</p>
          </button>
        </div>
      </div>

      {/* Responsive Mobile Tab Strip */}
      <div className="flex md:hidden gap-2 overflow-x-auto no-scrollbar pb-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setParams({ tab: item.id })}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition cursor-pointer ${
              tab === item.id
                ? 'bg-[#14213D] text-white border-[#14213D]'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            <item.icon className="w-3.5 h-3.5" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block bg-white rounded-2xl p-4 border border-slate-200 space-y-1 h-fit">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams({ tab: item.id })}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                tab === item.id ? 'bg-[#14213D] text-white' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}

          <div className="pt-2 mt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Secure Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Content Panel */}
        <main className="md:col-span-3 min-w-0 bg-white rounded-2xl p-4 sm:p-7 border border-slate-200">
          {tab === 'profile' && (
            <div className="space-y-8">
              {welcomeBanner && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Welcome to CARTZY!</p>
                    <p className="mt-0.5">
                      Your customer account is active and a verification link has been sent to your email address.
                    </p>
                  </div>
                </div>
              )}

              {user && user.email && !user.emailVerified && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap justify-between items-center gap-2">
                  <span>
                    Your email (<strong>{user.email}</strong>) is not verified yet. Verify it for full security.
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      resendVerification()
                        .then(() => setStatusNote('Verification email sent! Please check your inbox.'))
                        .catch((err) => setProfileError(err?.message || 'Unable to resend email right now.'))
                    }
                    className="font-bold underline shrink-0 cursor-pointer"
                  >
                    Resend Verification Link
                  </button>
                </div>
              )}

              {/* Profile Photo Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-[#14213D] text-[#FCA311] font-extrabold text-lg flex items-center justify-center overflow-hidden">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="Avatar preview" className="w-full h-full object-cover" />
                    ) : (
                      <span>{initials || 'CZ'}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#14213D]">Profile Photo</p>
                    <p className="text-xs text-slate-500">JPG, PNG, or WebP · Automatically optimized</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                  </button>
                  {avatarSrc && (
                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => removeProfilePhoto().then(() => setPhotoStatus('Profile photo removed.'))}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {photoError && <p className="text-xs text-red-600 font-medium">{photoError}</p>}
              {photoStatus && <p className="text-xs text-emerald-700 font-medium">{photoStatus}</p>}

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Personal Details Form */}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <h2 className="text-lg font-bold text-[#14213D]">Personal Information &amp; Preferences</h2>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">Full Name *</label>
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Email Address {user?.email ? '(Changing login email sends verification)' : '(Optional)'}
                    </label>
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  {emailChanged && hasPasswordProvider && user?.email && (
                    <div>
                      <label className="text-xs font-semibold text-amber-800">
                        Current Password (required to confirm email change)
                      </label>
                      <input
                        type="password"
                        placeholder="Enter current password"
                        value={emailReauthPassword}
                        onChange={(e) => setEmailReauthPassword(e.target.value)}
                        className="w-full mt-1 border border-amber-300 bg-amber-50/40 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Mobile Number (10 digits)
                    </label>
                    <div className="flex items-stretch mt-1 rounded-xl border border-slate-300 overflow-hidden bg-white">
                      <span className="px-3 py-2.5 bg-slate-50 border-r border-slate-200 text-xs font-bold text-[#14213D] flex items-center">
                        +91
                      </span>
                      <input
                        value={mobile}
                        maxLength={10}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                        placeholder="9876543210"
                        className="w-full px-3.5 py-2.5 text-sm font-mono outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Default Delivery PIN Code
                    </label>
                    <input
                      value={defaultPincode}
                      maxLength={6}
                      onChange={(e) => setDefaultPincode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 520012"
                      className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#2563EB]"
                    />
                  </div>

                  {profileError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{profileError}</span>
                    </div>
                  )}
                  {statusNote && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{statusNote}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>{savingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </form>

                {/* Password & Account Security Panel */}
                <div className="space-y-5">
                  <form
                    onSubmit={handlePasswordChange}
                    className="p-5 rounded-2xl border border-slate-200 bg-[#F8FAFC] space-y-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-[#14213D] inline-flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-[#2563EB]" />
                        {hasPasswordProvider ? 'Change Password' : 'Set Account Password'}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowPasswords((prev) => !prev)}
                        className="text-xs font-semibold text-slate-500 hover:text-[#14213D] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showPasswords ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {!user?.email ? (
                      <p className="text-xs text-slate-600 leading-relaxed">
                        You are signed in via Mobile OTP. Save an email address under Personal Information to enable Email &amp; Password sign-in as well.
                      </p>
                    ) : (
                      <>
                        {hasPasswordProvider && (
                          <div>
                            <label className="text-xs font-semibold text-slate-600">Current Password *</label>
                            <input
                              required
                              type={showPasswords ? 'text' : 'password'}
                              autoComplete="current-password"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white outline-none focus:border-[#2563EB]"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-xs font-semibold text-slate-600">
                            New Password * (min 6 chars)
                          </label>
                          <input
                            required
                            type={showPasswords ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white outline-none focus:border-[#2563EB]"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">
                            Confirm New Password *
                          </label>
                          <input
                            required
                            type={showPasswords ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white outline-none focus:border-[#2563EB]"
                          />
                        </div>

                        {passwordError && (
                          <p className="text-xs text-red-600 font-medium">{passwordError}</p>
                        )}
                        {passwordStatus && (
                          <p className="text-xs text-emerald-700 font-medium">{passwordStatus}</p>
                        )}

                        <button
                          type="submit"
                          disabled={savingPassword}
                          className="w-full py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          {savingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          <span>
                            {savingPassword
                              ? 'Updating...'
                              : hasPasswordProvider
                              ? 'Update Password'
                              : 'Link Email Password'}
                          </span>
                        </button>
                      </>
                    )}
                  </form>

                  <div className="p-5 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                    <h3 className="font-bold text-[#14213D] text-sm">Account Security &amp; Partner Portals</h3>
                    <div className="flex justify-between gap-2 text-slate-600">
                      <span>Customer ID (UID)</span>
                      <span className="font-mono text-[#14213D] truncate max-w-[180px]">{user?.uid}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-slate-600">
                      <span>Account Role</span>
                      <span className="font-semibold text-[#14213D] capitalize">
                        {isAdmin ? 'Store Administrator' : profile?.role || 'customer'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-slate-600">
                      <span>Member Since</span>
                      <span className="font-mono text-[#14213D]">
                        {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN') : 'Active'}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                      <Link
                        to="/seller"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-[#14213D] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
                      >
                        <Store className="w-3.5 h-3.5 text-[#2563EB]" />
                        Seller Portal
                      </Link>
                      <Link
                        to="/delivery"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-[#14213D] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
                      >
                        <Truck className="w-3.5 h-3.5 text-[#2563EB]" />
                        Delivery Partner
                      </Link>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex md:hidden">
                      <button
                        type="button"
                        onClick={async () => {
                          await logout();
                          navigate('/login');
                        }}
                        className="w-full py-2 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 inline-flex items-center justify-center gap-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Secure Logout
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone — Play Store Account Deletion Compliance */}
                  <div className="p-5 rounded-2xl border border-red-200 bg-red-50/40 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-red-900 text-sm">Delete Account</h3>
                        <p className="text-red-700 mt-0.5">
                          Permanently delete your profile, saved addresses, cart, wishlist, and rewards.
                        </p>
                      </div>
                      {!deleteOpen && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteOpen(true);
                            setDeleteError('');
                          }}
                          className="px-3.5 py-2 rounded-xl border border-red-300 text-red-700 font-bold hover:bg-red-100 shrink-0 cursor-pointer"
                        >
                          Delete Account
                        </button>
                      )}
                    </div>

                    {deleteOpen && (
                      <div className="space-y-3 pt-2 border-t border-red-200">
                        <p className="text-red-800 leading-relaxed">
                          This action cannot be undone. Type <strong className="font-mono">DELETE</strong> below to confirm permanent account removal.
                        </p>
                        {hasPasswordProvider && user?.email && (
                          <input
                            type="password"
                            placeholder="Enter current password *"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            className="w-full border border-red-300 rounded-xl px-3 py-2 text-xs bg-white"
                          />
                        )}
                        <input
                          placeholder='Type "DELETE" to confirm'
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="w-full border border-red-300 rounded-xl px-3 py-2 text-xs font-mono bg-white"
                        />
                        {deleteError && <p className="text-red-700 font-semibold">{deleteError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={deletingAccount}
                            onClick={async () => {
                              setDeleteError('');
                              if (deleteConfirmText.trim() !== 'DELETE') {
                                setDeleteError('Please type DELETE exactly to confirm.');
                                return;
                              }
                              setDeletingAccount(true);
                              try {
                                await deleteCustomerAccount(deletePassword || undefined);
                                showToast('Your CARTZY account has been deleted.');
                                navigate('/');
                              } catch (err: any) {
                                setDeleteError(err?.message || 'Unable to delete account right now.');
                              } finally {
                                setDeletingAccount(false);
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs disabled:opacity-60 cursor-pointer"
                          >
                            {deletingAccount ? 'Deleting Account...' : 'Permanently Delete My Account'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteOpen(false);
                              setDeleteConfirmText('');
                              setDeletePassword('');
                              setDeleteError('');
                            }}
                            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'orders' && <CustomerOrdersPanel embedded />}

          {tab === 'rewards' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-[#14213D]">CARTZY Rewards &amp; Store Coupons</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Earn {storeSettings.earnPointsPer100} point(s) per ₹100 spent and redeem points directly at checkout.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-[#14213D] text-white space-y-1">
                  <p className="text-xs text-slate-300">Available Points</p>
                  <p className="text-2xl font-extrabold font-mono text-[#FCA311] tabular-nums">
                    {rewardAccount?.pointsBalance || 0} pts
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Worth {formatINR((rewardAccount?.pointsBalance || 0) * (storeSettings.rupeePerPoint || 1))}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-1">
                  <p className="text-xs text-slate-500">Total Points Earned</p>
                  <p className="text-xl font-extrabold font-mono text-[#14213D] tabular-nums">
                    {rewardAccount?.totalEarned || 0} pts
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Redeemed: {rewardAccount?.totalRedeemed || 0} pts
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-2">
                  <p className="text-xs text-slate-500">Your Referral Code</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-extrabold text-sm text-[#14213D]">
                      {rewardAccount?.referralCode || profile?.referralCode || `CZ${user?.uid.slice(0, 6).toUpperCase()}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const code =
                          rewardAccount?.referralCode ||
                          profile?.referralCode ||
                          `CZ${user?.uid.slice(0, 6).toUpperCase()}`;
                        navigator.clipboard?.writeText(code).catch(() => {});
                        showToast(`Copied referral code ${code}`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#2563EB] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-sm text-[#14213D]">Active Store Coupons</h3>
                {activeCoupons.length === 0 ? (
                  <p className="text-xs text-slate-500">No active coupons right now.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {activeCoupons.map((c) => (
                      <div
                        key={c.id}
                        className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-mono font-extrabold text-sm text-[#14213D]">{c.code}</p>
                          <p className="text-slate-600 mt-0.5">
                            {c.type === 'PERCENT'
                              ? `${c.value}% off (up to ${formatINR(c.maxDiscount)})`
                              : `${formatINR(c.value)} flat off`}
                            {' · '}Min order {formatINR(c.minOrderAmount)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(c.code).catch(() => {});
                            showToast(`Copied coupon ${c.code}`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#14213D] text-white font-bold hover:bg-[#2563EB] shrink-0 cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-sm text-[#14213D]">Points History</h3>
                {!rewardAccount || rewardAccount.history.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No reward transactions yet. Complete an order to start earning CARTZY Rewards.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                    {rewardAccount.history.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between gap-3 p-3.5 border-b last:border-b-0 border-slate-100"
                      >
                        <div>
                          <p className="font-semibold text-[#14213D]">{tx.description}</p>
                          <p className="text-[11px] text-slate-400">
                            {new Date(tx.createdAt).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            tx.points >= 0 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {tx.points >= 0 ? `+${tx.points}` : tx.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'cart' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#14213D]">My Synced Shopping Cart</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Saved automatically to your CARTZY account and synchronized live across all your devices.
                  </p>
                </div>
                <Link to="/cart" className="text-xs font-semibold text-[#2563EB] hover:underline">
                  Full Cart View &rarr;
                </Link>
              </div>

              {cartItems.length === 0 ? (
                <div className="p-10 rounded-2xl border border-slate-200 text-center space-y-3">
                  <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="font-semibold text-[#14213D] text-sm">Your saved cart is empty</p>
                  <Link
                    to="/products"
                    className="inline-block px-5 py-2.5 rounded-xl bg-[#FCA311] text-[#14213D] text-xs font-bold"
                  >
                    Explore Products
                  </Link>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cartItems.map((item) => (
                      <div
                        key={getCartItemKey(item)}
                        className="border border-slate-200 rounded-2xl p-3.5 flex flex-wrap sm:flex-nowrap items-center gap-3.5"
                      >
                        <SafeImage
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-contain bg-slate-50 border border-slate-100 p-1 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/product/${item.productId}`}
                            className="font-semibold text-sm text-[#14213D] hover:underline truncate block"
                          >
                            {item.name}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {item.brand}
                            {item.selectedSize || item.selectedColor
                              ? ` · ${[item.selectedSize, item.selectedColor].filter(Boolean).join(', ')}`
                              : ''}
                          </p>
                          <p className="text-sm font-bold text-[#14213D] font-mono tabular-nums mt-0.5">
                            {formatINR(item.sellingPrice)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center border border-slate-300 rounded-xl overflow-hidden">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.quantity - 1,
                                  item.selectedSize,
                                  item.selectedColor
                                )
                              }
                              className="min-h-[32px] min-w-[32px] flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2.5 text-xs font-mono font-bold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              disabled={item.quantity >= item.maxStock}
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.quantity + 1,
                                  item.selectedSize,
                                  item.selectedColor
                                )
                              }
                              className="min-h-[32px] min-w-[32px] flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              removeFromCart(item.productId, item.selectedSize, item.selectedColor)
                            }
                            className="p-2 rounded-xl text-red-600 hover:bg-red-50 cursor-pointer"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Cart Subtotal ({cartCount} items)</p>
                      <p className="text-xl font-extrabold text-[#14213D] font-mono tabular-nums">
                        {formatINR(cartSubtotal)}
                      </p>
                    </div>
                    <div className="flex gap-2.5">
                      <Link
                        to="/cart"
                        className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-[#14213D] hover:bg-white"
                      >
                        Manage Cart
                      </Link>
                      <Link
                        to="/checkout"
                        className="px-5 py-2.5 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] text-xs font-extrabold"
                      >
                        Proceed to Checkout
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'wishlist' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-[#14213D]">
                  My Wishlist ({wishlistIds.length})
                </h2>
                <Link
                  to="/wishlist"
                  className="text-xs font-bold text-[#2563EB] hover:underline"
                >
                  Open Dedicated Wishlist View
                </Link>
              </div>
              {wishlistIds.length === 0 ? (
                <p className="text-sm text-slate-500">No saved products in your wishlist yet.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {wishlistIds.map((pid) => {
                    const p = wishProductsMap.get(pid);
                    if (!p) {
                      return (
                        <div
                          key={pid}
                          className="border border-red-200 bg-red-50/30 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-red-700 uppercase">
                              Unavailable / Removed
                            </span>
                            <p className="text-sm font-semibold text-[#14213D] truncate">
                              Saved Product ({pid})
                            </p>
                            <p className="text-xs text-slate-500">
                              This item is no longer in the catalog.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleWishlist(pid)}
                            className="text-xs text-red-600 font-semibold shrink-0 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    }

                    const isActive =
                      p.active !== false &&
                      (!p.approvalStatus || p.approvalStatus === 'Approved');
                    const areaCheck = checkProductDeliverable(p);
                    const canMove = isActive && p.stock > 0 && areaCheck.deliverable;
                    const reason = !isActive
                      ? 'Product unavailable'
                      : p.stock <= 0
                      ? 'Out of stock'
                      : !areaCheck.deliverable
                      ? areaCheck.reason || 'Unavailable in selected area'
                      : '';

                    return (
                      <div
                        key={pid}
                        className={`border rounded-2xl p-3.5 flex gap-3 items-start ${
                          canMove ? 'border-slate-200' : 'border-amber-200 bg-amber-50/20'
                        }`}
                      >
                        <SafeImage
                          src={p.images[0]}
                          alt={p.name}
                          className={`w-16 h-16 rounded-xl object-contain bg-slate-50 border border-slate-100 p-1 shrink-0 ${
                            !canMove ? 'opacity-65 grayscale' : ''
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/product/${p.id}`}
                            className="font-semibold text-sm truncate block hover:underline"
                          >
                            {p.name}
                          </Link>
                          <p className="font-bold text-[#14213D] text-sm font-mono tabular-nums">
                            {formatINR(p.sellingPrice)}
                          </p>
                          {!canMove && (
                            <p className="text-[11px] font-semibold text-red-600 mt-0.5 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{reason}</span>
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            <button
                              type="button"
                              disabled={!canMove}
                              onClick={async () => {
                                await addToCart(p, 1);
                                await toggleWishlist(p.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#FCA311] text-[#14213D] text-xs font-bold disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {canMove ? 'Move to Cart' : 'Unavailable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleWishlist(p.id)}
                              className="text-xs text-red-600 font-medium cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'addresses' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#14213D]">Saved Delivery Addresses</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every address is verified live against CARTZY&apos;s configured Vijayawada wards, open stores, and delivery-partner coverage.
                  </p>
                </div>
                {customerLocation.pincode && (
                  <span className="text-[11px] font-semibold bg-slate-100 text-[#14213D] px-3 py-1.5 rounded-xl border border-slate-200">
                    Active Area: {customerLocation.locality} ({customerLocation.pincode})
                  </span>
                )}
              </div>

              {addresses.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 text-center text-xs text-slate-500">
                  No saved addresses yet. Add your Home, Work, or Other address below or pick your exact pin on the map.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {addresses.map((a) => {
                    const addrSvc = evaluateLocationServiceability({
                      location: {
                        city: a.city,
                        state: a.state,
                        locality: a.locality,
                        formattedAddress:
                          a.formattedAddress || `${a.houseNo}, ${a.street}, ${a.locality}, ${a.city}`,
                        pincode: a.pincode,
                        lat: a.lat,
                        lng: a.lng,
                        zoneId: a.zoneId,
                        wardNumber: a.wardNumber,
                      },
                      dataset,
                    });

                    return (
                      <div
                        key={a.id}
                        className={`border rounded-2xl p-4 text-xs space-y-2 ${
                          a.isDefault ? 'border-[#2563EB] bg-blue-50/30' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-[#14213D] text-sm">{a.label}</span>
                            {a.isDefault && (
                              <span className="text-[10px] font-bold text-[#2563EB] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                Default
                              </span>
                            )}
                            {typeof a.lat === 'number' && typeof a.lng === 'number' && (
                              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                Map Pinned
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5">
                            {!a.isDefault && (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultAddress(a)}
                                className="text-slate-600 hover:text-[#2563EB] inline-flex items-center gap-1 font-medium cursor-pointer"
                              >
                                <Star className="w-3 h-3" /> Default
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditAddress(a)}
                              className="text-[#2563EB] hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(a.id)}
                              className="text-red-600 hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>
                        <p className="font-semibold text-[#1F2937]">
                          {a.fullName} (<span className="font-mono">+91 {a.mobile}</span>)
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                          {a.houseNo}, {a.street}, {a.locality}
                          {a.landmark ? `, ${a.landmark}` : ''}, {a.city}, {a.district}, {a.state} -{' '}
                          <strong className="font-mono">{a.pincode}</strong>
                        </p>
                        {typeof a.lat === 'number' && typeof a.lng === 'number' && (
                          <p className="font-mono text-[11px] text-slate-500">
                            Coordinates: {a.lat.toFixed(6)}, {a.lng.toFixed(6)}
                          </p>
                        )}

                        {/* Live CARTZY Local Marketplace Serviceability Badge */}
                        <div
                          className={`rounded-xl p-2.5 border text-[11px] space-y-1 ${
                            addrSvc.deliverable
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50/80 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold inline-flex items-center gap-1">
                              {addrSvc.deliverable ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              )}
                              {addrSvc.deliverable
                                ? `Serviceable · ${addrSvc.matchedZoneName || addrSvc.matchedCityName}`
                                : `Not Serviceable (${addrSvc.statusCode.replace(/_/g, ' ')})`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                updateCustomerLocation({
                                  cityId: addrSvc.matchedCityId || '',
                                  cityName: a.city,
                                  state: a.state,
                                  pincode: a.pincode,
                                  locality: a.locality,
                                  formattedAddress:
                                    a.formattedAddress ||
                                    `${a.houseNo}, ${a.street}, ${a.locality}, ${a.city} ${a.pincode}`,
                                  lat: a.lat,
                                  lng: a.lng,
                                  zoneId: addrSvc.matchedZoneId || a.zoneId,
                                  zoneName: addrSvc.matchedZoneName,
                                  wardNumber: addrSvc.matchedWardNumber || a.wardNumber,
                                  source: 'saved',
                                });
                                showToast(`Delivery area switched to ${a.label} (${a.locality})`);
                              }}
                              className="font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Navigation className="w-3 h-3" /> Deliver Here
                            </button>
                          </div>
                          <p className="opacity-90 leading-snug">
                            {addrSvc.deliverable
                              ? `${addrSvc.estimatedDeliveryText} · Delivery fee ₹${addrSvc.deliveryCharge} (Free above ₹${addrSvc.freeDeliveryThreshold})`
                              : addrSvc.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleSaveAddress} className="border-t pt-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-sm text-[#14213D]">
                    {editingAddress ? `Edit ${editingAddress.label} Address` : 'Add New Address'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddressCheckRequested(true);
                        if (
                          !newAddr.locality.trim() &&
                          !isValidIndianPincode(newAddr.pincode) &&
                          typeof newAddr.lat !== 'number'
                        ) {
                          setAddrError('Enter a PIN code, locality, or select a map pin to check serviceability.');
                        } else {
                          setAddrError('');
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-[#14213D] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                      Check Serviceability
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocationPickerOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Select Location on Map
                    </button>
                  </div>
                </div>

                {formServiceability && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      formServiceability.deliverable
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold inline-flex items-center gap-1.5">
                        {formServiceability.deliverable ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        )}
                        {formServiceability.deliverable
                          ? `Serviceable: ${formServiceability.matchedZoneName || formServiceability.matchedCityName}`
                          : `Serviceability Check: ${formServiceability.statusCode.replace(/_/g, ' ')}`}
                      </span>
                      {typeof formServiceability.matchedWardNumber === 'number' && (
                        <span className="font-mono text-[11px] bg-white/70 border border-current/20 px-2 py-0.5 rounded-md">
                          Ward #{formServiceability.matchedWardNumber}
                        </span>
                      )}
                    </div>
                    <p className="leading-relaxed">{formServiceability.message}</p>
                    <p className="text-[11px] opacity-80">
                      Boundary check: {formServiceability.boundaryReason}
                      {formServiceability.deliverable
                        ? ` · Est. ${formServiceability.estimatedDeliveryText} · Min order ₹${formServiceability.minOrderAmount}`
                        : ''}
                    </p>
                  </div>
                )}

                {typeof newAddr.lat === 'number' && typeof newAddr.lng === 'number' && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span className="text-emerald-900 font-medium">
                      <Check className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
                      Pinned Location:{' '}
                      <strong className="font-mono">
                        {newAddr.lat.toFixed(6)}, {newAddr.lng.toFixed(6)}
                      </strong>
                      {newAddr.formattedAddress ? ` · ${newAddr.formattedAddress}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewAddr((prev) => ({
                          ...prev,
                          lat: undefined,
                          lng: undefined,
                          placeId: undefined,
                          formattedAddress: undefined,
                        }))
                      }
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Clear Pin
                    </button>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Address Type
                    </label>
                    <select
                      value={newAddr.label}
                      onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value as any })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
                    >
                      <option value="Home">Home</option>
                      <option value="Work">Work</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Recipient Full Name *
                    </label>
                    <input
                      required
                      placeholder="Full Name"
                      value={newAddr.fullName}
                      onChange={(e) => setNewAddr({ ...newAddr, fullName: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      10-Digit Mobile *
                    </label>
                    <input
                      required
                      maxLength={10}
                      placeholder="9876543210"
                      value={newAddr.mobile}
                      onChange={(e) => setNewAddr({ ...newAddr, mobile: e.target.value.replace(/\D/g, '') })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      House / Building / Flat No. *
                    </label>
                    <input
                      required
                      placeholder="e.g. Flat 302, Sai Towers"
                      value={newAddr.houseNo}
                      onChange={(e) => setNewAddr({ ...newAddr, houseNo: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Street Name *
                    </label>
                    <input
                      required
                      placeholder="e.g. MG Road"
                      value={newAddr.street}
                      onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Area / Locality *
                    </label>
                    <input
                      required
                      placeholder="e.g. Bhavanipuram"
                      value={newAddr.locality}
                      onChange={(e) => setNewAddr({ ...newAddr, locality: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Landmark (Optional)
                    </label>
                    <input
                      placeholder="Near junction / landmark"
                      value={newAddr.landmark}
                      onChange={(e) => setNewAddr({ ...newAddr, landmark: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      City / Town *
                    </label>
                    <input
                      required
                      placeholder="Vijayawada"
                      value={newAddr.city}
                      onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      District *
                    </label>
                    <input
                      required
                      placeholder="NTR District"
                      value={newAddr.district}
                      onChange={(e) => setNewAddr({ ...newAddr, district: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      State *
                    </label>
                    <select
                      value={newAddr.state}
                      onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
                    >
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      6-Digit PIN Code *
                    </label>
                    <input
                      required
                      maxLength={6}
                      placeholder="e.g. 520012"
                      value={newAddr.pincode}
                      onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value.replace(/\D/g, '') })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="16.5197"
                        value={newAddr.lat ?? ''}
                        onChange={(e) =>
                          setNewAddr({
                            ...newAddr,
                            lat: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        placeholder="80.6062"
                        value={newAddr.lng ?? ''}
                        onChange={(e) =>
                          setNewAddr({
                            ...newAddr,
                            lng: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
                {addrError && <p className="text-xs text-red-600">{addrError}</p>}
                {addrSuccess && <p className="text-xs text-emerald-700 font-medium">{addrSuccess}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#14213D] text-white text-xs font-semibold hover:bg-[#2563EB] cursor-pointer"
                  >
                    {editingAddress ? 'Update Address' : 'Save Address'}
                  </button>
                  {editingAddress && (
                    <button
                      type="button"
                      onClick={resetAddressForm}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="text-xl font-bold text-[#14213D] inline-flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[#2563EB]" />
                  Privacy Settings &amp; Data Controls
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Manage how CARTZY communicates with you and uses your saved location preferences. Preferences are stored securely in your private account record.
                </p>
              </div>

              <form onSubmit={handleSavePrivacySettings} className="space-y-3">
                {[
                  {
                    key: 'orderUpdatesSms' as const,
                    title: 'Order, Dispatch & Delivery OTP Alerts',
                    description:
                      'Receive SMS and in-app updates about order confirmation, seller packing, and delivery handover.',
                  },
                  {
                    key: 'promotionalOffers' as const,
                    title: 'Promotional Offers, Coupons & Flash Sales',
                    description:
                      'Get occasional alerts on local Vijayawada deals, festive discounts, and reward point offers.',
                  },
                  {
                    key: 'personalizedRecommendations' as const,
                    title: 'Personalized Shopping Recommendations',
                    description:
                      'Use your browsing and order preferences to tailor product suggestions across the storefront.',
                  },
                  {
                    key: 'shareLocationForDelivery' as const,
                    title: 'Local Serviceability & Pin Location Matching',
                    description:
                      'Allow CARTZY to check your selected delivery pin against active local zones and partner shops.',
                  },
                ].map((item) => {
                  const enabled = privacyPrefs[item.key];
                  return (
                    <label
                      key={item.key}
                      className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] hover:border-slate-300 cursor-pointer transition"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#14213D]">{item.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                          setPrivacyPrefs((prev) => ({
                            ...prev,
                            [item.key]: e.target.checked,
                          }));
                          setPrivacyStatus('');
                          setPrivacyError('');
                        }}
                        className="mt-1 h-4 w-4 rounded accent-[#2563EB] shrink-0 cursor-pointer"
                      />
                    </label>
                  );
                })}

                {privacyError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{privacyError}</span>
                  </div>
                )}
                {privacyStatus && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{privacyStatus}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingPrivacy}
                  className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  {savingPrivacy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>{savingPrivacy ? 'Saving Preferences...' : 'Save Privacy Preferences'}</span>
                </button>
              </form>

              <div className="p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
                <h3 className="font-bold text-sm text-[#14213D]">Account Security &amp; Legal Rights</h3>
                <div className="grid sm:grid-cols-2 gap-2.5 text-slate-600">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] text-slate-400 uppercase font-bold">Mobile Number</p>
                    <p className="font-mono font-bold text-[#14213D] mt-0.5">
                      {profile?.mobile ? `+91 ${profile.mobile}` : 'Not linked'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] text-slate-400 uppercase font-bold">Saved Data Records</p>
                    <p className="font-semibold text-[#14213D] mt-0.5">
                      {addresses.length} address(es) · {cartCount} cart item(s) · {wishlistIds.length} wishlist item(s)
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <Link
                    to="/legal/privacy"
                    className="text-xs font-bold text-[#2563EB] hover:underline"
                  >
                    Read Privacy Policy &rarr;
                  </Link>
                  <Link
                    to="/legal/terms"
                    className="text-xs font-bold text-[#2563EB] hover:underline"
                  >
                    Terms of Service &rarr;
                  </Link>
                  <Link
                    to="/legal/account-deletion"
                    className="text-xs font-bold text-[#2563EB] hover:underline"
                  >
                    Account Deletion Policy &rarr;
                  </Link>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-slate-600">
                    Want to permanently erase your CARTZY account and personal records?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setParams({ tab: 'profile' });
                      setDeleteOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-red-300 text-red-700 font-bold hover:bg-red-50 cursor-pointer"
                  >
                    Go to Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#14213D]">In-App Notifications</h2>
                  <p className="text-xs text-slate-500">
                    Real-time order, delivery &amp; support updates sync here automatically.
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllAsRead()}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-[#2563EB] hover:bg-blue-50 cursor-pointer"
                  >
                    Mark All Read ({unreadCount})
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">No notifications yet. Order updates appear here automatically.</p>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border text-sm flex justify-between items-start gap-4 ${
                        n.read ? 'bg-white border-slate-200' : 'bg-blue-50/40 border-[#2563EB]/40'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-[#14213D]">{n.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                        <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                          {new Date(n.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => markAsRead(n.id)}
                          className="text-xs font-semibold text-[#2563EB] shrink-0 cursor-pointer hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'support' && (
            <div className="space-y-8">
              <form onSubmit={handleSupportSubmit} className="space-y-4 max-w-lg">
                <h2 className="text-xl font-bold text-[#14213D]">Help &amp; Customer Support</h2>
                <p className="text-xs text-slate-500">
                  Submit an inquiry about an order, return, or account issue, or visit our{' '}
                  <Link to="/support" className="text-[#2563EB] font-semibold underline">
                    FAQ &amp; Help Center
                  </Link>.
                </p>
                <select
                  value={supportForm.topic}
                  onChange={(e) => setSupportForm({ ...supportForm, topic: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
                >
                  <option value="Order Inquiry">Order Inquiry</option>
                  <option value="Return & Refund">Return &amp; Refund</option>
                  <option value="Payment Issue">Payment Issue</option>
                  <option value="Account Help">Account Help</option>
                </select>
                <input
                  placeholder="Order ID (Optional, e.g. CZ-2026...)"
                  value={supportForm.orderNumber}
                  onChange={(e) => setSupportForm({ ...supportForm, orderNumber: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
                <textarea
                  required
                  rows={4}
                  placeholder="Describe how we can help..."
                  value={supportForm.message}
                  onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer"
                >
                  Submit Support Request
                </button>
                {supportStatus && <p className="text-xs text-emerald-700 font-medium">{supportStatus}</p>}
              </form>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h3 className="text-sm font-bold text-[#14213D]">
                  My Support Tickets ({supportTickets.length})
                </h3>
                {supportTickets.length === 0 ? (
                  <p className="text-xs text-slate-500">You have not raised any support tickets yet.</p>
                ) : (
                  <div className="space-y-3">
                    {supportTickets.map((t) => (
                      <div
                        key={t.id}
                        className="p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] text-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-[#14213D]">
                            {t.topic}
                            {t.orderNumber ? ` · ${t.orderNumber}` : ''}
                          </p>
                          <span
                            className={`font-bold ${
                              t.status === 'Resolved'
                                ? 'text-emerald-700'
                                : t.status === 'In Progress'
                                ? 'text-[#2563EB]'
                                : 'text-amber-700'
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                        <p className="text-slate-700">{t.message}</p>
                        <p className="text-[11px] text-slate-400 tabular-nums">
                          {new Date(t.createdAt).toLocaleString('en-IN')}
                        </p>
                        {t.adminReply && (
                          <div className="p-3 rounded-xl bg-white border border-blue-200 space-y-1">
                            <p className="font-bold text-[#14213D]">
                              CARTZY Support Reply
                              {t.updatedAt ? ` · ${new Date(t.updatedAt).toLocaleString('en-IN')}` : ''}
                            </p>
                            <p className="text-slate-700">{t.adminReply}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <DeliveryLocationPicker
        isOpen={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        apiKey={getBrowserMapsApiKey(serverConfig?.googleMapsApiKey)}
        initialLocation={
          typeof newAddr.lat === 'number' && typeof newAddr.lng === 'number'
            ? { lat: newAddr.lat, lng: newAddr.lng }
            : null
        }
        onConfirm={(resolved: ParsedGoogleAddress) => {
          setNewAddr((prev) => ({
            ...prev,
            houseNo: resolved.houseNo,
            street: resolved.street,
            locality: resolved.locality,
            landmark: resolved.landmark,
            city: resolved.city,
            district: resolved.district,
            state: resolved.state || prev.state,
            pincode: resolved.pincode,
            lat: resolved.lat,
            lng: resolved.lng,
            placeId: resolved.placeId,
            formattedAddress: resolved.formattedAddress,
          }));
        }}
      />
    </div>
  );
};
