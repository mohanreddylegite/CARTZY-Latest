import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AppNotification,
  CartItem,
  CartRevalidationResponse,
  Category,
  Coupon,
  DeliveryOption,
  FlashSale,
  Order,
  OrderSecret,
  OrderStatus,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Product,
  Review,
  RewardAccount,
  RewardTransaction,
  ServerConfigStatus,
  StoreSettings,
  SupportTicket,
} from '../types';
import {
  STARTER_CATEGORIES,
  STARTER_COUPONS,
  STARTER_FLASH_SALES,
  STARTER_PRODUCTS,
} from '../data/starterCatalog';

const RECENTLY_VIEWED_KEY = 'cartzy_recently_viewed_v1';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  id: 'store',
  earnPointsPer100: 1,
  rupeePerPoint: 1,
  maxRedeemPercent: 20,
  referralBonusPoints: 100,
  defaultSellerCommissionPercent: 10,
  promoBannerText: '',
  promoBannerActive: false,
  updatedAt: new Date(0).toISOString(),
};

export function getRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function appendRecentlyViewed(productId: string): string[] {
  if (!productId) return [];
  try {
    const current = getRecentlyViewedIds().filter((id) => id !== productId);
    const next = [productId, ...current].slice(0, 8);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export async function getServerConfigStatus(): Promise<ServerConfigStatus> {
  const res = await fetch('/api/config/status');
  if (!res.ok) {
    return {
      razorpayConfigured: false,
      razorpayKeyId: null,
      razorpayMode: null,
      smtpConfigured: false,
      googleMapsConfigured: false,
      googleMapsApiKey: null,
      expressMetroPrefixes: ['11', '40', '56', '60', '50', '70', '41', '38'],
      freeShippingThreshold: 499,
      maxCodAmount: 50000,
    };
  }
  return res.json();
}

export async function fetchStoreSettings(): Promise<StoreSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'store'));
    if (snap.exists()) {
      return { ...DEFAULT_STORE_SETTINGS, ...(snap.data() as Partial<StoreSettings>), id: 'store' };
    }
    return DEFAULT_STORE_SETTINGS;
  } catch {
    return DEFAULT_STORE_SETTINGS;
  }
}

export async function seedInitialCatalog(): Promise<{ categories: number; products: number; coupons: number }> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  for (const cat of STARTER_CATEGORIES) {
    const { id: _id, ...catData } = cat;
    batch.set(doc(db, 'categories', cat.slug), catData, { merge: true });
  }
  for (const prod of STARTER_PRODUCTS) {
    const { id: _id, ...prodData } = prod;
    batch.set(
      doc(db, 'products', prod.id),
      { ...prodData, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }
  for (const coupon of STARTER_COUPONS) {
    const { id: _id, ...couponData } = coupon;
    batch.set(doc(db, 'coupons', coupon.id), couponData, { merge: true });
  }
  for (const sale of STARTER_FLASH_SALES) {
    const { id: _id, ...saleData } = sale;
    batch.set(
      doc(db, 'flashSales', sale.id),
      { ...saleData, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }

  try {
    await batch.commit();
    return {
      categories: STARTER_CATEGORIES.length,
      products: STARTER_PRODUCTS.length,
      coupons: STARTER_COUPONS.length,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'categories/products/coupons/flashSales');
  }
}

export function normalizeCategoryKey(categoryId?: string): string {
  const clean = String(categoryId || '').trim().toLowerCase();
  if (clean === 'shoes' || clean === 'footwear') return 'footwear';
  if (clean === 'grocery' || clean === 'groceries') return 'groceries';
  return clean;
}

export async function fetchActiveCategories(): Promise<Category[]> {
  try {
    const anySnap = await getDocs(query(collection(db, 'categories'), limit(1)));
    if (anySnap.empty) {
      return STARTER_CATEGORIES;
    }
    const snap = await getDocs(
      query(collection(db, 'categories'), where('active', '==', true))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Category))
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  } catch (error) {
    console.warn('Using local categories fallback:', error);
    return STARTER_CATEGORIES;
  }
}

export async function fetchAllCategoriesAdmin(): Promise<Category[]> {
  const snap = await getDocs(collection(db, 'categories'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Category))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

export async function fetchActiveProducts(maxItems = 80): Promise<Product[]> {
  try {
    const anySnap = await getDocs(query(collection(db, 'products'), limit(1)));
    if (anySnap.empty) {
      return STARTER_PRODUCTS.slice(0, maxItems);
    }
    const snap = await getDocs(
      query(collection(db, 'products'), where('active', '==', true), limit(maxItems))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Product))
      .filter((p) => !p.approvalStatus || p.approvalStatus === 'Approved');
  } catch (error) {
    console.warn('Using local products fallback:', error);
    return STARTER_PRODUCTS.slice(0, maxItems);
  }
}

export async function fetchProductById(productId: string): Promise<Product | null> {
  try {
    const snap = await getDoc(doc(db, 'products', productId));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Product;
    }
    const anySnap = await getDocs(query(collection(db, 'products'), limit(1)));
    if (anySnap.empty) {
      return STARTER_PRODUCTS.find((p) => p.id === productId) || null;
    }
    return null;
  } catch (error) {
    console.warn('Using local product detail fallback:', error);
    return STARTER_PRODUCTS.find((p) => p.id === productId) || null;
  }
}

export async function fetchProductsByIds(productIds: string[]): Promise<Map<string, Product>> {
  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
  const result = new Map<string, Product>();
  if (uniqueIds.length === 0) return result;

  try {
    const anySnap = await getDocs(query(collection(db, 'products'), limit(1)));
    const initialized = !anySnap.empty;

    const docs = await Promise.all(
      uniqueIds.map((pid) => getDoc(doc(db, 'products', pid)).catch(() => null))
    );
    docs.forEach((snap, idx) => {
      const pid = uniqueIds[idx];
      if (snap && snap.exists()) {
        result.set(pid, { id: snap.id, ...snap.data() } as Product);
      } else if (!initialized) {
        const starter = STARTER_PRODUCTS.find((p) => p.id === pid);
        if (starter) result.set(pid, starter);
      }
    });
    return result;
  } catch {
    uniqueIds.forEach((pid) => {
      const starter = STARTER_PRODUCTS.find((p) => p.id === pid);
      if (starter) result.set(pid, starter);
    });
    return result;
  }
}

export async function revalidateCartOnServer(params: {
  items: CartItem[];
  location?: {
    city?: string;
    state?: string;
    locality?: string;
    formattedAddress?: string;
    pincode?: string;
    lat?: number;
    lng?: number;
    zoneId?: string;
    wardNumber?: number;
  };
}): Promise<CartRevalidationResponse> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  const res = await fetch('/api/cart/revalidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Unable to revalidate cart right now.');
  }
  return data as CartRevalidationResponse;
}

export async function fetchActiveCoupons(): Promise<Coupon[]> {
  try {
    const snap = await getDocs(query(collection(db, 'coupons'), where('active', '==', true)));
    const cloud = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coupon));
    if (cloud.length > 0) return cloud;
    return STARTER_COUPONS.filter((c) => c.active);
  } catch {
    return STARTER_COUPONS.filter((c) => c.active);
  }
}

export async function fetchOrCreateRewardAccount(
  userId: string,
  referralCodeHint?: string
): Promise<RewardAccount> {
  const refDoc = doc(db, 'rewards', userId);
  try {
    const snap = await getDoc(refDoc);
    if (snap.exists()) {
      return snap.data() as RewardAccount;
    }
    const now = new Date().toISOString();
    const initial: RewardAccount = {
      userId,
      pointsBalance: 0,
      totalEarned: 0,
      totalRedeemed: 0,
      referralCode: referralCodeHint || `CZ${userId.slice(0, 6).toUpperCase()}`,
      history: [],
      updatedAt: now,
    };
    await setDoc(refDoc, initial);
    return initial;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rewards/${userId}`);
  }
}

export async function fetchOrderDeliveryOtp(orderId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'orderSecrets', orderId));
    if (snap.exists()) {
      return (snap.data() as OrderSecret).deliveryOtp || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function validateCouponOnServer(code: string, subtotal: number) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/coupons/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ code, subtotal }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Invalid coupon code.');
  }
  return data as { valid: boolean; couponId: string; code: string; discount: number };
}

export interface CheckoutInput {
  idempotencyKey: string;
  items: Array<{
    productId: string;
    quantity: number;
    selectedSize?: string;
    selectedColor?: string;
  }>;
  customerInfo: {
    fullName: string;
    mobile: string;
    email: string;
    altMobile?: string;
  };
  deliveryAddress: {
    label: 'Home' | 'Work' | 'Other';
    fullName: string;
    mobile: string;
    houseNo: string;
    street: string;
    locality: string;
    landmark?: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
    lat?: number;
    lng?: number;
    placeId?: string;
    formattedAddress?: string;
  };
  deliveryOption: DeliveryOption;
  couponCode?: string;
  pointsToRedeem?: number;
  paymentMethod: PaymentMethod;
}

export async function validateCheckoutOnServer(payload: CheckoutInput) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/checkout/validate-and-calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Checkout validation failed.');
  }
  return data as {
    verifiedItems: Array<{
      productId: string;
      sku: string;
      name: string;
      image: string;
      unitOriginalPrice: number;
      unitSellingPrice: number;
      quantity: number;
      lineTotal: number;
      taxAmount: number;
      selectedSize?: string;
      selectedColor?: string;
      sellerId?: string;
      sellerName?: string;
    }>;
    couponId?: string;
    estimatedDeliveryText: string;
    serviceAreaMeta?: Order['serviceAreaMeta'];
    pricing: Order['pricing'];
  };
}

export async function recordPaymentAttempt(params: {
  userId: string;
  idempotencyKey: string;
  customerName: string;
  customerEmail: string;
  method: PaymentMethod;
  amount: number;
  razorpayOrderId?: string;
  status?: Extract<PaymentStatus, 'Initiated' | 'Pending' | 'Failed' | 'Cancelled'>;
  failureReason?: string;
}): Promise<string> {
  const payRef = doc(collection(db, 'payments'));
  const now = new Date().toISOString();
  try {
    await setDoc(payRef, {
      orderId: 'ATTEMPT',
      orderNumber: params.razorpayOrderId || `ATTEMPT-${payRef.id.slice(0, 6).toUpperCase()}`,
      idempotencyKey: params.idempotencyKey,
      userId: params.userId,
      customerName: params.customerName.slice(0, 100),
      customerEmail: params.customerEmail.slice(0, 160),
      method: params.method,
      ...(params.razorpayOrderId ? { razorpayOrderId: params.razorpayOrderId } : {}),
      gatewayVerified: false,
      ...(params.failureReason ? { failureReason: params.failureReason.slice(0, 300) } : {}),
      amount: Math.max(0, Number(params.amount || 0)),
      currency: 'INR',
      status: params.status || 'Initiated',
      createdAt: now,
      updatedAt: now,
    });
    return payRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payments/${payRef.id}`);
  }
}

export async function updatePaymentAttempt(params: {
  paymentAttemptId: string;
  status: Extract<PaymentStatus, 'Failed' | 'Cancelled'>;
  failureReason?: string;
  razorpayPaymentId?: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'payments', params.paymentAttemptId), {
      orderId: 'ATTEMPT',
      status: params.status,
      gatewayVerified: false,
      failureReason: (params.failureReason || `Payment ${params.status.toLowerCase()}`).slice(0, 300),
      ...(params.razorpayPaymentId ? { razorpayPaymentId: params.razorpayPaymentId } : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking audit log update if user session or connectivity was interrupted
  }
}

export async function fetchUserPaymentRecords(userId: string): Promise<PaymentRecord[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'payments'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  }
}

export async function commitOrderTransaction(params: {
  userId: string;
  payload: CheckoutInput;
  serverComputed: Awaited<ReturnType<typeof validateCheckoutOnServer>>;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentAttemptId?: string;
}): Promise<Order> {
  const { userId, payload, serverComputed, razorpayOrderId, razorpayPaymentId, paymentAttemptId } = params;

  const existingSnap = await getDocs(
    query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      where('idempotencyKey', '==', payload.idempotencyKey),
      limit(1)
    )
  );
  if (!existingSnap.empty) {
    return existingSnap.docs[0].data() as Order;
  }

  if (razorpayPaymentId) {
    const existingPaySnap = await getDocs(
      query(
        collection(db, 'orders'),
        where('userId', '==', userId),
        where('razorpayPaymentId', '==', razorpayPaymentId),
        limit(1)
      )
    );
    if (!existingPaySnap.empty) {
      return existingPaySnap.docs[0].data() as Order;
    }
  }

  // Ensure reward doc exists before transaction so updates never hit first-time create cap
  await fetchOrCreateRewardAccount(userId).catch(() => null);

  const orderRef = doc(collection(db, 'orders'));
  const orderId = orderRef.id;
  const orderNumber = `CZ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${orderId.slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();

  const isCod = payload.paymentMethod === 'COD';
  const paymentStatus = isCod ? 'Pending' : 'Paid';
  const sellerIds = Array.from(
    new Set(
      serverComputed.verifiedItems
        .map((i) => i.sellerId)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    )
  );

  const newOrder: Order = {
    id: orderId,
    orderNumber,
    userId,
    idempotencyKey: payload.idempotencyKey,
    customerInfo: payload.customerInfo,
    deliveryAddress: payload.deliveryAddress,
    deliveryOption: payload.deliveryOption,
    estimatedDeliveryText: serverComputed.estimatedDeliveryText,
    pricing: serverComputed.pricing,
    paymentMethod: payload.paymentMethod,
    paymentStatus,
    refundStatus: 'None',
    ...(razorpayOrderId ? { razorpayOrderId } : {}),
    ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
    ...(sellerIds.length > 0 ? { sellerIds } : {}),
    ...(serverComputed.serviceAreaMeta ? { serviceAreaMeta: serverComputed.serviceAreaMeta } : {}),
    orderStatus: 'Confirmed',
    statusHistory: [
      {
        status: 'Order Placed',
        timestamp: now,
        note: isCod ? 'Order placed with Cash on Delivery' : `Online payment authorized (${payload.paymentMethod})`,
        updatedBy: userId,
      },
      {
        status: 'Confirmed',
        timestamp: now,
        note: isCod ? 'Cash on Delivery confirmed' : 'Verified payment confirmed via Razorpay',
        updatedBy: isCod ? 'system' : 'razorpay',
      },
    ],
    itemsCount: serverComputed.verifiedItems.reduce((sum, i) => sum + i.quantity, 0),
    itemsPreview: serverComputed.verifiedItems.map((i) => ({ orderId, ...i })),
    createdAt: now,
    updatedAt: now,
  };

  let activeFlashSaleDocs: Array<{ id: string; productId: string; salePrice: number }> = [];
  try {
    const fsSnap = await getDocs(query(collection(db, 'flashSales'), where('active', '==', true)));
    const nowMs = Date.now();
    activeFlashSaleDocs = fsSnap.docs
      .map((d) => ({ ...(d.data() as FlashSale), id: d.id }))
      .filter((s) => isFlashSaleCurrentlyActive(s, nowMs))
      .map((s) => ({ id: s.id, productId: s.productId, salePrice: s.salePrice }));
  } catch {
    activeFlashSaleDocs = [];
  }

  try {
    await runTransaction(db, async (tx) => {
      const uniqueProdIds = Array.from(new Set(serverComputed.verifiedItems.map((i) => i.productId)));
      const prodSnaps = await Promise.all(
        uniqueProdIds.map((pid) => tx.get(doc(db, 'products', pid)))
      );

      let couponSnap = null;
      if (serverComputed.couponId) {
        couponSnap = await tx.get(doc(db, 'coupons', serverComputed.couponId));
      }

      const matchedSaleRefs = serverComputed.verifiedItems
        .map((item) => {
          const match = activeFlashSaleDocs.find(
            (s) => s.productId === item.productId && item.unitSellingPrice === s.salePrice
          );
          return match ? { item, saleRef: doc(db, 'flashSales', match.id) } : null;
        })
        .filter((x): x is { item: (typeof serverComputed.verifiedItems)[number]; saleRef: ReturnType<typeof doc> } => Boolean(x));

      const attemptRef = paymentAttemptId ? doc(db, 'payments', paymentAttemptId) : null;
      const [saleSnaps, rewardSnap, settingsSnap, attemptSnap] = await Promise.all([
        Promise.all(matchedSaleRefs.map((m) => tx.get(m.saleRef))),
        tx.get(doc(db, 'rewards', userId)),
        tx.get(doc(db, 'settings', 'store')),
        attemptRef ? tx.get(attemptRef) : Promise.resolve(null),
      ]);

      const settingsData = settingsSnap.exists()
        ? ({ ...DEFAULT_STORE_SETTINGS, ...settingsSnap.data() } as StoreSettings)
        : DEFAULT_STORE_SETTINGS;

      const qtyByProduct = new Map<string, number>();
      for (const item of serverComputed.verifiedItems) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
      }

      for (let i = 0; i < uniqueProdIds.length; i++) {
        const pid = uniqueProdIds[i];
        const qtyNeeded = qtyByProduct.get(pid) || 0;
        const snap = prodSnaps[i];
        if (snap.exists()) {
          const data = snap.data() as Product;
          if (data.stock < qtyNeeded) {
            throw new Error(`Insufficient stock for ${data.name}. Remaining: ${data.stock}`);
          }
          tx.update(snap.ref, {
            stock: data.stock - qtyNeeded,
            soldCount: (data.soldCount || 0) + qtyNeeded,
            lastOrderId: orderId,
            updatedAt: now,
          });
        } else {
          const fallback = STARTER_PRODUCTS.find((p) => p.id === pid);
          if (!fallback || fallback.stock < qtyNeeded) {
            throw new Error(`Product ${pid} is currently unavailable.`);
          }
        }
      }

      if (couponSnap && couponSnap.exists()) {
        const c = couponSnap.data() as Coupon;
        if (c.usedCount >= c.usageLimit) {
          throw new Error('Coupon usage limit was just reached.');
        }
        tx.update(couponSnap.ref, { usedCount: c.usedCount + 1 });
      }

      for (let i = 0; i < matchedSaleRefs.length; i++) {
        const saleSnap = saleSnaps[i];
        const { item } = matchedSaleRefs[i];
        if (saleSnap.exists()) {
          const sData = saleSnap.data() as FlashSale;
          const nextSold = (sData.soldCount || 0) + item.quantity;
          if (nextSold <= sData.saleStock) {
            tx.update(saleSnap.ref, {
              soldCount: nextSold,
              updatedAt: now,
            });
          }
        }
      }

      tx.set(orderRef, newOrder);

      for (const item of serverComputed.verifiedItems) {
        const itemRef = doc(collection(db, 'orderItems'));
        tx.set(itemRef, {
          orderId,
          userId,
          ...item,
          createdAt: now,
        });
      }

      // Create pending seller settlement entries for marketplace vendor items
      if (sellerIds.length > 0) {
        const commissionPercent = settingsData.defaultSellerCommissionPercent ?? 10;
        for (const sid of sellerIds) {
          const sellerItems = serverComputed.verifiedItems.filter((i) => i.sellerId === sid);
          const grossAmount = sellerItems.reduce((sum, i) => sum + i.lineTotal, 0);
          const commissionAmount = Math.round((grossAmount * commissionPercent) / 100);
          const netPayoutAmount = Math.max(0, grossAmount - commissionAmount);
          const sellerName = sellerItems[0]?.sellerName || 'CARTZY Seller';
          const settlementId = `${orderId}_${sid}`;
          tx.set(doc(db, 'sellerSettlements', settlementId), {
            id: settlementId,
            sellerId: sid,
            sellerName,
            orderId,
            orderNumber,
            grossAmount,
            commissionPercent,
            commissionAmount,
            netPayoutAmount,
            status: 'Pending',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Update customer CARTZY Rewards balance (redeem + earn)
      const redeemedPts = Math.max(0, Number(serverComputed.pricing.rewardsRedeemed || 0));
      const netMerchandiseSpend = Math.max(
        0,
        serverComputed.pricing.subtotal -
          serverComputed.pricing.couponDiscount -
          (serverComputed.pricing.rewardsDiscount || 0)
      );
      const earnedPts = Math.floor((netMerchandiseSpend / 100) * (settingsData.earnPointsPer100 || 0));

      if (rewardSnap.exists()) {
        const rData = rewardSnap.data() as RewardAccount;
        const nextHistory: RewardTransaction[] = [...(rData.history || [])];
        if (redeemedPts > 0) {
          nextHistory.unshift({
            id: `redeem_${orderId}`,
            type: 'REDEEM',
            points: -redeemedPts,
            description: `Redeemed on order ${orderNumber}`,
            orderId,
            createdAt: now,
          });
        }
        if (earnedPts > 0) {
          nextHistory.unshift({
            id: `earn_${orderId}`,
            type: 'EARN',
            points: earnedPts,
            description: `Earned from order ${orderNumber}`,
            orderId,
            createdAt: now,
          });
        }
        tx.update(rewardSnap.ref, {
          pointsBalance: Math.max(0, (rData.pointsBalance || 0) - redeemedPts + earnedPts),
          totalEarned: (rData.totalEarned || 0) + earnedPts,
          totalRedeemed: (rData.totalRedeemed || 0) + redeemedPts,
          history: nextHistory.slice(0, 100),
          updatedAt: now,
        });
      }

      const paymentPayload = {
        orderId,
        orderNumber,
        idempotencyKey: payload.idempotencyKey,
        userId,
        customerName: payload.customerInfo.fullName.slice(0, 100),
        customerEmail: payload.customerInfo.email.slice(0, 160),
        method: payload.paymentMethod,
        ...(razorpayOrderId ? { razorpayOrderId } : {}),
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        gatewayVerified: !isCod && Boolean(razorpayPaymentId),
        amount: serverComputed.pricing.finalAmount,
        currency: 'INR',
        status: paymentStatus,
        updatedAt: now,
      };

      if (
        attemptRef &&
        attemptSnap &&
        attemptSnap.exists() &&
        attemptSnap.data()?.orderId === 'ATTEMPT' &&
        attemptSnap.data()?.amount === serverComputed.pricing.finalAmount
      ) {
        tx.update(attemptRef, {
          ...paymentPayload,
          createdAt: attemptSnap.data()?.createdAt || now,
        });
      } else {
        const paymentRef = doc(collection(db, 'payments'));
        tx.set(paymentRef, {
          ...paymentPayload,
          createdAt: now,
        });
      }

      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, {
        userId,
        title: `Order Confirmed · ${orderNumber}`,
        message: isCod
          ? `Your COD order of ₹${serverComputed.pricing.finalAmount.toLocaleString('en-IN')} is confirmed.`
          : `Payment of ₹${serverComputed.pricing.finalAmount.toLocaleString('en-IN')} verified. Order confirmed.`,
        orderId,
        read: false,
        createdAt: now,
      });

      tx.set(doc(db, 'carts', userId), { items: [], updatedAt: now });
    });

    if (auth.currentUser) {
      auth.currentUser
        .getIdToken()
        .then((idToken) => {
          if (!idToken) return;
          if (!isCod && razorpayOrderId && razorpayPaymentId) {
            fetch('/api/payments/razorpay/record-order-link', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                idempotencyKey: payload.idempotencyKey,
                orderId,
                orderNumber,
                razorpayOrderId,
                razorpayPaymentId,
              }),
            }).catch(() => {});
          }
          return fetch('/api/notifications/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              to: payload.customerInfo.email,
              subject: `CARTZY Order Confirmed — ${orderNumber}`,
              html: `<h2>Order Confirmed</h2><p>Thank you for shopping with CARTZY.</p><p>Order ID: <strong>${orderNumber}</strong></p><p>Total: ₹${serverComputed.pricing.finalAmount}</p>`,
            }),
          });
        })
        .catch(() => {});
    }

    return newOrder;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
  }
}

export async function cancelCustomerOrder(orderId: string, userId: string, reason: string) {
  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();
  const cleanReason = reason.trim().slice(0, 220) || 'Cancelled by customer';

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const order = snap.data() as Order;
      if (order.userId !== userId) throw new Error('Unauthorized order access.');
      if (!['Order Placed', 'Confirmed', 'Processing'].includes(order.orderStatus)) {
        throw new Error('This order has already progressed past the cancellation window.');
      }

      // Perform ALL reads before writes: aggregate product quantities & read pending settlements
      const qtyByProduct = new Map<string, number>();
      for (const item of order.itemsPreview || []) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
      }
      const uniqueProdIds = Array.from(qtyByProduct.keys());
      const prodSnaps = await Promise.all(
        uniqueProdIds.map((pid) => tx.get(doc(db, 'products', pid)))
      );

      const sellerIds = Array.isArray(order.sellerIds) ? order.sellerIds : [];
      const settlementRefs = sellerIds.map((sid) => doc(db, 'sellerSettlements', `${orderId}_${sid}`));
      const settlementSnaps = await Promise.all(settlementRefs.map((ref) => tx.get(ref)));

      // Restock products
      for (let i = 0; i < uniqueProdIds.length; i++) {
        const pid = uniqueProdIds[i];
        const qty = qtyByProduct.get(pid) || 0;
        const pSnap = prodSnaps[i];
        if (pSnap.exists() && qty > 0) {
          const pData = pSnap.data() as Product;
          tx.update(pSnap.ref, {
            stock: Math.max(0, Number(pData.stock || 0)) + qty,
            lastOrderId: orderId,
            updatedAt: now,
          });
        }
      }

      // Cancel pending seller settlements
      for (let i = 0; i < settlementSnaps.length; i++) {
        const sSnap = settlementSnaps[i];
        if (sSnap.exists()) {
          const sData = sSnap.data() as { status?: string };
          if (sData.status === 'Pending') {
            tx.update(settlementRefs[i], {
              status: 'Cancelled',
              deductionReason: `Customer cancelled order: ${cleanReason}`.slice(0, 240),
              updatedAt: now,
            });
          }
        }
      }

      const nextHistory = [
        ...(order.statusHistory || []),
        {
          status: 'Cancelled' as OrderStatus,
          timestamp: now,
          note: cleanReason,
          updatedBy: userId,
        },
      ];

      const isPrepaid = order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid';

      tx.update(orderRef, {
        orderStatus: 'Cancelled',
        statusHistory: nextHistory,
        ...(isPrepaid
          ? {
              refundStatus: 'Initiated',
              refundAmount: order.pricing.finalAmount,
              refundNotes: `Order cancelled before dispatch (${cleanReason})`.slice(0, 300),
            }
          : {}),
        updatedAt: now,
      });

      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, {
        userId,
        title: `Order Cancelled · ${order.orderNumber}`,
        message: isPrepaid
          ? `Your order was cancelled and a refund of ₹${order.pricing.finalAmount.toLocaleString('en-IN')} has been initiated.`
          : 'Your cancellation request has been processed.',
        orderId,
        read: false,
        createdAt: now,
      });

      for (const sid of sellerIds) {
        tx.set(doc(collection(db, 'notifications')), {
          userId: sid,
          title: `Order Cancelled by Customer · ${order.orderNumber}`,
          message: `Customer cancelled ${order.orderNumber} before dispatch (${cleanReason}). Product stock has been restored.`,
          orderId,
          read: false,
          createdAt: now,
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function requestCustomerReturn(
  orderId: string,
  userId: string,
  reason: string,
  comments?: string
) {
  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();
  const cleanReason = reason.trim().slice(0, 180) || 'Customer requested return';
  const cleanComments = comments ? comments.trim().slice(0, 400) : '';

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const order = snap.data() as Order;
      if (order.userId !== userId) throw new Error('Unauthorized order access.');
      if (order.orderStatus !== 'Delivered') {
        throw new Error('Returns can only be requested for delivered orders.');
      }

      const nextHistory = [
        ...(order.statusHistory || []),
        {
          status: 'Return Requested' as OrderStatus,
          timestamp: now,
          note: `Return requested: ${cleanReason}${cleanComments ? ` (${cleanComments})` : ''}`,
          updatedBy: userId,
        },
      ];

      tx.update(orderRef, {
        orderStatus: 'Return Requested',
        returnRequest: {
          reason: cleanReason,
          ...(cleanComments ? { comments: cleanComments } : {}),
          status: 'Requested',
          requestedAt: now,
        },
        statusHistory: nextHistory,
        updatedAt: now,
      });

      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, {
        userId,
        title: `Return Requested · ${order.orderNumber}`,
        message: `Return request submitted (${cleanReason}). Our team will review it shortly.`,
        orderId,
        read: false,
        createdAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function adminUpdateOrderStatus(
  orderId: string,
  adminUid: string,
  status: OrderStatus,
  note?: string
) {
  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const order = snap.data() as Order;

      if (status === 'Cancelled' && order.orderStatus !== 'Cancelled') {
        const prodSnaps = await Promise.all(
          (order.itemsPreview || []).map((item) => tx.get(doc(db, 'products', item.productId)))
        );
        for (let i = 0; i < prodSnaps.length; i++) {
          const pSnap = prodSnaps[i];
          const item = order.itemsPreview[i];
          if (pSnap.exists()) {
            const pData = pSnap.data() as Product;
            tx.update(pSnap.ref, {
              stock: pData.stock + item.quantity,
              updatedAt: now,
            });
          }
        }
      }

      const nextHistory = [
        ...(order.statusHistory || []),
        {
          status,
          timestamp: now,
          note: note || `Order status updated to ${status}`,
          updatedBy: adminUid,
        },
      ];

      tx.update(orderRef, {
        orderStatus: status,
        statusHistory: nextHistory,
        updatedAt: now,
      });

      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, {
        userId: order.userId,
        title: `Order ${status} · ${order.orderNumber}`,
        message: note || `Your CARTZY order is now ${status}.`,
        orderId,
        read: false,
        createdAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function submitProductReview(params: {
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
}) {
  const { productId, userId, userName, rating, title, comment } = params;
  const cleanRating = Math.min(5, Math.max(1, Math.round(rating)));

  const userOrdersSnap = await getDocs(
    query(collection(db, 'orders'), where('userId', '==', userId))
  );
  const purchased = userOrdersSnap.docs.some((d) => {
    const o = d.data() as Order;
    return (
      o.orderStatus !== 'Cancelled' &&
      (o.itemsPreview || []).some((i) => i.productId === productId)
    );
  });

  if (!purchased) {
    throw new Error('Only customers who have purchased this product can write a verified review.');
  }

  const reviewId = `${productId}_${userId}`;
  const reviewRef = doc(db, 'reviews', reviewId);
  const productRef = doc(db, 'products', productId);
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const [prodSnap, revSnap] = await Promise.all([tx.get(productRef), tx.get(reviewRef)]);
      if (!prodSnap.exists()) throw new Error('Product must be synced in Firestore to attach reviews.');
      const prod = prodSnap.data() as Product;

      let nextCount = prod.reviewCount || 0;
      let totalRating = (prod.ratingAvg || 0) * nextCount;

      if (revSnap.exists()) {
        const old = revSnap.data() as Review;
        totalRating = totalRating - old.rating + cleanRating;
      } else {
        nextCount += 1;
        totalRating += cleanRating;
      }

      const nextReview: Review = {
        id: reviewId,
        productId,
        ...(prod.sellerId ? { sellerId: prod.sellerId } : {}),
        userId,
        userName,
        rating: cleanRating,
        title: title.trim().slice(0, 120) || 'Customer Review',
        comment: comment.trim().slice(0, 1000),
        verifiedPurchase: true,
        createdAt: revSnap.exists() ? (revSnap.data() as Review).createdAt : now,
        updatedAt: now,
      };

      tx.set(reviewRef, nextReview);
      tx.update(productRef, {
        reviewCount: nextCount,
        ratingAvg: Number((totalRating / nextCount).toFixed(1)),
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reviews/${reviewId}`);
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(notificationIds: string[]) {
  if (notificationIds.length === 0) return;
  try {
    await Promise.all(
      notificationIds.map((id) => updateDoc(doc(db, 'notifications', id), { read: true }))
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function fetchUserNotifications(userId: string): Promise<AppNotification[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(25))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
  } catch {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', userId))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as AppNotification))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function fetchUserOrders(userId: string): Promise<Order[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'orders'), where('userId', '==', userId))
    );
    return snap.docs
      .map((d) => d.data() as Order)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'orders');
  }
}

export async function fetchReviewsForProduct(productId: string): Promise<Review[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'reviews'), where('productId', '==', productId))
    );
    return snap.docs
      .map((d) => d.data() as Review)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function fetchUserSupportTickets(userId: string): Promise<SupportTicket[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'supportTickets'), where('userId', '==', userId))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SupportTicket))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch {
    return [];
  }
}

export async function saveSupportTicket(ticket: {
  userId: string;
  userRole?: 'customer' | 'seller' | 'delivery';
  name: string;
  email: string;
  orderNumber?: string;
  topic: string;
  message: string;
}) {
  const refDoc = doc(collection(db, 'supportTickets'));
  const now = new Date().toISOString();
  try {
    await setDoc(refDoc, {
      userId: ticket.userId,
      userRole: ticket.userRole || 'customer',
      name: ticket.name.trim().slice(0, 100),
      email: ticket.email.trim().slice(0, 160),
      ...(ticket.orderNumber?.trim() ? { orderNumber: ticket.orderNumber.trim().slice(0, 40) } : {}),
      topic: ticket.topic.trim().slice(0, 80),
      message: ticket.message.trim().slice(0, 2000),
      status: 'Open',
      createdAt: now,
    });
    return refDoc.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `supportTickets/${refDoc.id}`);
  }
}

export function isFlashSaleCurrentlyActive(sale: FlashSale, nowMs = Date.now()): boolean {
  if (!sale.active) return false;
  const start = new Date(sale.startDate).getTime();
  const end = new Date(sale.endDate).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= end;
}

export async function fetchAllFlashSales(): Promise<FlashSale[]> {
  try {
    const snap = await getDocs(collection(db, 'flashSales'));
    const cloud = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as FlashSale))
      .sort((a, b) => a.endDate.localeCompare(b.endDate));
    if (cloud.length > 0) return cloud;
    const anyProdSnap = await getDocs(query(collection(db, 'products'), limit(1)));
    return anyProdSnap.empty ? STARTER_FLASH_SALES : [];
  } catch (error) {
    console.warn('Using starter flash sales fallback:', error);
    return STARTER_FLASH_SALES;
  }
}

export async function fetchActiveFlashSales(): Promise<FlashSale[]> {
  const all = await fetchAllFlashSales();
  const now = Date.now();
  return all.filter((s) => isFlashSaleCurrentlyActive(s, now));
}

export async function saveFlashSale(
  saleId: string | null,
  payload: Omit<FlashSale, 'id' | 'createdAt' | 'updatedAt'>,
  existingCreatedAt?: string
): Promise<string> {
  const now = new Date().toISOString();
  const targetRef = saleId ? doc(db, 'flashSales', saleId) : doc(collection(db, 'flashSales'));
  try {
    await setDoc(targetRef, {
      ...payload,
      createdAt: existingCreatedAt || now,
      updatedAt: now,
    });
    return targetRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `flashSales/${targetRef.id}`);
  }
}

export async function deleteFlashSale(saleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'flashSales', saleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `flashSales/${saleId}`);
  }
}
