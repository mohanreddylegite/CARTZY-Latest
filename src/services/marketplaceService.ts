import {
  addDoc,
  collection,
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
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import {
  AppNotification,
  AuditLog,
  DeliveryAssignment,
  DeliveryPartner,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
  RefundStatus,
  Review,
  SellerApprovalStatus,
  SellerProfile,
  SellerSettlement,
  SellerVerificationDoc,
  StoreSettings,
  SupportTicket,
} from '../types';
import { DEFAULT_STORE_SETTINGS } from './storeService';

// -----------------------------
// Audit Logs & Store Settings
// -----------------------------

export async function writeAuditLog(params: {
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  try {
    const refDoc = doc(collection(db, 'auditLogs'));
    await setDoc(refDoc, {
      id: refDoc.id,
      actorUid: params.actorUid,
      actorEmail: params.actorEmail || 'admin@cartzy.in',
      action: params.action.slice(0, 80),
      targetType: params.targetType.slice(0, 60),
      targetId: params.targetId.slice(0, 128),
      summary: params.summary.slice(0, 400),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write skipped:', error);
  }
}

export async function fetchAuditLogs(maxCount = 80): Promise<AuditLog[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(maxCount))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
  } catch {
    const snap = await getDocs(collection(db, 'auditLogs'));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as AuditLog))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, maxCount);
  }
}

export async function saveStoreSettings(
  settings: Omit<StoreSettings, 'id' | 'updatedAt'>,
  actorUid: string,
  actorEmail: string
): Promise<StoreSettings> {
  const now = new Date().toISOString();
  const payload: StoreSettings = {
    id: 'store',
    earnPointsPer100: Math.min(50, Math.max(0, Number(settings.earnPointsPer100 || 0))),
    rupeePerPoint: Math.min(10, Math.max(0.5, Number(settings.rupeePerPoint || 1))),
    maxRedeemPercent: Math.min(50, Math.max(0, Number(settings.maxRedeemPercent || 0))),
    referralBonusPoints: Math.min(5000, Math.max(0, Number(settings.referralBonusPoints || 0))),
    defaultSellerCommissionPercent: Math.min(
      50,
      Math.max(0, Number(settings.defaultSellerCommissionPercent || 0))
    ),
    promoBannerText: (settings.promoBannerText || '').trim().slice(0, 240),
    promoBannerActive: Boolean(settings.promoBannerActive && (settings.promoBannerText || '').trim()),
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'settings', 'store'), payload);
    await writeAuditLog({
      actorUid,
      actorEmail,
      action: 'UPDATE_STORE_SETTINGS',
      targetType: 'settings',
      targetId: 'store',
      summary: `Updated loyalty (${payload.earnPointsPer100} pts/₹100, max ${payload.maxRedeemPercent}%), commission ${payload.defaultSellerCommissionPercent}%, banner ${payload.promoBannerActive ? 'ON' : 'OFF'}`,
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/store');
  }
}

// -----------------------------
// Admin Customer Moderation & Returns/Refunds
// -----------------------------

export async function adminSetUserSuspended(params: {
  targetUid: string;
  suspended: boolean;
  reason?: string;
  adminUid: string;
  adminEmail: string;
}) {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', params.targetUid), {
      suspended: params.suspended,
      suspensionReason: params.suspended ? (params.reason || 'Suspended by CARTZY Admin').slice(0, 300) : '',
      updatedAt: now,
    });
    await writeAuditLog({
      actorUid: params.adminUid,
      actorEmail: params.adminEmail,
      action: params.suspended ? 'SUSPEND_USER' : 'ACTIVATE_USER',
      targetType: 'user',
      targetId: params.targetUid,
      summary: `${params.suspended ? 'Suspended' : 'Re-activated'} customer ${params.targetUid}${params.reason ? `: ${params.reason}` : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${params.targetUid}`);
  }
}

export async function adminReviewReturn(params: {
  orderId: string;
  decision: 'Approved' | 'Rejected';
  adminNote?: string;
  restockItems?: boolean;
  adminUid: string;
  adminEmail: string;
}) {
  const { orderId, decision, adminNote, restockItems, adminUid, adminEmail } = params;
  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const order = snap.data() as Order;

      const prodSnaps =
        decision === 'Approved' && restockItems
          ? await Promise.all(
              (order.itemsPreview || []).map((item) => tx.get(doc(db, 'products', item.productId)))
            )
          : [];

      if (decision === 'Approved' && restockItems) {
        for (let i = 0; i < prodSnaps.length; i++) {
          const pSnap = prodSnaps[i];
          const item = order.itemsPreview[i];
          if (pSnap.exists()) {
            const pData = pSnap.data() as Product;
            tx.update(pSnap.ref, {
              stock: (pData.stock || 0) + item.quantity,
              updatedAt: now,
            });
          }
        }
      }

      const nextStatus: OrderStatus = decision === 'Approved' ? 'Returned' : 'Delivered';
      const cleanNote = (adminNote || '').trim().slice(0, 240);
      const nextHistory = [
        ...(order.statusHistory || []),
        {
          status: nextStatus,
          timestamp: now,
          note:
            decision === 'Approved'
              ? `Return approved${restockItems ? ' & items restocked' : ''}${cleanNote ? `: ${cleanNote}` : ''}`
              : `Return rejected${cleanNote ? `: ${cleanNote}` : ''}`,
          updatedBy: adminUid,
        },
      ];

      tx.update(orderRef, {
        orderStatus: nextStatus,
        returnRequest: {
          ...(order.returnRequest || {
            reason: 'Customer return request',
            requestedAt: now,
          }),
          status: decision,
          reviewedAt: now,
          ...(cleanNote ? { adminNote: cleanNote } : {}),
        },
        statusHistory: nextHistory,
        updatedAt: now,
      });

      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, {
        userId: order.userId,
        title: `Return ${decision} · ${order.orderNumber}`,
        message:
          decision === 'Approved'
            ? `Your return request was approved. ${order.paymentMethod === 'COD' ? 'Support will coordinate payout.' : 'Refund processing initiated.'}`
            : `Your return request could not be approved.${cleanNote ? ` Note: ${cleanNote}` : ''}`,
        orderId,
        read: false,
        createdAt: now,
      });
    });

    await writeAuditLog({
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: decision === 'Approved' ? 'APPROVE_RETURN' : 'REJECT_RETURN',
      targetType: 'order',
      targetId: orderId,
      summary: `${decision} return for order ${orderId}${restockItems ? ' (restocked)' : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function fetchAllPaymentsAdmin(): Promise<PaymentRecord[]> {
  try {
    const snap = await getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  }
}

export async function adminProcessOrderRefund(params: {
  order: Order;
  refundStatus: RefundStatus;
  refundAmount: number;
  refundNotes: string;
  attemptRazorpayGateway?: boolean;
  adminUid: string;
  adminEmail: string;
}): Promise<{ gatewayRefundId?: string }> {
  const { order, refundStatus, refundAmount, refundNotes, attemptRazorpayGateway, adminUid, adminEmail } = params;
  const now = new Date().toISOString();
  let gatewayRefundId: string | undefined;

  // Never mark a Razorpay online refund successful without real Razorpay gateway confirmation
  if (
    refundStatus === 'Processed' &&
    order.paymentMethod !== 'COD' &&
    order.razorpayPaymentId &&
    !attemptRazorpayGateway
  ) {
    throw new Error(
      'Online Razorpay refunds cannot be marked Processed without live gateway confirmation. Use "Trigger Razorpay Refund".'
    );
  }

  if (attemptRazorpayGateway && order.razorpayPaymentId) {
    if (!auth.currentUser) {
      throw new Error('Admin authentication session required to process Razorpay refunds.');
    }
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/payments/razorpay/refund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        razorpayPaymentId: order.razorpayPaymentId,
        orderId: order.id,
        amount: refundAmount,
        reason: refundNotes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.gatewayConfirmed || !data.refundId) {
      throw new Error(data.error || 'Razorpay gateway did not confirm the refund.');
    }
    gatewayRefundId = data.refundId;
  }

  const finalNote = gatewayRefundId
    ? `${refundNotes ? `${refundNotes} · ` : ''}Razorpay Refund ID: ${gatewayRefundId}`
    : refundNotes;

  try {
    await updateDoc(doc(db, 'orders', order.id), {
      refundStatus,
      refundAmount: Math.max(0, Number(refundAmount)),
      refundNotes: finalNote.slice(0, 300),
      ...(refundStatus === 'Processed' ? { paymentStatus: 'Refunded' } : {}),
      updatedAt: now,
    });

    if (refundStatus === 'Processed') {
      const paySnap = await getDocs(query(collection(db, 'payments'), where('orderId', '==', order.id)));
      await Promise.all(
        paySnap.docs.map((pDoc) =>
          updateDoc(doc(db, 'payments', pDoc.id), {
            status: 'Refunded',
            ...(gatewayRefundId ? { razorpayRefundId: gatewayRefundId } : {}),
            updatedAt: now,
          }).catch(() => {})
        )
      );
    }

    await addDoc(collection(db, 'notifications'), {
      userId: order.userId,
      title: `Refund ${refundStatus} · ${order.orderNumber}`,
      message: `Refund of ₹${Number(refundAmount).toLocaleString('en-IN')} is ${refundStatus}.${finalNote ? ` (${finalNote})` : ''}`,
      orderId: order.id,
      read: false,
      createdAt: now,
    });

    await writeAuditLog({
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: 'PROCESS_REFUND',
      targetType: 'order',
      targetId: order.id,
      summary: `Marked refund ${refundStatus} (₹${refundAmount}) on ${order.orderNumber}${gatewayRefundId ? ` [Ref: ${gatewayRefundId}]` : ''}`,
    });

    return { gatewayRefundId };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
  }
}

// -----------------------------
// Multi-Vendor Seller Marketplace
// -----------------------------

export type SellerAllowedOrderStatus =
  | 'Accepted'
  | 'Processing'
  | 'Preparing'
  | 'Packed'
  | 'Ready for Pickup'
  | 'Shipped'
  | 'Cancelled';

export interface SellerDashboardAnalytics {
  totalProducts: number;
  activeProducts: number;
  availableStockUnits: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  returnRequestedOrders: number;
  totalGrossSales: number;
  commissionDeducted: number;
  refundDeductions: number;
  pendingSettlementAmount: number;
  paidSettlementAmount: number;
  netEarnings: number;
  dailySalesSeries: Array<{
    dateKey: string;
    label: string;
    sales: number;
    orders: number;
  }>;
  statusBreakdown: Array<{
    label: string;
    count: number;
    tone: 'amber' | 'blue' | 'emerald' | 'red';
  }>;
}

export function computeSellerAnalytics(params: {
  orders: Order[];
  settlements: SellerSettlement[];
  products: Product[];
  sellerId: string;
  now?: Date;
}): SellerDashboardAnalytics {
  const { orders, settlements, products, sellerId } = params;
  const now = params.now || new Date();

  const activeProducts = products.filter((p) => p.active !== false).length;
  const availableStockUnits = products.reduce(
    (sum, p) => sum + Math.max(0, Number(p.stock || 0)),
    0
  );

  const pendingStatuses: OrderStatus[] = [
    'Order Placed',
    'Confirmed',
    'Accepted',
    'Processing',
    'Preparing',
    'Packed',
    'Ready for Pickup',
    'Shipped',
    'Out for Delivery',
  ];

  let pendingOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let returnRequestedOrders = 0;
  let totalGrossSales = 0;
  let returnedOrderDeductions = 0;

  // Build 7-day rolling map in local/IST calendar days
  const dayKeys: string[] = [];
  const dayBuckets: Record<string, { label: string; sales: number; orders: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    dayKeys.push(dateKey);
    dayBuckets[dateKey] = { label, sales: 0, orders: 0 };
  }

  let newPendingBucket = 0;
  let preparingReadyBucket = 0;
  let transitBucket = 0;
  let deliveredBucket = 0;
  let cancelledBucket = 0;

  for (const order of orders) {
    const myItems = (order.itemsPreview || []).filter((item) => item.sellerId === sellerId);
    const myOrderSubtotal = myItems.reduce(
      (sum, item) => sum + Math.max(0, Number(item.lineTotal || 0)),
      0
    );

    if (order.orderStatus === 'Delivered') {
      completedOrders += 1;
      deliveredBucket += 1;
    } else if (order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned') {
      cancelledOrders += 1;
      cancelledBucket += 1;
    } else if (order.orderStatus === 'Return Requested') {
      returnRequestedOrders += 1;
    } else if (pendingStatuses.includes(order.orderStatus)) {
      pendingOrders += 1;
    }

    if (['Order Placed', 'Confirmed', 'Accepted'].includes(order.orderStatus)) {
      newPendingBucket += 1;
    } else if (['Processing', 'Preparing', 'Packed', 'Ready for Pickup'].includes(order.orderStatus)) {
      preparingReadyBucket += 1;
    } else if (['Shipped', 'Out for Delivery'].includes(order.orderStatus)) {
      transitBucket += 1;
    }

    if (order.orderStatus === 'Returned') {
      returnedOrderDeductions += myOrderSubtotal;
    }

    if (order.orderStatus !== 'Cancelled' && order.orderStatus !== 'Returned') {
      totalGrossSales += myOrderSubtotal;
      const orderDay = String(order.createdAt || '').slice(0, 10);
      if (dayBuckets[orderDay]) {
        dayBuckets[orderDay].sales += myOrderSubtotal;
        dayBuckets[orderDay].orders += 1;
      }
    }
  }

  const activeSettlements = settlements.filter((s) => s.status !== 'Cancelled');
  const cancelledSettlements = settlements.filter((s) => s.status === 'Cancelled');

  const commissionDeducted = activeSettlements.reduce(
    (sum, s) => sum + Math.max(0, Number(s.commissionAmount || 0)),
    0
  );
  const pendingSettlementAmount = settlements
    .filter((s) => s.status === 'Pending')
    .reduce((sum, s) => sum + Math.max(0, Number(s.netPayoutAmount || 0)), 0);
  const paidSettlementAmount = settlements
    .filter((s) => s.status === 'Paid')
    .reduce((sum, s) => sum + Math.max(0, Number(s.netPayoutAmount || 0)), 0);

  const cancelledSettlementSum = cancelledSettlements.reduce(
    (sum, s) => sum + Math.max(0, Number(s.grossAmount || 0)),
    0
  );
  const refundDeductions = Number((returnedOrderDeductions + cancelledSettlementSum).toFixed(2));
  const netEarnings = Number(
    Math.max(0, pendingSettlementAmount + paidSettlementAmount - returnedOrderDeductions).toFixed(2)
  );

  return {
    totalProducts: products.length,
    activeProducts,
    availableStockUnits,
    totalOrders: orders.length,
    pendingOrders,
    completedOrders,
    cancelledOrders,
    returnRequestedOrders,
    totalGrossSales: Number(totalGrossSales.toFixed(2)),
    commissionDeducted: Number(commissionDeducted.toFixed(2)),
    refundDeductions,
    pendingSettlementAmount: Number(pendingSettlementAmount.toFixed(2)),
    paidSettlementAmount: Number(paidSettlementAmount.toFixed(2)),
    netEarnings,
    dailySalesSeries: dayKeys.map((dateKey) => ({
      dateKey,
      ...dayBuckets[dateKey],
      sales: Number(dayBuckets[dateKey].sales.toFixed(2)),
    })),
    statusBreakdown: [
      { label: 'New / Accepted', count: newPendingBucket, tone: 'amber' },
      { label: 'Preparing / Ready', count: preparingReadyBucket, tone: 'blue' },
      { label: 'Shipped / Transit', count: transitBucket, tone: 'blue' },
      { label: 'Delivered', count: deliveredBucket, tone: 'emerald' },
      { label: 'Cancelled / Returned', count: cancelledBucket, tone: 'red' },
    ],
  };
}

async function compressSellerBrandingImage(file: File, maxWidth = 960): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image.'));
      el.src = objectUrl;
    });
    const ratio = Math.min(1, maxWidth / Math.max(1, img.width));
    const width = Math.max(64, Math.round(img.width * ratio));
    const height = Math.max(64, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    if (dataUrl.length > 58000) {
      return canvas.toDataURL('image/jpeg', 0.5);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadSellerFile(params: {
  uid: string;
  folder: 'logos' | 'covers' | 'docs';
  file: File;
}): Promise<string> {
  const { uid, folder, file } = params;
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File must be 5 MB or smaller.');
  }
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (folder === 'docs' ? !isImage && !isPdf : !isImage) {
    throw new Error(
      folder === 'docs'
        ? 'Verification documents must be PDF, JPG, PNG, or WebP.'
        : 'Shop logo and cover images must be JPG, PNG, or WebP.'
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const storageRef = ref(storage, `sellers/${uid}/${folder}/${Date.now()}_${safeName}`);

  try {
    const uploadPromise = uploadBytes(storageRef, file, {
      contentType: file.type || undefined,
    }).then(() => getDownloadURL(storageRef));
    const timeoutPromise = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error('Storage upload timed out')), 9000)
    );
    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch (err: any) {
    if ((folder === 'logos' || folder === 'covers') && isImage) {
      const compact = await compressSellerBrandingImage(file, folder === 'logos' ? 360 : 760);
      if (compact.length <= 59000) {
        return compact;
      }
    }
    throw new Error(
      `Firebase Storage upload unavailable (${err?.message || 'enable Storage in Firebase Console'}). You can also paste an image/document URL.`
    );
  }
}

function buildPublicShopPayload(
  seller: Pick<
    SellerProfile,
    | 'sellerId'
    | 'businessName'
    | 'shopCategory'
    | 'shopPhone'
    | 'description'
    | 'logoUrl'
    | 'coverImageUrl'
    | 'cityId'
    | 'serviceZones'
    | 'operatingHours'
    | 'pickupAddress'
    | 'approvalStatus'
  >,
  now: string
) {
  const cityId = seller.cityId || 'vijayawada';
  const serviceZones =
    seller.serviceZones && seller.serviceZones.length > 0 ? seller.serviceZones : ['vja-north'];
  const operatingHours = seller.operatingHours || {
    openTime: '08:00',
    closeTime: '22:00',
    daysOpen: [0, 1, 2, 3, 4, 5, 6],
    is24x7: false,
    temporarilyClosed: false,
  };
  return {
    shopId: seller.sellerId,
    shopName: seller.businessName,
    ...(seller.shopCategory?.trim() ? { shopCategory: seller.shopCategory.trim().slice(0, 80) } : {}),
    ...(seller.shopPhone?.trim() ? { shopPhone: seller.shopPhone.trim().slice(0, 15) } : {}),
    ...(seller.description?.trim() ? { description: seller.description.trim().slice(0, 1500) } : {}),
    ...(seller.logoUrl?.trim() ? { logoUrl: seller.logoUrl.trim().slice(0, 60000) } : {}),
    ...(seller.coverImageUrl?.trim()
      ? { coverImageUrl: seller.coverImageUrl.trim().slice(0, 60000) }
      : {}),
    cityId,
    locality: seller.pickupAddress.locality,
    addressText: `${seller.pickupAddress.houseNo}, ${seller.pickupAddress.street}, ${seller.pickupAddress.locality}, ${seller.pickupAddress.city}, ${seller.pickupAddress.state} ${seller.pickupAddress.pincode}`,
    pincode: seller.pickupAddress.pincode,
    lat: seller.pickupAddress.lat ?? 16.5336501,
    lng: seller.pickupAddress.lng ?? 80.5992125,
    serviceZones,
    operatingHours,
    approvalStatus: seller.approvalStatus,
    isHub: false,
    updatedAt: now,
  };
}

export async function fetchMySellerProfile(uid: string): Promise<SellerProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'sellers', uid));
    return snap.exists() ? (snap.data() as SellerProfile) : null;
  } catch {
    return null;
  }
}

export async function fetchAllSellers(): Promise<SellerProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'sellers'));
    return snap.docs
      .map((d) => d.data() as SellerProfile)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export interface SellerApplicationInput {
  businessName: string;
  ownerName: string;
  email: string;
  mobile: string;
  shopCategory?: string;
  shopPhone?: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  verificationDocs?: SellerVerificationDoc[];
  gstin?: string;
  cityId?: string;
  serviceZones?: string[];
  operatingHours?: SellerProfile['operatingHours'];
  pickupAddress: SellerProfile['pickupAddress'];
  payoutUpiOrBank?: string;
}

export async function submitSellerApplication(
  uid: string,
  form: SellerApplicationInput,
  defaultCommissionPercent = DEFAULT_STORE_SETTINGS.defaultSellerCommissionPercent
): Promise<SellerProfile> {
  const now = new Date().toISOString();
  const serviceZones =
    form.serviceZones && form.serviceZones.length > 0 ? form.serviceZones : ['vja-north'];
  const operatingHours = form.operatingHours || {
    openTime: '08:00',
    closeTime: '22:00',
    daysOpen: [0, 1, 2, 3, 4, 5, 6],
    is24x7: false,
    temporarilyClosed: false,
  };
  const cityId = form.cityId || 'vijayawada';

  const payload: SellerProfile = {
    sellerId: uid,
    userId: uid,
    businessName: form.businessName.trim().slice(0, 120),
    ownerName: form.ownerName.trim().slice(0, 100),
    email: form.email.trim().slice(0, 160),
    mobile: form.mobile.trim().slice(0, 10),
    ...(form.shopCategory?.trim() ? { shopCategory: form.shopCategory.trim().slice(0, 80) } : {}),
    ...(form.shopPhone?.trim() ? { shopPhone: form.shopPhone.trim().slice(0, 15) } : {}),
    ...(form.description?.trim() ? { description: form.description.trim().slice(0, 1500) } : {}),
    ...(form.logoUrl?.trim() ? { logoUrl: form.logoUrl.trim().slice(0, 60000) } : {}),
    ...(form.coverImageUrl?.trim() ? { coverImageUrl: form.coverImageUrl.trim().slice(0, 60000) } : {}),
    ...(form.verificationDocs && form.verificationDocs.length > 0
      ? { verificationDocs: form.verificationDocs.slice(0, 8) }
      : {}),
    ...(form.gstin?.trim() ? { gstin: form.gstin.trim().toUpperCase().slice(0, 30) } : {}),
    cityId,
    serviceZones,
    operatingHours,
    pickupAddress: form.pickupAddress,
    ...(form.payoutUpiOrBank?.trim() ? { payoutUpiOrBank: form.payoutUpiOrBank.trim().slice(0, 120) } : {}),
    commissionPercent: Math.min(50, Math.max(0, Number(defaultCommissionPercent))),
    approvalStatus: 'Pending',
    totalGrossSales: 0,
    totalCommissionPaid: 0,
    totalNetEarnings: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'sellers', uid), payload);
    await setDoc(doc(db, 'publicShops', uid), buildPublicShopPayload(payload, now), { merge: true });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sellers/${uid}`);
  }
}

export async function updateMySellerProfile(
  uid: string,
  updates: SellerApplicationInput & { resubmitRejected?: boolean }
) {
  const now = new Date().toISOString();
  try {
    const existingSeller = await fetchMySellerProfile(uid);
    const shouldResubmit = Boolean(
      updates.resubmitRejected && existingSeller?.approvalStatus === 'Rejected'
    );
    const nextApprovalStatus: SellerApprovalStatus = shouldResubmit
      ? 'Pending'
      : existingSeller?.approvalStatus || 'Pending';

    const patch: Record<string, any> = {
      businessName: updates.businessName.trim().slice(0, 120),
      ownerName: updates.ownerName.trim().slice(0, 100),
      email: updates.email.trim().slice(0, 160),
      mobile: updates.mobile.trim().slice(0, 10),
      shopCategory: (updates.shopCategory || '').trim().slice(0, 80),
      shopPhone: (updates.shopPhone || '').trim().slice(0, 15),
      description: (updates.description || '').trim().slice(0, 1500),
      gstin: (updates.gstin || '').trim().toUpperCase().slice(0, 30),
      pickupAddress: updates.pickupAddress,
      payoutUpiOrBank: (updates.payoutUpiOrBank || '').trim().slice(0, 120),
      updatedAt: now,
    };
    if (updates.logoUrl !== undefined) {
      patch.logoUrl = updates.logoUrl.trim().slice(0, 60000);
    }
    if (updates.coverImageUrl !== undefined) {
      patch.coverImageUrl = updates.coverImageUrl.trim().slice(0, 60000);
    }
    if (updates.verificationDocs !== undefined) {
      patch.verificationDocs = updates.verificationDocs.slice(0, 8);
    }
    if (updates.cityId) patch.cityId = updates.cityId;
    if (updates.serviceZones) patch.serviceZones = updates.serviceZones;
    if (updates.operatingHours) patch.operatingHours = updates.operatingHours;
    if (shouldResubmit) patch.approvalStatus = 'Pending';

    await updateDoc(doc(db, 'sellers', uid), patch);

    if (existingSeller) {
      const mergedForPublic: SellerProfile = {
        ...existingSeller,
        ...patch,
        approvalStatus: nextApprovalStatus,
      };
      await setDoc(doc(db, 'publicShops', uid), buildPublicShopPayload(mergedForPublic, now), {
        merge: true,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sellers/${uid}`);
  }
}

export async function adminUpdateSellerStatus(params: {
  sellerId: string;
  approvalStatus: SellerApprovalStatus;
  commissionPercent: number;
  rejectionReason?: string;
  businessName?: string;
  shopCategory?: string;
  serviceZones?: string[];
  adminUid: string;
  adminEmail: string;
}) {
  const now = new Date().toISOString();
  try {
    const cleanReason =
      params.approvalStatus === 'Rejected' || params.approvalStatus === 'Suspended'
        ? (params.rejectionReason || '').trim().slice(0, 300)
        : '';

    const sellerPatch: Record<string, any> = {
      approvalStatus: params.approvalStatus,
      commissionPercent: Math.min(50, Math.max(0, Number(params.commissionPercent))),
      rejectionReason: cleanReason,
      reviewedAt: now,
      reviewedBy: params.adminUid,
      updatedAt: now,
    };
    if (params.businessName?.trim()) {
      sellerPatch.businessName = params.businessName.trim().slice(0, 120);
    }
    if (params.shopCategory?.trim()) {
      sellerPatch.shopCategory = params.shopCategory.trim().slice(0, 80);
    }
    if (params.serviceZones && params.serviceZones.length > 0) {
      sellerPatch.serviceZones = params.serviceZones;
    }

    await updateDoc(doc(db, 'sellers', params.sellerId), sellerPatch);
    const sellerSnap = await getDoc(doc(db, 'sellers', params.sellerId));
    if (sellerSnap.exists()) {
      const s = sellerSnap.data() as SellerProfile;
      await setDoc(doc(db, 'publicShops', params.sellerId), buildPublicShopPayload(s, now), {
        merge: true,
      });

      const statusMessages: Record<SellerApprovalStatus, string> = {
        Pending: 'Your seller application is queued for verification review.',
        'Under Review': 'Our verification team is currently reviewing your shop & KYC documents.',
        Approved: `Congratulations! ${s.businessName} is now verified and approved. You can publish products and fulfill customer orders.`,
        Rejected: cleanReason
          ? `Your seller application was returned for updates: ${cleanReason}. Edit your details and resubmit.`
          : 'Your seller application was not approved. Please review your details and resubmit.',
        Suspended: cleanReason
          ? `Your seller account has been suspended: ${cleanReason}.`
          : 'Your seller account has been suspended by CARTZY Admin.',
      };

      await addDoc(collection(db, 'notifications'), {
        userId: params.sellerId,
        title: `Seller Verification: ${params.approvalStatus}`,
        message: statusMessages[params.approvalStatus],
        orderId: null,
        read: false,
        createdAt: now,
      }).catch(() => {});
    }

    await writeAuditLog({
      actorUid: params.adminUid,
      actorEmail: params.adminEmail,
      action: 'UPDATE_SELLER_STATUS',
      targetType: 'seller',
      targetId: params.sellerId,
      summary: `Set seller ${params.sellerId} status=${params.approvalStatus}, commission=${params.commissionPercent}%${cleanReason ? ` (${cleanReason})` : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sellers/${params.sellerId}`);
  }
}

export async function fetchSellerProducts(sellerId: string): Promise<Product[]> {
  try {
    const snap = await getDocs(query(collection(db, 'products'), where('sellerId', '==', sellerId)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Product))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export async function fetchSellerOrders(sellerId: string): Promise<Order[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'orders'), where('sellerIds', 'array-contains', sellerId))
    );
    return snap.docs
      .map((d) => d.data() as Order)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function sellerUpdateOrderStatus(
  orderId: string,
  sellerUid: string,
  status: SellerAllowedOrderStatus,
  note?: string
) {
  const allowedStatuses: SellerAllowedOrderStatus[] = [
    'Accepted',
    'Processing',
    'Preparing',
    'Packed',
    'Ready for Pickup',
    'Shipped',
    'Cancelled',
  ];
  if (!allowedStatuses.includes(status)) {
    throw new Error(
      'Sellers cannot mark orders as Out for Delivery or Delivered. Only the verified delivery partner or admin can complete delivery.'
    );
  }

  const cleanNote = (note || '').trim().slice(0, 240);
  if (status === 'Cancelled' && !cleanNote) {
    throw new Error('Please enter a reason before rejecting an order.');
  }

  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const order = snap.data() as Order;

      if (status === 'Cancelled') {
        const cancellableStates: OrderStatus[] = [
          'Order Placed',
          'Confirmed',
          'Accepted',
          'Processing',
          'Preparing',
        ];
        if (!cancellableStates.includes(order.orderStatus)) {
          throw new Error('Order cannot be rejected after it has been packed or dispatched.');
        }
      }

      // Perform ALL reads before writes when rejecting (restock + pending settlement check)
      const sellerItems =
        status === 'Cancelled'
          ? (order.itemsPreview || []).filter((item) => item.sellerId === sellerUid)
          : [];
      const prodSnaps = await Promise.all(
        sellerItems.map((item) => tx.get(doc(db, 'products', item.productId)))
      );
      const settlementRef = doc(db, 'sellerSettlements', `${orderId}_${sellerUid}`);
      const settlementSnap = status === 'Cancelled' ? await tx.get(settlementRef) : null;

      if (status === 'Cancelled') {
        for (let i = 0; i < prodSnaps.length; i++) {
          const pSnap = prodSnaps[i];
          const item = sellerItems[i];
          if (pSnap.exists()) {
            const pData = pSnap.data() as Product;
            if (pData.sellerId === sellerUid) {
              tx.update(pSnap.ref, {
                stock: Math.max(0, Number(pData.stock || 0)) + item.quantity,
                updatedAt: now,
              });
            }
          }
        }
        if (settlementSnap && settlementSnap.exists()) {
          const sData = settlementSnap.data() as SellerSettlement;
          if (sData.status === 'Pending') {
            tx.update(settlementRef, {
              status: 'Cancelled',
              deductionReason: `Seller rejected order: ${cleanNote}`.slice(0, 240),
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
          note:
            status === 'Cancelled'
              ? `Rejected by seller: ${cleanNote}`
              : cleanNote || `Updated by seller to ${status}`,
          updatedBy: sellerUid,
        },
      ];
      tx.update(orderRef, {
        orderStatus: status,
        statusHistory: nextHistory,
        updatedAt: now,
      });
      tx.set(doc(collection(db, 'notifications')), {
        userId: order.userId,
        title:
          status === 'Cancelled'
            ? `Order Rejected by Seller · ${order.orderNumber}`
            : `Order ${status} · ${order.orderNumber}`,
        message:
          status === 'Cancelled'
            ? `Seller could not fulfill ${order.orderNumber}: ${cleanNote}`
            : `Seller marked your order ${order.orderNumber} as ${status}.`,
        orderId,
        read: false,
        createdAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function fetchSellerNotifications(uid: string): Promise<AppNotification[]> {
  try {
    const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', uid)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as AppNotification))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
  } catch {
    return [];
  }
}

export async function markSellerNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', id), { read: true });
}

export async function fetchSellerSupportTickets(uid: string): Promise<SupportTicket[]> {
  try {
    const snap = await getDocs(query(collection(db, 'supportTickets'), where('userId', '==', uid)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SupportTicket))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function submitSellerSupportTicket(params: {
  uid: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  orderNumber?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, 'supportTickets'), {
    userId: params.uid,
    userRole: 'seller',
    name: params.name.trim().slice(0, 100),
    email: params.email.trim().slice(0, 160),
    ...(params.orderNumber?.trim() ? { orderNumber: params.orderNumber.trim().slice(0, 40) } : {}),
    topic: params.topic.trim().slice(0, 80),
    message: params.message.trim().slice(0, 2000),
    status: 'Open',
    createdAt: now,
  });
}

export async function fetchAllSupportTickets(): Promise<SupportTicket[]> {
  try {
    const snap = await getDocs(collection(db, 'supportTickets'));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SupportTicket))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch {
    return [];
  }
}

export async function adminUpdateSupportTicket(params: {
  ticket: SupportTicket;
  status: SupportTicket['status'];
  adminReply?: string;
  adminUid: string;
  adminEmail: string;
}): Promise<void> {
  const { ticket, status, adminReply, adminUid, adminEmail } = params;
  const now = new Date().toISOString();
  const cleanReply = adminReply?.trim().slice(0, 1500) || '';

  try {
    await updateDoc(doc(db, 'supportTickets', ticket.id), {
      status,
      ...(cleanReply ? { adminReply: cleanReply, repliedBy: adminEmail } : {}),
      updatedAt: now,
    });

    await addDoc(collection(db, 'notifications'), {
      userId: ticket.userId,
      title: `Support Ticket ${status} · ${ticket.topic}`,
      message: cleanReply
        ? `CARTZY Support replied: "${cleanReply.slice(0, 220)}"`
        : `Your support request (${ticket.topic}) status is now ${status}.`,
      read: false,
      createdAt: now,
    }).catch(() => {});

    await writeAuditLog({
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: 'UPDATE_SUPPORT_TICKET',
      targetType: 'supportTicket',
      targetId: ticket.id,
      summary: `Set ticket ${ticket.id} (${ticket.topic}) to ${status}${cleanReply ? ' with reply' : ''}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `supportTickets/${ticket.id}`);
  }
}

// -----------------------------
// Reviews Moderation & Seller Replies
// -----------------------------

export async function fetchAllReviewsAdmin(): Promise<Review[]> {
  try {
    const snap = await getDocs(collection(db, 'reviews'));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Review))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch {
    return [];
  }
}

export async function fetchSellerProductReviews(
  sellerId: string,
  sellerProducts: Product[]
): Promise<Review[]> {
  const productIds = sellerProducts.map((p) => p.id).filter(Boolean);
  if (productIds.length === 0) return [];
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < productIds.length; i += 30) {
      chunks.push(productIds.slice(i, i + 30));
    }
    const snaps = await Promise.all(
      chunks.map((ids) =>
        getDocs(query(collection(db, 'reviews'), where('productId', 'in', ids)))
      )
    );
    const byId = new Map<string, Review>();
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const rev = { id: d.id, ...d.data() } as Review;
        if (!rev.sellerId || rev.sellerId === sellerId) {
          byId.set(rev.id, rev);
        }
      });
    });
    return Array.from(byId.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  } catch {
    return [];
  }
}

export async function sellerReplyToReview(params: {
  review: Review;
  sellerUid: string;
  sellerBusinessName: string;
  replyText: string;
}): Promise<void> {
  const { review, sellerUid, sellerBusinessName, replyText } = params;
  const cleanReply = replyText.trim().slice(0, 800);
  if (!cleanReply) {
    throw new Error('Please enter a response before submitting.');
  }
  const now = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'reviews', review.id), {
      sellerId: sellerUid,
      sellerReply: cleanReply,
      sellerReplyBy: sellerBusinessName.trim().slice(0, 120),
      sellerRepliedAt: now,
      updatedAt: now,
    });

    await addDoc(collection(db, 'notifications'), {
      userId: review.userId,
      title: `${sellerBusinessName} replied to your review`,
      message: cleanReply.slice(0, 240),
      read: false,
      createdAt: now,
    }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reviews/${review.id}`);
  }
}

export async function adminDeleteReviewAndRecalculate(params: {
  review: Review;
  adminUid: string;
  adminEmail: string;
}): Promise<void> {
  const { review, adminUid, adminEmail } = params;
  const now = new Date().toISOString();

  try {
    const productReviewsSnap = await getDocs(
      query(collection(db, 'reviews'), where('productId', '==', review.productId))
    );
    const remaining = productReviewsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Review))
      .filter((r) => r.id !== review.id);

    const nextCount = remaining.length;
    const nextAvg =
      nextCount > 0
        ? Number((remaining.reduce((sum, r) => sum + Number(r.rating || 0), 0) / nextCount).toFixed(1))
        : 0;

    await runTransaction(db, async (tx) => {
      const reviewRef = doc(db, 'reviews', review.id);
      const productRef = doc(db, 'products', review.productId);
      const [revSnap, prodSnap] = await Promise.all([tx.get(reviewRef), tx.get(productRef)]);

      if (revSnap.exists()) {
        tx.delete(reviewRef);
      }
      if (prodSnap.exists()) {
        tx.update(productRef, {
          reviewCount: nextCount,
          ratingAvg: nextAvg,
          updatedAt: now,
        });
      }
    });

    await writeAuditLog({
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: 'DELETE_REVIEW',
      targetType: 'review',
      targetId: review.id,
      summary: `Deleted review by ${review.userName} on product ${review.productId} (new rating: ${nextAvg} across ${nextCount} reviews)`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reviews/${review.id}`);
  }
}

export async function fetchSellerSettlements(sellerId?: string): Promise<SellerSettlement[]> {
  try {
    const q = sellerId
      ? query(collection(db, 'sellerSettlements'), where('sellerId', '==', sellerId))
      : collection(db, 'sellerSettlements');
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SellerSettlement))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function adminMarkSettlementPaid(params: {
  settlement: SellerSettlement;
  payoutReference: string;
  adminUid: string;
  adminEmail: string;
}) {
  const { settlement, payoutReference, adminUid, adminEmail } = params;
  const now = new Date().toISOString();
  const cleanRef = payoutReference.trim() || `UTR-${Date.now().toString().slice(-8)}`;

  try {
    await runTransaction(db, async (tx) => {
      const setRef = doc(db, 'sellerSettlements', settlement.id);
      const sellerRef = doc(db, 'sellers', settlement.sellerId);
      const [setSnap, sellerSnap] = await Promise.all([tx.get(setRef), tx.get(sellerRef)]);
      if (!setSnap.exists()) throw new Error('Settlement record not found.');
      const current = setSnap.data() as SellerSettlement;
      if (current.status === 'Paid') return;

      tx.update(setRef, {
        status: 'Paid',
        payoutReference: cleanRef,
        updatedAt: now,
      });

      if (sellerSnap.exists()) {
        const sData = sellerSnap.data() as SellerProfile;
        tx.update(sellerRef, {
          totalGrossSales: (sData.totalGrossSales || 0) + current.grossAmount,
          totalCommissionPaid: (sData.totalCommissionPaid || 0) + current.commissionAmount,
          totalNetEarnings: (sData.totalNetEarnings || 0) + current.netPayoutAmount,
          updatedAt: now,
        });
      }
    });

    await writeAuditLog({
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: 'SETTLE_SELLER_PAYOUT',
      targetType: 'sellerSettlement',
      targetId: settlement.id,
      summary: `Marked ₹${settlement.netPayoutAmount} Paid to ${settlement.sellerName} (Ref: ${cleanRef})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sellerSettlements/${settlement.id}`);
  }
}

// -----------------------------
// Delivery Partner Fleet & OTP Handover
// -----------------------------

export async function computeDeliveryOtpHash(orderId: string, otp: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${orderId}:${otp.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateFourDigitOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(1000 + (buf[0] % 9000));
}

export async function fetchMyDeliveryPartnerProfile(uid: string): Promise<DeliveryPartner | null> {
  try {
    const snap = await getDoc(doc(db, 'deliveryPartners', uid));
    return snap.exists() ? (snap.data() as DeliveryPartner) : null;
  } catch {
    return null;
  }
}

export async function fetchAllDeliveryPartners(): Promise<DeliveryPartner[]> {
  try {
    const snap = await getDocs(collection(db, 'deliveryPartners'));
    return snap.docs
      .map((d) => d.data() as DeliveryPartner)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function submitDeliveryPartnerApplication(
  uid: string,
  form: {
    fullName: string;
    mobile: string;
    email: string;
    vehicleType: DeliveryPartner['vehicleType'];
    vehicleNumber: string;
    licenseNumber: string;
    cityId?: string;
    city: string;
    state: string;
    assignedZones?: string[];
  }
): Promise<DeliveryPartner> {
  const now = new Date().toISOString();
  const cityId = form.cityId || 'vijayawada';
  const assignedZones =
    form.assignedZones && form.assignedZones.length > 0 ? form.assignedZones : ['vja-north'];

  const payload: DeliveryPartner = {
    partnerId: uid,
    userId: uid,
    fullName: form.fullName.trim().slice(0, 100),
    mobile: form.mobile.trim().slice(0, 10),
    email: form.email.trim().slice(0, 160),
    vehicleType: form.vehicleType,
    vehicleNumber: form.vehicleNumber.trim().toUpperCase().slice(0, 30),
    licenseNumber: form.licenseNumber.trim().toUpperCase().slice(0, 40),
    cityId,
    city: form.city.trim().slice(0, 80),
    state: form.state.trim().slice(0, 80),
    assignedZones,
    verificationStatus: 'Pending',
    isOnline: false,
    totalDeliveries: 0,
    totalEarnings: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'deliveryPartners', uid), payload);
    await setDoc(
      doc(db, 'publicDrivers', uid),
      {
        partnerId: uid,
        cityId,
        assignedZones,
        isOnline: false,
        verificationStatus: 'Pending',
        updatedAt: now,
      },
      { merge: true }
    );
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `deliveryPartners/${uid}`);
  }
}

export async function adminUpdateDeliveryPartnerStatus(params: {
  partnerId: string;
  verificationStatus: DeliveryPartner['verificationStatus'];
  adminUid: string;
  adminEmail: string;
}) {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'deliveryPartners', params.partnerId), {
      verificationStatus: params.verificationStatus,
      ...(params.verificationStatus !== 'Approved' ? { isOnline: false } : {}),
      updatedAt: now,
    });
    const drvSnap = await getDoc(doc(db, 'deliveryPartners', params.partnerId));
    if (drvSnap.exists()) {
      const d = drvSnap.data() as DeliveryPartner;
      await setDoc(
        doc(db, 'publicDrivers', params.partnerId),
        {
          partnerId: d.partnerId,
          cityId: d.cityId || 'vijayawada',
          assignedZones: d.assignedZones && d.assignedZones.length > 0 ? d.assignedZones : ['vja-north'],
          isOnline: params.verificationStatus !== 'Approved' ? false : d.isOnline,
          verificationStatus: params.verificationStatus,
          updatedAt: now,
        },
        { merge: true }
      );
    }
    await writeAuditLog({
      actorUid: params.adminUid,
      actorEmail: params.adminEmail,
      action: 'UPDATE_DRIVER_STATUS',
      targetType: 'deliveryPartner',
      targetId: params.partnerId,
      summary: `Set delivery partner ${params.partnerId} verification=${params.verificationStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `deliveryPartners/${params.partnerId}`);
  }
}

export async function adminAssignOrderToDriver(params: {
  order: Order;
  driver: DeliveryPartner;
  deliveryFeeEarning: number;
  pickupSummary?: string;
  adminUid: string;
  adminEmail: string;
}): Promise<{ otp: string }> {
  const { order, driver, deliveryFeeEarning, pickupSummary, adminUid, adminEmail } = params;
  const now = new Date().toISOString();
  const otp = generateFourDigitOtp();
  const otpHash = await computeDeliveryOtpHash(order.id, otp);

  const deliverySummary = [
    order.deliveryAddress.houseNo,
    order.deliveryAddress.street,
    order.deliveryAddress.locality,
    order.deliveryAddress.city,
    order.deliveryAddress.state,
    order.deliveryAddress.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  const codAmount = order.paymentMethod === 'COD' && order.paymentStatus !== 'Paid'
    ? order.pricing.finalAmount
    : 0;

  const assignment: DeliveryAssignment = {
    id: order.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    driverId: driver.partnerId,
    driverName: driver.fullName,
    driverMobile: driver.mobile,
    ...(order.serviceAreaMeta?.zoneId ? { zoneId: order.serviceAreaMeta.zoneId } : {}),
    ...(order.serviceAreaMeta?.zoneName ? { zoneName: order.serviceAreaMeta.zoneName } : {}),
    pickupSummary: pickupSummary?.trim() || 'CARTZY Bhavanipuram Operations Hub, Vijayawada',
    customerName: order.customerInfo.fullName,
    customerMobile: order.customerInfo.mobile,
    deliverySummary,
    ...(typeof order.deliveryAddress.lat === 'number' ? { deliveryLat: order.deliveryAddress.lat } : {}),
    ...(typeof order.deliveryAddress.lng === 'number' ? { deliveryLng: order.deliveryAddress.lng } : {}),
    codAmountToCollect: codAmount,
    deliveryFeeEarning: Math.max(0, Number(deliveryFeeEarning || 60)),
    status: 'Assigned',
    otpHash,
    assignedAt: now,
    updatedAt: now,
  };

  try {
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', order.id);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found.');
      const currentOrder = orderSnap.data() as Order;
      if (['Cancelled', 'Delivered', 'Returned'].includes(currentOrder.orderStatus)) {
        throw new Error(`Cannot assign driver to an order in status "${currentOrder.orderStatus}".`);
      }

      tx.set(doc(db, 'orderSecrets', order.id), {
        orderId: order.id,
        userId: order.userId,
        deliveryOtp: otp,
        createdAt: now,
      });

      tx.set(doc(db, 'deliveryAssignments', order.id), assignment);

      const nextHistory = [
        ...(currentOrder.statusHistory || []),
        {
          status: currentOrder.orderStatus,
          timestamp: now,
          note: `Assigned to delivery partner ${driver.fullName} (${driver.vehicleType})`,
          updatedBy: adminUid,
        },
      ];

      tx.update(orderRef, {
        assignedDriverId: driver.partnerId,
        deliveryAssignmentId: order.id,
        statusHistory: nextHistory,
        updatedAt: now,
      });

      tx.set(doc(collection(db, 'notifications')), {
        userId: order.userId,
        title: `Delivery Partner Assigned · ${order.orderNumber}`,
        message: `${driver.fullName} will deliver your order. View your 4-digit Handover PIN in My Orders.`,
        orderId: order.id,
        read: false,
        createdAt: now,
      });

      tx.set(doc(collection(db, 'notifications')), {
        userId: driver.partnerId,
        title: `New Delivery Task · ${order.orderNumber}`,
        message: `Pickup from ${assignment.pickupSummary} -> Deliver to ${order.deliveryAddress.city} (${order.deliveryAddress.pincode}).`,
        orderId: order.id,
        read: false,
        createdAt: now,
      });
    });

    await writeAuditLog({
      actorUid: adminUid,
      actorEmail: adminEmail,
      action: 'ASSIGN_DELIVERY_PARTNER',
      targetType: 'order',
      targetId: order.id,
      summary: `Assigned ${order.orderNumber} to driver ${driver.fullName} (${driver.partnerId})`,
    });

    return { otp };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `deliveryAssignments/${order.id}`);
  }
}

export async function fetchDriverAssignments(driverId: string): Promise<DeliveryAssignment[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'deliveryAssignments'), where('driverId', '==', driverId))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as DeliveryAssignment))
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  } catch {
    return [];
  }
}

export async function fetchAllDeliveryAssignments(): Promise<DeliveryAssignment[]> {
  try {
    const snap = await getDocs(collection(db, 'deliveryAssignments'));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as DeliveryAssignment))
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  } catch {
    return [];
  }
}

export async function fetchDeliveryAssignmentForOrder(orderId: string): Promise<DeliveryAssignment | null> {
  try {
    const snap = await getDoc(doc(db, 'deliveryAssignments', orderId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as DeliveryAssignment) : null;
  } catch {
    return null;
  }
}

export async function updateDeliveryPartnerOnlineStatus(partnerId: string, isOnline: boolean) {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'deliveryPartners', partnerId), {
      isOnline,
      updatedAt: now,
    });
    const drvSnap = await getDoc(doc(db, 'deliveryPartners', partnerId));
    if (drvSnap.exists()) {
      const d = drvSnap.data() as DeliveryPartner;
      await setDoc(
        doc(db, 'publicDrivers', partnerId),
        {
          partnerId,
          cityId: d.cityId || 'vijayawada',
          assignedZones: d.assignedZones && d.assignedZones.length > 0 ? d.assignedZones : ['vja-north'],
          isOnline,
          verificationStatus: d.verificationStatus,
          ...(typeof d.currentLat === 'number' ? { currentLat: d.currentLat } : {}),
          ...(typeof d.currentLng === 'number' ? { currentLng: d.currentLng } : {}),
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `deliveryPartners/${partnerId}`);
  }
}

export async function updateDriverLiveCoordinates(params: {
  driverId: string;
  activeAssignmentIds: string[];
  lat: number;
  lng: number;
}) {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'deliveryPartners', params.driverId), {
      currentLat: params.lat,
      currentLng: params.lng,
      locationUpdatedAt: now,
      updatedAt: now,
    });
    const drvSnap = await getDoc(doc(db, 'deliveryPartners', params.driverId)).catch(() => null);
    if (drvSnap && drvSnap.exists()) {
      const d = drvSnap.data() as DeliveryPartner;
      await setDoc(
        doc(db, 'publicDrivers', params.driverId),
        {
          partnerId: params.driverId,
          cityId: d.cityId || 'vijayawada',
          assignedZones: d.assignedZones && d.assignedZones.length > 0 ? d.assignedZones : ['vja-north'],
          isOnline: d.isOnline,
          verificationStatus: d.verificationStatus,
          currentLat: params.lat,
          currentLng: params.lng,
          updatedAt: now,
        },
        { merge: true }
      ).catch(() => {});
    }
    await Promise.all(
      params.activeAssignmentIds.map((aid) =>
        updateDoc(doc(db, 'deliveryAssignments', aid), {
          driverLat: params.lat,
          driverLng: params.lng,
          driverLocationUpdatedAt: now,
          updatedAt: now,
        })
      )
    );
  } catch (err) {
    console.warn('Live GPS coordinate update skipped:', err);
  }
}

export async function driverUpdateAssignmentStatus(params: {
  assignment: DeliveryAssignment;
  driverUid: string;
  status: 'Accepted' | 'Rejected' | 'Picked Up' | 'Out for Delivery';
}) {
  const { assignment, driverUid, status } = params;
  const now = new Date().toISOString();

  try {
    const orderSnapBefore = await getDoc(doc(db, 'orders', assignment.orderId));
    if (orderSnapBefore.exists()) {
      const ordData = orderSnapBefore.data() as Order;
      if (['Cancelled', 'Delivered', 'Returned'].includes(ordData.orderStatus)) {
        throw new Error(`Order ${assignment.orderNumber} is already ${ordData.orderStatus}.`);
      }
    }

    await updateDoc(doc(db, 'deliveryAssignments', assignment.id), {
      status,
      updatedAt: now,
    });

    if (status === 'Picked Up' && orderSnapBefore.exists()) {
      const ordData = orderSnapBefore.data() as Order;
      await addDoc(collection(db, 'notifications'), {
        userId: ordData.userId,
        title: `Package Picked Up · ${ordData.orderNumber}`,
        message: `${assignment.driverName} has collected your package from ${assignment.pickupSummary}.`,
        orderId: ordData.id,
        read: false,
        createdAt: now,
      }).catch(() => {});
    }

    if (status === 'Out for Delivery') {
      await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'orders', assignment.orderId);
        const snap = await tx.get(orderRef);
        if (!snap.exists()) return;
        const order = snap.data() as Order;
        if (['Cancelled', 'Delivered', 'Returned'].includes(order.orderStatus)) {
          throw new Error(`Order ${order.orderNumber} cannot go Out for Delivery (${order.orderStatus}).`);
        }
        const nextHistory = [
          ...(order.statusHistory || []),
          {
            status: 'Out for Delivery' as OrderStatus,
            timestamp: now,
            note: `Out for delivery with ${assignment.driverName} (${assignment.driverMobile})`,
            updatedBy: driverUid,
          },
        ];
        tx.update(orderRef, {
          orderStatus: 'Out for Delivery',
          paymentStatus: order.paymentStatus,
          statusHistory: nextHistory,
          updatedAt: now,
        });
        tx.set(doc(collection(db, 'notifications')), {
          userId: order.userId,
          title: `Out for Delivery · ${order.orderNumber}`,
          message: `${assignment.driverName} is on the way with your order. Keep your 4-digit PIN ready.`,
          orderId: order.id,
          read: false,
          createdAt: now,
        });
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `deliveryAssignments/${assignment.id}`);
  }
}

export async function driverCompleteDeliveryWithOtp(params: {
  assignment: DeliveryAssignment;
  driverUid: string;
  otpPin: string;
}) {
  const { assignment, driverUid, otpPin } = params;
  const cleanPin = otpPin.trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error('Enter the valid 4-digit delivery handover PIN from the customer.');
  }

  const submittedHash = await computeDeliveryOtpHash(assignment.orderId, cleanPin);
  if (submittedHash !== assignment.otpHash) {
    throw new Error('Incorrect 4-digit PIN. Please ask the customer to verify their PIN in My Orders.');
  }

  const now = new Date().toISOString();
  try {
    await runTransaction(db, async (tx) => {
      const assignRef = doc(db, 'deliveryAssignments', assignment.id);
      const orderRef = doc(db, 'orders', assignment.orderId);
      const partnerRef = doc(db, 'deliveryPartners', driverUid);

      const [assignSnap, orderSnap, partnerSnap] = await Promise.all([
        tx.get(assignRef),
        tx.get(orderRef),
        tx.get(partnerRef),
      ]);

      if (!assignSnap.exists()) throw new Error('Delivery assignment not found.');
      const aData = assignSnap.data() as DeliveryAssignment;
      if (aData.status === 'Delivered') return;

      if (orderSnap.exists()) {
        const currentOrder = orderSnap.data() as Order;
        if (['Cancelled', 'Returned', 'Delivered'].includes(currentOrder.orderStatus)) {
          throw new Error(`Order ${currentOrder.orderNumber} is already ${currentOrder.orderStatus}.`);
        }
      }

      tx.update(assignRef, {
        status: 'Delivered',
        otpSubmittedHash: submittedHash,
        deliveredAt: now,
        updatedAt: now,
      });

      if (orderSnap.exists()) {
        const order = orderSnap.data() as Order;
        const nextPaymentStatus = order.paymentMethod === 'COD' ? 'Paid' : order.paymentStatus;
        const nextHistory = [
          ...(order.statusHistory || []),
          {
            status: 'Delivered' as OrderStatus,
            timestamp: now,
            note: `Delivered & OTP verified by ${assignment.driverName}${order.paymentMethod === 'COD' ? ` (COD ₹${order.pricing.finalAmount} collected)` : ''}`,
            updatedBy: driverUid,
          },
        ];
        tx.update(orderRef, {
          orderStatus: 'Delivered',
          paymentStatus: nextPaymentStatus,
          statusHistory: nextHistory,
          updatedAt: now,
        });
        tx.set(doc(collection(db, 'notifications')), {
          userId: order.userId,
          title: `Order Delivered · ${order.orderNumber}`,
          message: `Your order ${order.orderNumber} has been delivered. Thank you for shopping with CARTZY!`,
          orderId: order.id,
          read: false,
          createdAt: now,
        });
      }

      if (partnerSnap.exists()) {
        const pData = partnerSnap.data() as DeliveryPartner;
        tx.update(partnerRef, {
          totalDeliveries: (pData.totalDeliveries || 0) + 1,
          totalEarnings: (pData.totalEarnings || 0) + (aData.deliveryFeeEarning || 0),
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `deliveryAssignments/${assignment.id}`);
  }
}
