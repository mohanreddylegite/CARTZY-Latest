import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
  ShieldCheck,
  Truck,
  CreditCard,
  Banknote,
  AlertTriangle,
  Check,
  CheckCircle2,
  MapPin,
  Pencil,
  RotateCcw,
  Tag,
  Wallet,
  X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getCartItemKey, useCart } from '../contexts/CartContext';
import { useLocationService } from '../contexts/LocationContext';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import { evaluateLocationServiceability } from '../services/serviceabilityService';
import {
  INDIAN_STATES,
  formatINR,
  isValidIndianMobile,
  isValidIndianPincode,
} from '../services/indianValidation';
import {
  CheckoutInput,
  DEFAULT_STORE_SETTINGS,
  commitOrderTransaction,
  fetchActiveCoupons,
  fetchOrCreateRewardAccount,
  fetchStoreSettings,
  getServerConfigStatus,
  recordPaymentAttempt,
  revalidateCartOnServer,
  updatePaymentAttempt,
  validateCheckoutOnServer,
  validateCouponOnServer,
} from '../services/storeService';
import { getBrowserMapsApiKey, ParsedGoogleAddress } from '../services/mapsAddressParser';
import {
  Address,
  CartRevalidationResponse,
  Coupon,
  DeliveryOption,
  PaymentMethod,
  RewardAccount,
  ServerConfigStatus,
  StoreSettings,
} from '../types';
import { SafeImage } from '../components/common/SafeImage';
import { DeliveryLocationPicker } from '../components/maps/DeliveryLocationPicker';

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export const CheckoutPage: React.FC = () => {
  const { user, profile, isSuspended } = useAuth();
  const { items, subtotal, mrpTotal, syncValidatedItems, clearCart } = useCart();
  const { customerLocation, dataset } = useLocationService();
  const navigate = useNavigate();

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [rewardAccount, setRewardAccount] = useState<RewardAccount | null>(null);
  const [useRewards, setUseRewards] = useState(false);

  // Step 2: Customer Info
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [mobile, setMobile] = useState(profile?.mobile || '');
  const [email, setEmail] = useState(profile?.email || user?.email || '');
  const [altMobile, setAltMobile] = useState('');

  // Step 3: Delivery Address
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('NEW');
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [savingAddressEdit, setSavingAddressEdit] = useState(false);
  const [addressEditError, setAddressEditError] = useState('');
  const [addressFeedback, setAddressFeedback] = useState('');
  const [saveThisAddress, setSaveThisAddress] = useState(true);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<{
    label: 'Home' | 'Work' | 'Other';
    recipientFullName: string;
    recipientMobile: string;
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
    recipientFullName: profile?.fullName || '',
    recipientMobile: profile?.mobile || '',
    houseNo: '',
    street: '',
    locality: customerLocation.locality || '',
    landmark: '',
    city: customerLocation.cityName || BUSINESS_CONFIG.launchCity,
    district: 'NTR District',
    state: customerLocation.state || BUSINESS_CONFIG.launchState,
    pincode: profile?.defaultPincode || customerLocation.pincode || BUSINESS_CONFIG.operationsHub.pincode,
    lat: customerLocation.lat,
    lng: customerLocation.lng,
    formattedAddress: customerLocation.formattedAddress,
  });

  // Step 4: Delivery Options
  const [deliveryOption, setDeliveryOption] = useState<DeliveryOption>('STANDARD');

  // Step 5: Coupons
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');

  // Step 6: Payment Methods & Live Cart Revalidation
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [paymentOutcome, setPaymentOutcome] = useState<{
    status: 'failed' | 'cancelled';
    method: PaymentMethod;
    message: string;
    code?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [cartValidation, setCartValidation] = useState<CartRevalidationResponse | null>(null);
  const [validatingCart, setValidatingCart] = useState(false);
  const [cartRevalError, setCartRevalError] = useState('');

  useEffect(() => {
    if (items.length === 0) navigate('/cart');
  }, [items.length, navigate]);

  useEffect(() => {
    getServerConfigStatus().then(setServerConfig);
    fetchStoreSettings().then(setStoreSettings);
    fetchActiveCoupons().then(setAvailableCoupons).catch(() => {});
  }, []);

  useEffect(() => {
    if (profile) {
      if (!fullName) setFullName(profile.fullName || '');
      if (!mobile) setMobile(profile.mobile || '');
      if (!email) setEmail(profile.email || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'addresses'), where('userId', '==', user.uid))).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Address));
      setSavedAddresses(list);
      if (list.length > 0) {
        const def = list.find((a) => a.isDefault) || list[0];
        setSelectedAddressId(def.id);
      }
    });
    fetchOrCreateRewardAccount(user.uid, profile?.referralCode)
      .then(setRewardAccount)
      .catch(() => {});
  }, [user]);

  const activeAddress = useMemo(() => {
    if (selectedAddressId !== 'NEW' && !editingAddressId) {
      const found = savedAddresses.find((a) => a.id === selectedAddressId);
      if (found) return found;
    }
    return {
      ...addressForm,
      fullName: addressForm.recipientFullName || fullName,
      mobile: addressForm.recipientMobile || mobile,
    };
  }, [selectedAddressId, editingAddressId, savedAddresses, addressForm, fullName, mobile]);

  const startEditingAddress = (addr: Address) => {
    setAddressEditError('');
    setAddressFeedback('');
    setEditingAddressId(addr.id);
    setSelectedAddressId(addr.id);
    setAddressForm({
      label: addr.label,
      recipientFullName: addr.fullName,
      recipientMobile: addr.mobile,
      houseNo: addr.houseNo,
      street: addr.street,
      locality: addr.locality,
      landmark: addr.landmark || '',
      city: addr.city,
      district: addr.district,
      state: addr.state,
      pincode: addr.pincode,
      lat: addr.lat,
      lng: addr.lng,
      placeId: addr.placeId,
      formattedAddress: addr.formattedAddress,
    });
  };

  const resetToNewAddressForm = () => {
    setEditingAddressId(null);
    setAddressEditError('');
    setSelectedAddressId('NEW');
    setAddressForm({
      label: 'Home',
      recipientFullName: fullName || profile?.fullName || '',
      recipientMobile: mobile || profile?.mobile || '',
      houseNo: '',
      street: '',
      locality: customerLocation.locality || '',
      landmark: '',
      city: customerLocation.cityName || BUSINESS_CONFIG.launchCity,
      district: 'NTR District',
      state: customerLocation.state || BUSINESS_CONFIG.launchState,
      pincode: profile?.defaultPincode || customerLocation.pincode || BUSINESS_CONFIG.operationsHub.pincode,
      lat: customerLocation.lat,
      lng: customerLocation.lng,
      formattedAddress: customerLocation.formattedAddress,
    });
  };

  const handleSaveEditedAddress = async () => {
    if (!user || !editingAddressId) return;
    const existing = savedAddresses.find((a) => a.id === editingAddressId);
    if (!existing) return;

    setAddressEditError('');
    setAddressFeedback('');

    const recName = (addressForm.recipientFullName || fullName).trim();
    const recMobile = (addressForm.recipientMobile || mobile).trim();
    if (!recName) {
      setAddressEditError('Recipient full name is required.');
      return;
    }
    if (!isValidIndianMobile(recMobile)) {
      setAddressEditError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (
      !addressForm.houseNo.trim() ||
      !addressForm.street.trim() ||
      !addressForm.locality.trim() ||
      !addressForm.city.trim() ||
      !addressForm.district.trim() ||
      !addressForm.state.trim()
    ) {
      setAddressEditError('Please complete all required address fields.');
      return;
    }
    if (!isValidIndianPincode(addressForm.pincode)) {
      setAddressEditError('Enter a valid 6-digit Indian PIN code.');
      return;
    }

    const hasCoords =
      typeof addressForm.lat === 'number' &&
      !Number.isNaN(addressForm.lat) &&
      typeof addressForm.lng === 'number' &&
      !Number.isNaN(addressForm.lng);

    if (
      hasCoords &&
      (addressForm.lat! < -90 || addressForm.lat! > 90 || addressForm.lng! < -180 || addressForm.lng! > 180)
    ) {
      setAddressEditError('Latitude/Longitude values are out of valid range.');
      return;
    }

    const svc = evaluateLocationServiceability({
      location: {
        city: addressForm.city.trim(),
        state: addressForm.state,
        locality: addressForm.locality.trim(),
        formattedAddress:
          addressForm.formattedAddress ||
          `${addressForm.houseNo.trim()}, ${addressForm.street.trim()}, ${addressForm.locality.trim()}, ${addressForm.city.trim()}`,
        pincode: addressForm.pincode.trim(),
        lat: hasCoords ? addressForm.lat : undefined,
        lng: hasCoords ? addressForm.lng : undefined,
      },
      dataset,
    });

    const now = new Date().toISOString();
    const updatedPayload: Address = {
      id: existing.id,
      userId: existing.userId,
      label: addressForm.label,
      fullName: recName,
      mobile: recMobile,
      houseNo: addressForm.houseNo.trim(),
      street: addressForm.street.trim(),
      locality: addressForm.locality.trim(),
      ...(addressForm.landmark.trim() ? { landmark: addressForm.landmark.trim() } : {}),
      city: addressForm.city.trim(),
      district: addressForm.district.trim(),
      state: addressForm.state,
      pincode: addressForm.pincode.trim(),
      ...(hasCoords ? { lat: addressForm.lat, lng: addressForm.lng } : {}),
      ...(addressForm.placeId ? { placeId: addressForm.placeId } : {}),
      ...(addressForm.formattedAddress ? { formattedAddress: addressForm.formattedAddress } : {}),
      ...(svc.matchedZoneId ? { zoneId: svc.matchedZoneId } : {}),
      ...(typeof svc.matchedWardNumber === 'number' ? { wardNumber: svc.matchedWardNumber } : {}),
      isDefault: existing.isDefault,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    setSavingAddressEdit(true);
    try {
      const { id: _id, ...docData } = updatedPayload;
      await updateDoc(doc(db, 'addresses', existing.id), docData);
      setSavedAddresses((prev) => prev.map((a) => (a.id === existing.id ? updatedPayload : a)));
      setEditingAddressId(null);
      setSelectedAddressId(existing.id);
      setAddressFeedback(`${updatedPayload.label} address updated and selected for delivery.`);
    } catch (err: any) {
      setAddressEditError(err?.message || 'Unable to update saved address.');
    } finally {
      setSavingAddressEdit(false);
    }
  };

  const checkoutServiceability = useMemo(
    () =>
      evaluateLocationServiceability({
        location: {
          city: activeAddress.city,
          state: activeAddress.state,
          locality: activeAddress.locality,
          formattedAddress: activeAddress.formattedAddress,
          pincode: activeAddress.pincode,
          lat: activeAddress.lat,
          lng: activeAddress.lng,
        },
        dataset,
        subtotal,
      }),
    [activeAddress, dataset, subtotal]
  );

  const checkoutItemsSignature = useMemo(
    () => items.map((i) => `${getCartItemKey(i)}:${i.quantity}:${i.sellingPrice}`).join('|'),
    [items]
  );

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    setValidatingCart(true);
    setCartRevalError('');
    revalidateCartOnServer({
      items,
      location: {
        city: activeAddress.city,
        state: activeAddress.state,
        locality: activeAddress.locality,
        formattedAddress: activeAddress.formattedAddress,
        pincode: activeAddress.pincode,
        lat: activeAddress.lat,
        lng: activeAddress.lng,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setCartValidation(res);
        let hasDiff = false;
        const nextCart = items.map((cur) => {
          const vi = res.items.find((r) => getCartItemKey(r) === getCartItemKey(cur));
          if (!vi || !vi.available || vi.quantity <= 0) return cur;
          if (
            vi.quantity !== cur.quantity ||
            vi.sellingPrice !== cur.sellingPrice ||
            vi.originalPrice !== cur.originalPrice ||
            vi.maxStock !== cur.maxStock
          ) {
            hasDiff = true;
            return {
              ...cur,
              sellingPrice: vi.sellingPrice,
              originalPrice: vi.originalPrice,
              quantity: vi.quantity,
              maxStock: vi.maxStock,
            };
          }
          return cur;
        });
        if (hasDiff) {
          void syncValidatedItems(nextCart);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setCartRevalError(err?.message || 'Unable to verify cart availability with server.');
        }
      })
      .finally(() => {
        if (!cancelled) setValidatingCart(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    checkoutItemsSignature,
    activeAddress.city,
    activeAddress.state,
    activeAddress.locality,
    activeAddress.pincode,
    activeAddress.lat,
    activeAddress.lng,
  ]);

  const expressAvailable = useMemo(() => {
    const prefix = (activeAddress.pincode || '').slice(0, 2);
    const list = serverConfig?.expressMetroPrefixes || BUSINESS_CONFIG.expressMetroPrefixes;
    return list.includes(prefix);
  }, [activeAddress.pincode, serverConfig]);

  const deliveryFee = useMemo(() => {
    if (deliveryOption === 'EXPRESS' && expressAvailable) {
      return Math.max(checkoutServiceability.deliveryCharge, BUSINESS_CONFIG.expressShippingFee);
    }
    return checkoutServiceability.deliveryCharge;
  }, [deliveryOption, expressAvailable, checkoutServiceability.deliveryCharge]);

  const includedTax = useMemo(() => {
    return items.reduce((sum, i) => {
      const line = i.sellingPrice * i.quantity;
      return sum + Math.round((line * i.taxRatePercent) / (100 + i.taxRatePercent));
    }, 0);
  }, [items]);

  const taxableSubtotal = useMemo(
    () => Math.max(0, subtotal - includedTax),
    [subtotal, includedTax]
  );

  const couponDiscount = appliedCoupon?.discount || 0;

  useEffect(() => {
    if (!appliedCoupon) return;
    let cancelled = false;
    validateCouponOnServer(appliedCoupon.code, subtotal)
      .then((res) => {
        if (!cancelled) {
          setAppliedCoupon({ code: res.code, discount: res.discount });
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setAppliedCoupon(null);
          setCouponMsg(err?.message || `Coupon ${appliedCoupon.code} no longer applies.`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subtotal, appliedCoupon?.code]);

  const rewardCalc = useMemo(() => {
    const availPts = Math.max(0, rewardAccount?.pointsBalance || 0);
    if (!useRewards || availPts <= 0) {
      return { pointsToRedeem: 0, discount: 0, maxPointsAllowed: 0 };
    }
    const rupeePerPoint = Math.max(0.5, storeSettings.rupeePerPoint || 1);
    const maxPercent = Math.min(50, Math.max(0, storeSettings.maxRedeemPercent ?? 20));
    const netAfterCoupon = Math.max(0, subtotal - couponDiscount);
    const maxDiscount = Math.floor((netAfterCoupon * maxPercent) / 100);
    const maxPointsAllowed = Math.floor(maxDiscount / rupeePerPoint);
    let pointsToRedeem = Math.min(availPts, maxPointsAllowed);
    let discount = Math.round(pointsToRedeem * rupeePerPoint);
    if (paymentMethod !== 'COD') {
      const minLeft = subtotal - couponDiscount - discount + deliveryFee;
      if (minLeft < 1 && pointsToRedeem > 0) {
        const trimPts = Math.ceil((1 - minLeft) / rupeePerPoint);
        pointsToRedeem = Math.max(0, pointsToRedeem - trimPts);
        discount = Math.round(pointsToRedeem * rupeePerPoint);
      }
    }
    return { pointsToRedeem, discount, maxPointsAllowed };
  }, [useRewards, rewardAccount, storeSettings, subtotal, couponDiscount, deliveryFee, paymentMethod]);

  const finalPayable = Math.max(0, subtotal - couponDiscount - rewardCalc.discount + deliveryFee);

  const handleApplyCoupon = async (overrideCode?: string) => {
    const codeToTry = (overrideCode ?? couponInput).trim().toUpperCase();
    setCouponMsg('');
    if (!codeToTry) {
      setCouponMsg('Enter a coupon code to apply.');
      return;
    }
    try {
      const result = await validateCouponOnServer(codeToTry, subtotal);
      setCouponInput(result.code);
      setAppliedCoupon({ code: result.code, discount: result.discount });
      setCouponMsg(`Applied ${result.code}! You saved ${formatINR(result.discount)}.`);
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponMsg(err.message || 'Unable to apply coupon.');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMsg('');
  };

  const validateAllInputs = (): string | null => {
    if (isSuspended) return 'Your account is suspended. Contact support@cartzy.in.';
    if (!fullName.trim()) return 'Please enter your full name.';
    if (!isValidIndianMobile(mobile)) return 'Enter a valid 10-digit Indian mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (altMobile && !isValidIndianMobile(altMobile)) return 'Alternative mobile number must be 10 digits.';

    const a = activeAddress;
    if (!a.houseNo || !a.street || !a.locality || !a.city || !a.district || !a.state) {
      return 'Please complete all required delivery address fields.';
    }
    if (!isValidIndianPincode(a.pincode)) return 'Enter a valid 6-digit Indian PIN code.';
    if (!checkoutServiceability.deliverable) {
      return checkoutServiceability.message;
    }
    if (cartRevalError) {
      return cartRevalError;
    }
    if (cartValidation && !cartValidation.allItemsValid) {
      return 'One or more items in your cart are unavailable or out of stock. Update your cart first.';
    }
    if (paymentMethod === 'COD' && finalPayable > BUSINESS_CONFIG.maxCodAmount) {
      return `Cash on Delivery is available up to ${formatINR(BUSINESS_CONFIG.maxCodAmount)}.`;
    }
    return null;
  };

  const handlePlaceOrder = async () => {
    if (!user) {
      navigate('/login?next=/checkout');
      return;
    }
    setError('');
    const validationErr = validateAllInputs();
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setPlacing(true);
    try {
      const hasNewCoords =
        typeof addressForm.lat === 'number' &&
        !Number.isNaN(addressForm.lat) &&
        typeof addressForm.lng === 'number' &&
        !Number.isNaN(addressForm.lng);

      // Save address to customer account if requested (or update edited saved address first)
      if (editingAddressId) {
        await handleSaveEditedAddress();
      } else if (selectedAddressId === 'NEW' && saveThisAddress) {
        const newAddrPayload = {
          userId: user.uid,
          label: addressForm.label,
          fullName: (addressForm.recipientFullName || fullName).trim(),
          mobile: (addressForm.recipientMobile || mobile).trim(),
          ...(altMobile ? { altMobile: altMobile.trim() } : {}),
          houseNo: addressForm.houseNo.trim(),
          street: addressForm.street.trim(),
          locality: addressForm.locality.trim(),
          ...(addressForm.landmark ? { landmark: addressForm.landmark.trim() } : {}),
          city: addressForm.city.trim(),
          district: addressForm.district.trim(),
          state: addressForm.state,
          pincode: addressForm.pincode.trim(),
          ...(hasNewCoords ? { lat: addressForm.lat, lng: addressForm.lng } : {}),
          ...(addressForm.placeId ? { placeId: addressForm.placeId } : {}),
          ...(addressForm.formattedAddress ? { formattedAddress: addressForm.formattedAddress } : {}),
          isDefault: savedAddresses.length === 0,
          createdAt: new Date().toISOString(),
        };
        const createdAddrRef = await addDoc(collection(db, 'addresses'), newAddrPayload);
        setSavedAddresses((prev) => [{ id: createdAddrRef.id, ...newAddrPayload }, ...prev]);
        setSelectedAddressId(createdAddrRef.id);
      }

      const activeHasCoords =
        typeof activeAddress.lat === 'number' &&
        !Number.isNaN(activeAddress.lat) &&
        typeof activeAddress.lng === 'number' &&
        !Number.isNaN(activeAddress.lng);

      const payload: CheckoutInput = {
        idempotencyKey,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          ...(i.selectedSize ? { selectedSize: i.selectedSize } : {}),
          ...(i.selectedColor ? { selectedColor: i.selectedColor } : {}),
        })),
        customerInfo: {
          fullName: fullName.trim(),
          mobile: mobile.trim(),
          email: email.trim(),
          ...(altMobile ? { altMobile: altMobile.trim() } : {}),
        },
        deliveryAddress: {
          label: activeAddress.label || 'Home',
          fullName: activeAddress.fullName || fullName.trim(),
          mobile: activeAddress.mobile || mobile.trim(),
          houseNo: activeAddress.houseNo.trim(),
          street: activeAddress.street.trim(),
          locality: activeAddress.locality.trim(),
          landmark: activeAddress.landmark?.trim() || '',
          city: activeAddress.city.trim(),
          district: activeAddress.district.trim(),
          state: activeAddress.state,
          pincode: activeAddress.pincode.trim(),
          ...(activeHasCoords ? { lat: activeAddress.lat, lng: activeAddress.lng } : {}),
          ...(activeAddress.placeId ? { placeId: activeAddress.placeId } : {}),
          ...(activeAddress.formattedAddress ? { formattedAddress: activeAddress.formattedAddress } : {}),
        },
        deliveryOption: deliveryOption === 'EXPRESS' && expressAvailable ? 'EXPRESS' : 'STANDARD',
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        ...(rewardCalc.pointsToRedeem > 0 ? { pointsToRedeem: rewardCalc.pointsToRedeem } : {}),
        paymentMethod,
      };

      // Step 1: Server-side validation & recalculation
      const serverComputed = await validateCheckoutOnServer(payload);

      if (paymentMethod === 'COD') {
        const order = await commitOrderTransaction({
          userId: user.uid,
          payload,
          serverComputed,
        });
        await clearCart();
        navigate(`/order-success/${order.id}`, { state: { order } });
        return;
      }

      setPaymentOutcome(null);

      // Online payment flow via Razorpay (never marked paid without verified server signature)
      const token = await user.getIdToken();
      const createRes = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const rzpData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(rzpData.error || 'Online payment gateway is not configured.');
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Unable to load Razorpay payment script.');

      let attemptId: string | undefined;
      try {
        attemptId = await recordPaymentAttempt({
          userId: user.uid,
          idempotencyKey,
          customerName: fullName.trim(),
          customerEmail: email.trim(),
          method: paymentMethod,
          amount: Number(rzpData.computed?.pricing?.finalAmount ?? finalPayable),
          razorpayOrderId: rzpData.razorpayOrderId,
          status: 'Initiated',
        });
      } catch {
        attemptId = undefined;
      }

      const rzpMethodKey =
        paymentMethod === 'UPI'
          ? 'upi'
          : paymentMethod === 'CARD'
          ? 'card'
          : paymentMethod === 'NETBANKING'
          ? 'netbanking'
          : 'wallet';

      let paymentSettled = false;

      const options = {
        key: rzpData.keyId,
        amount: rzpData.amount,
        currency: rzpData.currency,
        name: 'CARTZY',
        description: 'Shop Smart. Live Better.',
        order_id: rzpData.razorpayOrderId,
        prefill: {
          name: fullName.trim(),
          email: email.trim(),
          contact: mobile.trim(),
        },
        config: {
          display: {
            blocks: {
              preferred: {
                name: `Pay via ${paymentMethod}`,
                instruments: [{ method: rzpMethodKey }],
              },
            },
            sequence: ['block.preferred', 'block.other'],
            preferences: { show_default_blocks: true },
          },
        },
        theme: { color: '#14213D' },
        handler: async (response: any) => {
          paymentSettled = true;
          try {
            const freshToken = await user.getIdToken();
            const verifyRes = await fetch('/api/payments/razorpay/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              body: JSON.stringify(response),
            });
            const verifyJson = await verifyRes.json();
            if (!verifyRes.ok || !verifyJson.verified) {
              throw new Error(verifyJson.error || 'Razorpay signature verification failed.');
            }

            const order = await commitOrderTransaction({
              userId: user.uid,
              payload,
              serverComputed: rzpData.computed,
              razorpayOrderId: verifyJson.razorpayOrderId,
              razorpayPaymentId: verifyJson.razorpayPaymentId,
              paymentAttemptId: attemptId,
            });
            await clearCart();
            navigate(`/order-success/${order.id}`, { state: { order } });
          } catch (vErr: any) {
            const reason = vErr?.message || 'Payment verification failed.';
            if (attemptId) {
              await updatePaymentAttempt({
                paymentAttemptId: attemptId,
                status: 'Failed',
                failureReason: reason,
                razorpayPaymentId: response?.razorpay_payment_id,
              });
            }
            setPaymentOutcome({
              status: 'failed',
              method: paymentMethod,
              message: reason,
              razorpayOrderId: rzpData.razorpayOrderId,
              razorpayPaymentId: response?.razorpay_payment_id,
            });
            setError(reason);
            setIdempotencyKey(crypto.randomUUID());
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: async () => {
            if (paymentSettled) return;
            paymentSettled = true;
            const cancelMsg =
              'Payment window was closed before completing payment. Your cart and delivery details are safe — retry anytime.';
            if (attemptId) {
              await updatePaymentAttempt({
                paymentAttemptId: attemptId,
                status: 'Cancelled',
                failureReason: 'Customer closed Razorpay checkout modal before payment completion',
              });
            }
            setPaymentOutcome({
              status: 'cancelled',
              method: paymentMethod,
              message: cancelMsg,
              razorpayOrderId: rzpData.razorpayOrderId,
            });
            setError(cancelMsg);
            setIdempotencyKey(crypto.randomUUID());
            setPlacing(false);
          },
        },
      };

      const rzpInstance = new window.Razorpay(options);
      if (typeof rzpInstance.on === 'function') {
        rzpInstance.on('payment.failed', async (failResp: any) => {
          paymentSettled = true;
          const failMsg =
            failResp?.error?.description ||
            failResp?.error?.reason ||
            'Payment could not be completed. Please retry or choose Cash on Delivery.';
          const failPayId = failResp?.error?.metadata?.payment_id;
          if (attemptId) {
            await updatePaymentAttempt({
              paymentAttemptId: attemptId,
              status: 'Failed',
              failureReason: failMsg,
              ...(failPayId ? { razorpayPaymentId: String(failPayId) } : {}),
            });
          }
          setPaymentOutcome({
            status: 'failed',
            method: paymentMethod,
            message: failMsg,
            code: failResp?.error?.code,
            razorpayOrderId: rzpData.razorpayOrderId,
            ...(failPayId ? { razorpayPaymentId: String(failPayId) } : {}),
          });
          setError(failMsg);
          setIdempotencyKey(crypto.randomUUID());
          setPlacing(false);
        });
      }
      rzpInstance.open();
    } catch (err: any) {
      setError(err.message || 'Unable to place order.');
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-5 md:py-8 pb-24 md:pb-10 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
      <div className="lg:col-span-2 space-y-5 sm:space-y-6 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-[#14213D]">Secure Checkout</h1>

        {/* Step 2: Customer Information */}
        <section className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200">
          <h2 className="font-bold text-[#14213D] mb-4">1. Customer Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Full Name *</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aarav Sharma"
                className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Mobile Number (10 digits) *</label>
              <input
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="9876543210"
                className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Alternative Phone (Optional)</label>
              <input
                maxLength={10}
                value={altMobile}
                onChange={(e) => setAltMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile"
                className="w-full mt-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
              />
            </div>
          </div>
        </section>

        {/* Step 3: Delivery Address */}
        <section className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-bold text-[#14213D]">2. Delivery Address</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedAddressId('NEW');
                  setAddressForm((prev) => ({
                    ...prev,
                    locality: customerLocation.locality || prev.locality,
                    city: customerLocation.cityName || BUSINESS_CONFIG.launchCity,
                    state: customerLocation.state || BUSINESS_CONFIG.launchState,
                    pincode: customerLocation.pincode || prev.pincode,
                    lat: customerLocation.lat,
                    lng: customerLocation.lng,
                    formattedAddress: customerLocation.formattedAddress,
                  }));
                }}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-[#14213D] text-xs font-semibold cursor-pointer"
              >
                Use Header Area ({customerLocation.locality})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedAddressId('NEW');
                  setLocationPickerOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                Select Delivery Location
              </button>
            </div>
          </div>

          {/* Live Vijayawada City-Wide Serviceability Check */}
          <div
            className={`mb-4 p-3.5 rounded-xl border text-xs space-y-1.5 ${
              checkoutServiceability.deliverable
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold inline-flex items-center gap-1.5">
                {checkoutServiceability.deliverable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                Vijayawada Serviceability Check ·{' '}
                {checkoutServiceability.withinBoundary ? 'Within VMC Boundary' : 'Outside Boundary'}
              </span>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                {checkoutServiceability.matchedZoneName && (
                  <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-[#14213D]">
                    {checkoutServiceability.matchedZoneName}
                  </span>
                )}
                {checkoutServiceability.matchedWardNumber && (
                  <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-[#14213D]">
                    Ward #{checkoutServiceability.matchedWardNumber}
                  </span>
                )}
              </div>
            </div>
            <p>{checkoutServiceability.message}</p>
            <div className="flex flex-wrap items-center gap-4 text-[11px] opacity-90">
              <span>
                Open Shops: <strong>{checkoutServiceability.availableShopIds.length}</strong>
              </span>
              <span>
                Online Delivery Partners: <strong>{checkoutServiceability.onlineDriverCount}</strong>
              </span>
              <span>
                Min Order: <strong>{formatINR(checkoutServiceability.minOrderAmount)}</strong>
              </span>
            </div>
          </div>

          {serverConfig && !getBrowserMapsApiKey(serverConfig.googleMapsApiKey) && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Google Maps credentials (<code>VITE_GOOGLE_MAPS_API_KEY</code>) are not configured yet. You can still enter your complete delivery address manually below.
              </span>
            </div>
          )}

          {addressFeedback && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {addressFeedback}
              </span>
              <button
                type="button"
                onClick={() => setAddressFeedback('')}
                className="text-emerald-700 hover:text-emerald-950 font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {savedAddresses.length > 0 && (
            <div className="space-y-2.5 mb-4">
              {savedAddresses.map((addr) => (
                <div
                  key={addr.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                    selectedAddressId === addr.id
                      ? 'border-[#2563EB] bg-blue-50/40'
                      : 'border-slate-200'
                  }`}
                >
                  <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="radio"
                      checked={selectedAddressId === addr.id}
                      onChange={() => {
                        setSelectedAddressId(addr.id);
                        if (editingAddressId && editingAddressId !== addr.id) {
                          setEditingAddressId(null);
                          setAddressEditError('');
                        }
                      }}
                      className="mt-1 shrink-0"
                    />
                    <div className="text-sm flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#14213D]">{addr.label}</span> — {addr.fullName} (
                        <span className="font-mono">{addr.mobile}</span>)
                        {addr.isDefault && (
                          <span className="text-[10px] font-bold text-[#2563EB] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                            Default
                          </span>
                        )}
                        {typeof addr.lat === 'number' && typeof addr.lng === 'number' && (
                          <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            GPS Pin ({addr.lat.toFixed(4)}, {addr.lng.toFixed(4)})
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        {addr.houseNo}, {addr.street}, {addr.locality}
                        {addr.landmark ? `, ${addr.landmark}` : ''}, {addr.city}, {addr.district},{' '}
                        {addr.state} - <strong className="font-mono">{addr.pincode}</strong>
                      </p>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => startEditingAddress(addr)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#14213D] text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm font-semibold text-[#2563EB] cursor-pointer pt-1">
                <input
                  type="radio"
                  checked={selectedAddressId === 'NEW' && !editingAddressId}
                  onChange={resetToNewAddressForm}
                />
                + Add a new delivery address
              </label>
            </div>
          )}

          {(selectedAddressId === 'NEW' || editingAddressId !== null) && (
            <div className="space-y-4">
              {editingAddressId && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#14213D]">
                    Editing Saved Address ({addressForm.label})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAddressId(null);
                      setAddressEditError('');
                    }}
                    className="font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                </div>
              )}
              {typeof addressForm.lat === 'number' && typeof addressForm.lng === 'number' && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                      Confirmed Delivery Pin:{' '}
                      <span className="font-mono">
                        {addressForm.lat.toFixed(6)}, {addressForm.lng.toFixed(6)}
                      </span>
                    </p>
                    {addressForm.formattedAddress && (
                      <p className="text-emerald-800 mt-0.5">{addressForm.formattedAddress}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLocationPickerOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 font-semibold hover:bg-emerald-100"
                    >
                      Adjust Pin
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAddressForm((prev) => ({
                          ...prev,
                          lat: undefined,
                          lng: undefined,
                          placeId: undefined,
                          formattedAddress: undefined,
                        }))
                      }
                      className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-red-600 font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                {editingAddressId && (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Recipient Name *
                      </label>
                      <input
                        placeholder="Recipient Full Name"
                        value={addressForm.recipientFullName}
                        onChange={(e) =>
                          setAddressForm({ ...addressForm, recipientFullName: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Recipient 10-Digit Mobile *
                      </label>
                      <input
                        maxLength={10}
                        placeholder="9876543210"
                        value={addressForm.recipientMobile}
                        onChange={(e) =>
                          setAddressForm({
                            ...addressForm,
                            recipientMobile: e.target.value.replace(/\D/g, ''),
                          })
                        }
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Address Type
                  </label>
                  <select
                    value={addressForm.label}
                    onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
                  >
                    <option value="Home">Home</option>
                    <option value="Work">Work</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    House / Building / Flat No. *
                  </label>
                  <input
                    placeholder="e.g. Flat 302, Sai Towers"
                    value={addressForm.houseNo}
                    onChange={(e) => setAddressForm({ ...addressForm, houseNo: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Street Name *
                  </label>
                  <input
                    placeholder="e.g. MG Road"
                    value={addressForm.street}
                    onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Area / Locality *
                  </label>
                  <input
                    placeholder="e.g. Bhavanipuram"
                    value={addressForm.locality}
                    onChange={(e) => setAddressForm({ ...addressForm, locality: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Landmark (Optional)
                  </label>
                  <input
                    placeholder="Near popular junction or temple"
                    value={addressForm.landmark}
                    onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    City / Town *
                  </label>
                  <input
                    placeholder="Vijayawada"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    District *
                  </label>
                  <input
                    placeholder="NTR District"
                    value={addressForm.district}
                    onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    State *
                  </label>
                  <select
                    value={addressForm.state}
                    onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    6-Digit PIN Code *
                  </label>
                  <input
                    maxLength={6}
                    placeholder="e.g. 520012"
                    value={addressForm.pincode}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, pincode: e.target.value.replace(/\D/g, '') })
                    }
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
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
                      value={addressForm.lat ?? ''}
                      onChange={(e) =>
                        setAddressForm({
                          ...addressForm,
                          lat: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-mono"
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
                      value={addressForm.lng ?? ''}
                      onChange={(e) =>
                        setAddressForm({
                          ...addressForm,
                          lng: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-mono"
                    />
                  </div>
                </div>
                {editingAddressId ? (
                  <div className="sm:col-span-2 space-y-2 pt-1">
                    {addressEditError && (
                      <p className="text-xs text-red-600 font-medium">{addressEditError}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingAddressEdit}
                        onClick={handleSaveEditedAddress}
                        className="px-4 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                      >
                        {savingAddressEdit ? 'Saving Changes...' : 'Save Address Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddressId(null);
                          setAddressEditError('');
                        }}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={saveThisAddress}
                      onChange={(e) => setSaveThisAddress(e.target.checked)}
                    />
                    Save this address to my CARTZY account for future purchases
                  </label>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Step 4: Delivery Options */}
        <section className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200">
          <h2 className="font-bold text-[#14213D] mb-4">3. Delivery Options</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`p-4 rounded-xl border cursor-pointer flex items-start gap-3 ${
                deliveryOption === 'STANDARD'
                  ? 'border-[#2563EB] bg-blue-50/40'
                  : 'border-slate-200'
              }`}
            >
              <input
                type="radio"
                checked={deliveryOption === 'STANDARD'}
                onChange={() => setDeliveryOption('STANDARD')}
                className="mt-1"
              />
              <div>
                <p className="font-semibold text-sm flex items-center gap-1.5 text-[#14213D]">
                  <Truck className="w-4 h-4 text-[#2563EB]" /> City-Wide Standard Delivery
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {checkoutServiceability.estimatedDeliveryText || 'Same-day Vijayawada delivery'}
                </p>
                <p className="text-xs font-bold text-emerald-700 mt-1">
                  {subtotal >= checkoutServiceability.freeDeliveryThreshold
                    ? `FREE (Orders ₹${checkoutServiceability.freeDeliveryThreshold}+)`
                    : formatINR(checkoutServiceability.deliveryCharge)}
                </p>
              </div>
            </label>

            <label
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                !expressAvailable
                  ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200'
                  : deliveryOption === 'EXPRESS'
                  ? 'border-[#2563EB] bg-blue-50/40 cursor-pointer'
                  : 'border-slate-200 cursor-pointer'
              }`}
            >
              <input
                type="radio"
                disabled={!expressAvailable}
                checked={deliveryOption === 'EXPRESS' && expressAvailable}
                onChange={() => setDeliveryOption('EXPRESS')}
                className="mt-1"
              />
              <div>
                <p className="font-semibold text-sm text-[#14213D]">Express Vijayawada Slot</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {expressAvailable
                    ? 'Priority dispatch from Bhavanipuram / nearest Vijayawada zone hub'
                    : 'Available for Vijayawada 520xxx PINs and express metro corridors'}
                </p>
                <p className="text-xs font-bold text-[#14213D] mt-1">
                  {formatINR(Math.max(checkoutServiceability.deliveryCharge, BUSINESS_CONFIG.expressShippingFee))}
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Step 6: Payment Methods */}
        <section className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-bold text-[#14213D]">4. Payment Method</h2>
            {serverConfig?.razorpayConfigured && (
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${
                  serverConfig.razorpayMode === 'test'
                    ? 'bg-blue-50 text-[#2563EB] border-blue-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                Razorpay {serverConfig.razorpayMode === 'test' ? 'Test Mode Active' : 'Live Mode Active'}
              </span>
            )}
          </div>

          {serverConfig && !serverConfig.razorpayConfigured && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                Online payments (UPI, Cards, Wallets, Net Banking) require <code>RAZORPAY_KEY_ID</code> and{' '}
                <code>RAZORPAY_KEY_SECRET</code> configured in your server environment. Cash on Delivery is active for testing and live orders.
              </span>
            </div>
          )}

          <div className="space-y-2.5">
            {[
              { id: 'COD', label: 'Cash on Delivery (COD)', icon: Banknote, online: false },
              { id: 'UPI', label: 'UPI (GPay, PhonePe, Paytm, BHIM via Razorpay)', icon: CreditCard, online: true },
              { id: 'CARD', label: 'Credit / Debit Card (Visa, Mastercard, RuPay)', icon: CreditCard, online: true },
              { id: 'NETBANKING', label: 'Net Banking (Major Indian Banks)', icon: ShieldCheck, online: true },
              { id: 'WALLET', label: 'Supported Wallets (Paytm, PhonePe, Amazon Pay, Mobikwik)', icon: Wallet, online: true },
            ].map((m) => (
              <label
                key={m.id}
                className={`flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl border cursor-pointer ${
                  paymentMethod === m.id ? 'border-[#2563EB] bg-blue-50/40' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="radio"
                    checked={paymentMethod === m.id}
                    onChange={() => setPaymentMethod(m.id as PaymentMethod)}
                    className="shrink-0"
                  />
                  <m.icon className="w-4 h-4 text-[#14213D] shrink-0" />
                  <span className="text-sm font-medium text-[#1F2937] break-words">{m.label}</span>
                </div>
                {m.online && serverConfig && !serverConfig.razorpayConfigured && (
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                    Credentials required
                  </span>
                )}
              </label>
            ))}
          </div>
        </section>
      </div>

      {/* Step 5 & 7: Order Summary + Place Order */}
      <aside className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 h-fit lg:sticky lg:top-24 space-y-5">
        <h2 className="font-bold text-lg text-[#14213D]">Order Summary</h2>

        <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
          {items.map((item) => (
            <div key={getCartItemKey(item)} className="flex items-center gap-3 text-sm">
              <SafeImage
                src={item.image}
                alt={item.name}
                className="w-12 h-12 rounded-lg object-cover bg-slate-50 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-[#1F2937]">{item.name}</p>
                <p className="text-xs text-slate-500">
                  Qty: {item.quantity}
                  {item.selectedSize || item.selectedColor
                    ? ` · ${[item.selectedSize, item.selectedColor].filter(Boolean).join(', ')}`
                    : ''}
                </p>
              </div>
              <span className="font-semibold font-mono tabular-nums">
                {formatINR(item.sellingPrice * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              placeholder="Coupon (e.g. WELCOME10)"
              className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs uppercase font-mono"
            />
            {appliedCoupon ? (
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleApplyCoupon()}
                className="px-4 py-2 rounded-xl bg-[#14213D] text-white text-xs font-semibold hover:bg-[#2563EB] cursor-pointer"
              >
                Apply
              </button>
            )}
          </div>
          {couponMsg && (
            <p className={`text-xs mt-1.5 ${appliedCoupon ? 'text-emerald-700 font-medium' : 'text-red-600'}`}>
              {couponMsg}
            </p>
          )}
          {!appliedCoupon && availableCoupons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {availableCoupons.slice(0, 3).map((c) => (
                <button
                  key={c.id || c.code}
                  type="button"
                  onClick={() => handleApplyCoupon(c.code)}
                  className="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-[#14213D] hover:text-[#2563EB] border border-slate-200 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Tag className="w-3 h-3 text-[#FCA311]" />
                  {c.code} ({c.type === 'PERCENT' ? `${c.value}% OFF` : `₹${c.value} OFF`})
                </button>
              ))}
            </div>
          )}
        </div>

        {rewardAccount && rewardAccount.pointsBalance > 0 && (
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={useRewards}
              onChange={(e) => setUseRewards(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="font-bold text-[#14213D]">
                Redeem CARTZY Rewards ({rewardAccount.pointsBalance} pts available)
              </p>
              <p className="text-slate-500 mt-0.5">
                {useRewards && rewardCalc.discount > 0
                  ? `Applying ${rewardCalc.pointsToRedeem} pts for ${formatINR(rewardCalc.discount)} instant off (up to ${storeSettings.maxRedeemPercent}% of order).`
                  : `Use up to ${storeSettings.maxRedeemPercent}% of subtotal via reward points.`}
              </p>
            </div>
          </label>
        )}

        <div className="space-y-2 text-sm border-t pt-4">
          <div className="flex justify-between">
            <span className="text-slate-600">Total MRP</span>
            <span className="font-mono tabular-nums">{formatINR(mrpTotal)}</span>
          </div>
          <div className="flex justify-between text-emerald-700">
            <span>Product Savings</span>
            <span className="font-mono tabular-nums">- {formatINR(Math.max(0, mrpTotal - subtotal))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Items Subtotal</span>
            <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
          </div>
          {couponDiscount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Coupon ({appliedCoupon?.code})</span>
              <span className="font-mono tabular-nums">- {formatINR(couponDiscount)}</span>
            </div>
          )}
          {rewardCalc.discount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>CARTZY Rewards ({rewardCalc.pointsToRedeem} pts)</span>
              <span className="font-mono tabular-nums">- {formatINR(rewardCalc.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-600">Delivery Charges</span>
            <span className="font-mono tabular-nums">
              {deliveryFee === 0 ? (
                <span className="text-emerald-700 font-semibold">FREE</span>
              ) : (
                formatINR(deliveryFee)
              )}
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Platform &amp; Handling Fee</span>
            <span className="text-emerald-700 font-semibold font-mono">FREE (₹0)</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Taxable Value (Excl. GST)</span>
            <span className="font-mono tabular-nums">{formatINR(taxableSubtotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Included GST (CGST + SGST)</span>
            <span className="font-mono tabular-nums">{formatINR(includedTax)}</span>
          </div>
          <div className="border-t pt-3 flex justify-between font-extrabold text-lg text-[#14213D]">
            <span>Final Payable</span>
            <span className="font-mono tabular-nums">{formatINR(finalPayable)}</span>
          </div>
        </div>

        {!checkoutServiceability.deliverable && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>{checkoutServiceability.message}</span>
          </div>
        )}

        {cartValidation && !cartValidation.allItemsValid && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2">
            <div className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>Some cart items are unavailable for this address or out of stock:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px]">
              {cartValidation.items
                .filter((vi) => !vi.available || !vi.deliverableToArea)
                .map((vi) => (
                  <li key={getCartItemKey(vi)}>
                    <strong>{vi.name}</strong>: {vi.unavailableReason || 'Unavailable'}
                  </li>
                ))}
            </ul>
            <Link
              to="/cart"
              className="inline-block px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-[11px]"
            >
              Return to Cart to Update
            </Link>
          </div>
        )}

        {paymentOutcome && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2">
            <div className="flex items-start gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                {paymentOutcome.status === 'cancelled'
                  ? 'Payment Cancelled Before Completion'
                  : 'Payment Failed'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">{paymentOutcome.message}</p>
            {(paymentOutcome.razorpayOrderId || paymentOutcome.razorpayPaymentId) && (
              <p className="text-[10px] font-mono text-red-700 break-all">
                Ref: {paymentOutcome.razorpayPaymentId || paymentOutcome.razorpayOrderId}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={placing}
                onClick={handlePlaceOrder}
                className="px-3 py-1.5 rounded-lg bg-[#14213D] text-white font-bold text-[11px] inline-flex items-center gap-1 hover:bg-[#2563EB] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Retry {paymentMethod} Payment
              </button>
              {paymentMethod !== 'COD' && finalPayable <= BUSINESS_CONFIG.maxCodAmount && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('COD');
                    setPaymentOutcome(null);
                    setError('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-800 font-bold text-[11px] hover:bg-red-100 cursor-pointer"
                >
                  Switch to Cash on Delivery
                </button>
              )}
            </div>
          </div>
        )}

        {(error || cartRevalError) && !paymentOutcome && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {error || cartRevalError}
          </div>
        )}

        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={
            placing ||
            validatingCart ||
            !checkoutServiceability.deliverable ||
            Boolean(cartRevalError) ||
            Boolean(cartValidation && !cartValidation.allItemsValid)
          }
          className="w-full py-4 px-6 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          <Check className="w-4 h-4" />
          {placing
            ? 'Validating & Placing Order...'
            : validatingCart
            ? 'Verifying Live Stock & Area...'
            : !checkoutServiceability.deliverable
            ? 'Delivery Unavailable for Selected Address'
            : cartValidation && !cartValidation.allItemsValid
            ? 'Update Unavailable Cart Items First'
            : paymentMethod === 'COD'
            ? `Place COD Order (${formatINR(finalPayable)})`
            : `Pay Securely (${formatINR(finalPayable)})`}
        </button>
      </aside>

      <DeliveryLocationPicker
        isOpen={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        apiKey={getBrowserMapsApiKey(serverConfig?.googleMapsApiKey)}
        initialLocation={
          typeof addressForm.lat === 'number' && typeof addressForm.lng === 'number'
            ? { lat: addressForm.lat, lng: addressForm.lng }
            : null
        }
        onConfirm={(resolved: ParsedGoogleAddress) => {
          if (!editingAddressId) {
            setSelectedAddressId('NEW');
          }
          setAddressForm((prev) => ({
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
