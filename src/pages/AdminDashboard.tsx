import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  Ban,
  CheckCircle2,
  Download,
  MapPin,
  Search,
  Truck,
  Zap,
} from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_STORE_SETTINGS,
  adminUpdateOrderStatus,
  deleteFlashSale,
  fetchAllCategoriesAdmin,
  fetchStoreSettings,
  getServerConfigStatus,
  isFlashSaleCurrentlyActive,
  saveFlashSale,
  seedInitialCatalog,
} from '../services/storeService';
import {
  adminSetUserSuspended,
  fetchAllDeliveryAssignments,
  fetchAllDeliveryPartners,
  fetchAllPaymentsAdmin,
  fetchAllReviewsAdmin,
  fetchAllSellers,
  fetchAllSupportTickets,
  fetchAuditLogs,
  fetchSellerSettlements,
  writeAuditLog,
} from '../services/marketplaceService';
import { DEFAULT_PRODUCT_IMAGE, STARTER_PRODUCTS } from '../data/starterCatalog';
import { getBrowserMapsApiKey } from '../services/mapsAddressParser';
import {
  AuditLog,
  Category,
  Coupon,
  DeliveryAssignment,
  DeliveryPartner,
  FlashSale,
  Order,
  OrderStatus,
  PaymentRecord,
  Product,
  Review,
  SellerProfile,
  SellerSettlement,
  ServerConfigStatus,
  StoreSettings,
  SupportTicket,
  UserProfile,
} from '../types';
import { formatINR } from '../services/indianValidation';
import { OrderLocationMapModal } from '../components/maps/OrderLocationMapModal';
import {
  AdminAuditLogsPanel,
  AdminDeliveryPanel,
  AdminReturnsPanel,
  AdminSellersPanel,
  AdminSettingsPanel,
} from '../components/admin/AdminOperationsPanels';
import { AdminPaymentsPanel } from '../components/admin/AdminPaymentsPanel';
import { AdminServiceAreaPanel } from '../components/admin/AdminServiceAreaPanel';
import {
  AdminReviewsPanel,
  AdminSupportPanel,
} from '../components/admin/AdminSupportAndReviewsPanels';

type Tab =
  | 'overview'
  | 'products'
  | 'categories'
  | 'orders'
  | 'payments'
  | 'returns'
  | 'customers'
  | 'sellers'
  | 'delivery'
  | 'service-areas'
  | 'coupons'
  | 'flash-sales'
  | 'support'
  | 'reviews'
  | 'settings'
  | 'audit';

const ORDER_STATUSES: OrderStatus[] = [
  'Order Placed',
  'Confirmed',
  'Accepted',
  'Processing',
  'Preparing',
  'Packed',
  'Ready for Pickup',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Return Requested',
  'Returned',
];

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [settlements, setSettlements] = useState<SellerSettlement[]>([]);
  const [deliveryPartners, setDeliveryPartners] = useState<DeliveryPartner[]>([]);
  const [deliveryAssignments, setDeliveryAssignments] = useState<DeliveryAssignment[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [inspectedCustomerUid, setInspectedCustomerUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [mapModalOrder, setMapModalOrder] = useState<Order | null>(null);
  const [editingTrackingOrderId, setEditingTrackingOrderId] = useState<string | null>(null);
  const [trackingForm, setTrackingForm] = useState({
    providerName: '',
    trackingId: '',
    trackingUrl: '',
  });

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pForm, setPForm] = useState({
    name: '',
    sku: '',
    brand: '',
    categoryId: '',
    originalPrice: 0,
    sellingPrice: 0,
    stock: 10,
    taxRatePercent: 18,
    sizesText: '',
    colorsText: '',
    tagsText: '',
    specificationsText: '',
    description: '',
    imageUrl: '',
    imagesText: '',
    active: true,
  });
  const [uploadingImg, setUploadingImg] = useState(false);

  const [catName, setCatName] = useState('');
  const [catImg, setCatImg] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catIcon, setCatIcon] = useState('tag');
  const [catActive, setCatActive] = useState(true);
  const [uploadingCatImg, setUploadingCatImg] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const [cForm, setCForm] = useState({
    code: '',
    type: 'PERCENT' as 'PERCENT' | 'FIXED',
    value: 10,
    minOrderAmount: 499,
    maxDiscount: 500,
    usageLimit: 100,
    expiryDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const [editingFlashSaleId, setEditingFlashSaleId] = useState<string | null>(null);
  const [editingFlashCreatedAt, setEditingFlashCreatedAt] = useState<string | undefined>(undefined);
  const [fsForm, setFsForm] = useState({
    title: 'Lightning Deal',
    productId: '',
    salePrice: 0,
    discountPercent: 25,
    saleStock: 15,
    soldCount: 0,
    startDate: new Date().toISOString().slice(0, 16),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    active: true,
  });

  const refreshAll = async () => {
    const [
      pSnap,
      catsList,
      oSnap,
      uSnap,
      cpSnap,
      fsSnap,
      slList,
      stList,
      dpList,
      daList,
      payList,
      ticketList,
      reviewList,
      cfgSet,
      logs,
    ] = await Promise.all([
      getDocs(collection(db, 'products')),
      fetchAllCategoriesAdmin(),
      getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'coupons')),
      getDocs(collection(db, 'flashSales')),
      fetchAllSellers(),
      fetchSellerSettlements(),
      fetchAllDeliveryPartners(),
      fetchAllDeliveryAssignments(),
      fetchAllPaymentsAdmin().catch(() => [] as PaymentRecord[]),
      fetchAllSupportTickets(),
      fetchAllReviewsAdmin(),
      fetchStoreSettings(),
      fetchAuditLogs(),
    ]);
    setProducts(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    setCategories(catsList);
    setOrders(oSnap.docs.map((d) => d.data() as Order));
    setCustomers(uSnap.docs.map((d) => d.data() as UserProfile));
    setCoupons(cpSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Coupon)));
    setFlashSales(
      fsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as FlashSale))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
    setSellers(slList);
    setSettlements(stList);
    setDeliveryPartners(dpList);
    setDeliveryAssignments(daList);
    setPayments(payList);
    setSupportTickets(ticketList);
    setReviews(reviewList);
    setStoreSettings(cfgSet);
    setAuditLogs(logs);
  };

  useEffect(() => {
    refreshAll();
    getServerConfigStatus().then(setServerConfig);
  }, []);

  const analytics = useMemo(() => {
    const activeOrders = orders.filter((o) => o.orderStatus !== 'Cancelled');
    const totalSales = activeOrders.reduce((s, o) => s + o.pricing.finalAmount, 0);
    const pendingOrders = orders.filter((o) =>
      ['Order Placed', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery'].includes(
        o.orderStatus
      )
    ).length;
    const deliveredOrders = orders.filter((o) => o.orderStatus === 'Delivered').length;
    const returnQueueCount = orders.filter((o) => o.orderStatus === 'Return Requested').length;
    const lowStock = products.filter((p) => p.stock <= 5);

    const todayKey = new Date().toISOString().slice(0, 10);
    const monthKey = new Date().toISOString().slice(0, 7);
    const dailySales = activeOrders
      .filter((o) => o.createdAt.startsWith(todayKey))
      .reduce((s, o) => s + o.pricing.finalAmount, 0);
    const monthlySales = activeOrders
      .filter((o) => o.createdAt.startsWith(monthKey))
      .reduce((s, o) => s + o.pricing.finalAmount, 0);

    const bestSelling = [...products].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 5);

    // Last 7 days revenue series
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      const key = d.toISOString().slice(0, 10);
      const rev = activeOrders
        .filter((o) => o.createdAt.startsWith(key))
        .reduce((s, o) => s + o.pricing.finalAmount, 0);
      return {
        key,
        label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        revenue: rev,
      };
    });
    const max7DayRev = Math.max(1, ...last7Days.map((d) => d.revenue));

    // Order status breakdown
    const statusCounts: Record<string, number> = {};
    for (const o of orders) {
      statusCounts[o.orderStatus] = (statusCounts[o.orderStatus] || 0) + 1;
    }

    const openSupportCount = supportTickets.filter((t) => t.status !== 'Resolved').length;

    return {
      totalSales,
      pendingOrders,
      deliveredOrders,
      returnQueueCount,
      openSupportCount,
      lowStock,
      dailySales,
      monthlySales,
      bestSelling,
      last7Days,
      max7DayRev,
      statusCounts,
    };
  }, [orders, products, supportTickets]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingImg(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      }
      setPForm((prev) => {
        const existing = prev.imagesText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const merged = Array.from(
          new Set([...existing, ...(prev.imageUrl ? [prev.imageUrl.trim()] : []), ...uploadedUrls])
        ).slice(0, 8);
        return {
          ...prev,
          imageUrl: merged[0] || '',
          imagesText: merged.join('\n'),
        };
      });
      setFeedback(`Uploaded ${uploadedUrls.length} product image(s) to Firebase Storage.`);
    } catch (err: any) {
      setFeedback(`Storage upload failed: ${err.message}. You can paste valid image URLs below.`);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleCategoryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCatImg(true);
    try {
      const storageRef = ref(storage, `categories/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setCatImg(url);
      setFeedback('Category image uploaded to Firebase Storage.');
    } catch (err: any) {
      setFeedback(`Category image upload failed: ${err.message}. Paste a direct image URL.`);
    } finally {
      setUploadingCatImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const orig = Math.max(1, Number(pForm.originalPrice));
    const sell = Math.max(1, Number(pForm.sellingPrice));
    if (sell > orig) {
      setFeedback('Selling price cannot exceed Original MRP. Adjust prices before saving.');
      return;
    }

    const cat = categories.find((c) => c.id === pForm.categoryId);
    const discountPercent = orig > sell ? Math.round(((orig - sell) / orig) * 100) : 0;
    const now = new Date().toISOString();

    const availableSizes = pForm.sizesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const availableColors = pForm.colorsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const parsedImages = Array.from(
      new Set([
        ...(pForm.imageUrl.trim() ? [pForm.imageUrl.trim()] : []),
        ...pForm.imagesText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ])
    ).slice(0, 8);
    const finalImages = parsedImages.length > 0 ? parsedImages : [DEFAULT_PRODUCT_IMAGE];

    const parsedTags = Array.from(
      new Set(
        pForm.tagsText
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 10);

    const specifications: Record<string, string> = {};
    pForm.specificationsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const sep = line.indexOf(':');
        if (sep > 0) {
          const k = line.slice(0, sep).trim();
          const v = line.slice(sep + 1).trim();
          if (k && v) specifications[k] = v;
        }
      });

    const payload = {
      sku: (pForm.sku || `CZ-${Date.now().toString().slice(-6)}`).trim(),
      name: pForm.name.trim(),
      slug: pForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: pForm.description.trim(),
      categoryId: pForm.categoryId,
      categoryName: cat?.name || 'General',
      brand: pForm.brand.trim(),
      images: finalImages,
      originalPrice: orig,
      sellingPrice: sell,
      discountPercent,
      stock: Math.max(0, Number(pForm.stock)),
      taxRatePercent: Math.max(0, Math.min(40, Number(pForm.taxRatePercent))),
      availableSizes,
      availableColors,
      specifications,
      tags: parsedTags.length > 0 ? parsedTags : ['featured', 'new_arrival'],
      active: pForm.active,
      updatedAt: now,
    };

    try {
      if (editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), payload);
        setFeedback('Product updated.');
        setEditingProductId(null);
      } else {
        await addDoc(collection(db, 'products'), {
          ...payload,
          ratingAvg: 0,
          reviewCount: 0,
          soldCount: 0,
          approvalStatus: 'Approved',
          createdAt: now,
        });
        setFeedback('Product created.');
      }

      setPForm({
        name: '',
        sku: '',
        brand: '',
        categoryId: '',
        originalPrice: 0,
        sellingPrice: 0,
        stock: 10,
        taxRatePercent: 18,
        sizesText: '',
        colorsText: '',
        tagsText: '',
        specificationsText: '',
        description: '',
        imageUrl: '',
        imagesText: '',
        active: true,
      });
      await refreshAll();
    } catch (err: any) {
      setFeedback(`Unable to save product: ${err?.message || 'Permission or validation error'}`);
    }
  };

  const handleOrderStatusChange = async (orderId: string, status: OrderStatus) => {
    if (!user) return;
    await adminUpdateOrderStatus(orderId, user.uid, status);
    await writeAuditLog({
      actorUid: user.uid,
      actorEmail: user.email || 'admin@cartzy.in',
      action: 'UPDATE_ORDER_STATUS',
      targetType: 'order',
      targetId: orderId,
      summary: `Updated order ${orderId} status to ${status}`,
    });
    setFeedback(`Order updated to ${status}`);
    await refreshAll();
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'ALL' && o.orderStatus !== orderStatusFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerInfo.fullName.toLowerCase().includes(q) ||
        o.customerInfo.mobile.includes(q) ||
        o.deliveryAddress.city.toLowerCase().includes(q) ||
        o.deliveryAddress.pincode.includes(q)
      );
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const handleExportOrdersCsv = () => {
    const escapeCsv = (val: unknown) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const headers = [
      'Order Number',
      'Created At',
      'Customer Name',
      'Mobile',
      'Email',
      'City',
      'State',
      'PIN Code',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Final Amount (INR)',
    ];
    const rows = filteredOrders.map((o) => [
      o.orderNumber,
      o.createdAt,
      o.customerInfo.fullName,
      o.customerInfo.mobile,
      o.customerInfo.email,
      o.deliveryAddress.city,
      o.deliveryAddress.state,
      o.deliveryAddress.pincode,
      o.paymentMethod,
      o.paymentStatus,
      o.orderStatus,
      o.pricing.finalAmount,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CARTZY-Orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.fullName || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.mobile || '').includes(q) ||
        (c.uid || '').toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const handleSaveCourierTracking = async (orderId: string) => {
    if (!trackingForm.providerName.trim() || !trackingForm.trackingId.trim()) {
      setFeedback('Enter both Courier Provider Name and Tracking ID.');
      return;
    }
    const cleanUrl = trackingForm.trackingUrl.trim();
    await updateDoc(doc(db, 'orders', orderId), {
      courierTracking: {
        verifiedIntegration: true,
        providerName: trackingForm.providerName.trim(),
        trackingId: trackingForm.trackingId.trim(),
        ...(cleanUrl ? { trackingUrl: cleanUrl } : {}),
      },
      updatedAt: new Date().toISOString(),
    });
    setEditingTrackingOrderId(null);
    setTrackingForm({ providerName: '', trackingId: '', trackingUrl: '' });
    setFeedback('Verified courier tracking details saved to order.');
    await refreshAll();
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#14213D]">CARTZY Admin Dashboard</h1>
          <p className="text-xs text-slate-500">Inventory, orders, customers, coupons &amp; store analytics</p>
        </div>
        <div className="flex sm:flex-wrap gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 w-full">
          <button
            type="button"
            onClick={() =>
              seedInitialCatalog().then((res) => {
                setFeedback(
                  `Synced ${res.categories} starter categories, ${res.products} products, and ${res.coupons} coupons to Firestore.`
                );
                refreshAll();
              })
            }
            className="px-3.5 py-2 rounded-xl border border-[#2563EB] text-[#2563EB] text-xs font-bold hover:bg-blue-50 shrink-0 cursor-pointer"
          >
            Sync Starter Catalog
          </button>
          {(
            [
              'overview',
              'products',
              'categories',
              'orders',
              'payments',
              'returns',
              'customers',
              'sellers',
              'delivery',
              'service-areas',
              'coupons',
              'flash-sales',
              'support',
              'reviews',
              'settings',
              'audit',
            ] as Tab[]
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize transition-colors shrink-0 cursor-pointer ${
                tab === t
                  ? 'bg-[#14213D] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t === 'flash-sales'
                ? 'Flash Sales'
                : t === 'service-areas'
                ? 'Service Areas'
                : t === 'payments'
                ? `Payments (${payments.length})`
                : t === 'returns'
                ? `Returns${analytics.returnQueueCount > 0 ? ` (${analytics.returnQueueCount})` : ''}`
                : t === 'support'
                ? `Support${analytics.openSupportCount > 0 ? ` (${analytics.openSupportCount})` : ''}`
                : t === 'reviews'
                ? `Reviews (${reviews.length})`
                : t === 'audit'
                ? 'Audit Logs'
                : t}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[#14213D] text-xs font-medium">
          {feedback}
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total Sales', val: formatINR(analytics.totalSales) },
              { label: 'Monthly Revenue', val: formatINR(analytics.monthlySales) },
              { label: 'Daily Sales', val: formatINR(analytics.dailySales) },
              { label: 'Total Orders', val: orders.length },
              { label: 'Pending Orders', val: analytics.pendingOrders },
              { label: 'Delivered Orders', val: analytics.deliveredOrders },
            ].map((card) => (
              <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-200">
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className="text-xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">
                  {card.val}
                </p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-[#14213D]">Last 7 Days Revenue</h2>
                <span className="text-xs text-slate-500">Excludes cancelled orders</span>
              </div>
              <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
                {analytics.last7Days.map((d) => {
                  const pct = Math.max(6, Math.round((d.revenue / analytics.max7DayRev) * 100));
                  return (
                    <div key={d.key} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {d.revenue > 0 ? formatINR(d.revenue) : '₹0'}
                      </span>
                      <div className="w-full max-w-[36px] bg-slate-100 rounded-t-lg h-24 flex items-end overflow-hidden">
                        <div
                          style={{ height: `${pct}%` }}
                          className="w-full bg-[#2563EB] rounded-t-lg transition-all"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 text-center leading-tight">
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
              <h2 className="font-bold text-[#14213D]">Orders by Fulfillment Status</h2>
              {orders.length === 0 ? (
                <p className="text-xs text-slate-500">No orders placed yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(analytics.statusCounts).map(([st, cnt]) => {
                    const pct = Math.round((cnt / orders.length) * 100);
                    return (
                      <div key={st} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-[#14213D]">{st}</span>
                          <span className="font-mono text-slate-600 tabular-nums">
                            {cnt} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="h-full bg-[#14213D] rounded-full" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200">
              <h2 className="font-bold text-[#14213D] mb-3">Low-Stock Alerts (≤ 5 units)</h2>
              {analytics.lowStock.length === 0 ? (
                <p className="text-sm text-emerald-700">All {products.length} products are well stocked.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {analytics.lowStock.map((p) => (
                    <div key={p.id} className="flex justify-between p-2.5 rounded-xl bg-red-50 text-red-800">
                      <span className="truncate">{p.name} ({p.sku})</span>
                      <strong className="font-mono shrink-0">{p.stock} left</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200">
              <h2 className="font-bold text-[#14213D] mb-3">Best-Selling Products</h2>
              <div className="space-y-2 text-sm">
                {analytics.bestSelling.map((p) => (
                  <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="font-mono text-xs text-slate-600 shrink-0">
                      {p.soldCount || 0} sold · {formatINR(p.sellingPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <form onSubmit={handleSaveProduct} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 h-fit">
            <h2 className="font-bold text-[#14213D]">
              {editingProductId ? 'Edit Product' : 'Add New Product'}
            </h2>
            <input
              required
              placeholder="Product Name"
              value={pForm.name}
              onChange={(e) => setPForm({ ...pForm, name: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="Brand"
                value={pForm.brand}
                onChange={(e) => setPForm({ ...pForm, brand: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <input
                placeholder="SKU"
                value={pForm.sku}
                onChange={(e) => setPForm({ ...pForm, sku: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <select
              required
              value={pForm.categoryId}
              onChange={(e) => setPForm({ ...pForm, categoryId: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input
                required
                type="number"
                min={1}
                placeholder="MRP ₹"
                value={pForm.originalPrice || ''}
                onChange={(e) => setPForm({ ...pForm, originalPrice: Number(e.target.value) })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
              />
              <input
                required
                type="number"
                min={1}
                placeholder="Selling ₹"
                value={pForm.sellingPrice || ''}
                onChange={(e) => setPForm({ ...pForm, sellingPrice: Number(e.target.value) })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
              />
              <input
                required
                type="number"
                min={0}
                placeholder="Stock"
                value={pForm.stock}
                onChange={(e) => setPForm({ ...pForm, stock: Number(e.target.value) })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Sizes (e.g. S,M,L,XL)"
                value={pForm.sizesText}
                onChange={(e) => setPForm({ ...pForm, sizesText: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
              <input
                placeholder="Colors (e.g. Black,Navy)"
                value={pForm.colorsText}
                onChange={(e) => setPForm({ ...pForm, colorsText: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <input
              placeholder="Primary Image URL or upload up to 8 images below"
              value={pForm.imageUrl}
              onChange={(e) => setPForm({ ...pForm, imageUrl: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <textarea
              rows={2}
              placeholder="Additional Image URLs (one per line or comma-separated, max 8)"
              value={pForm.imagesText}
              onChange={(e) => setPForm({ ...pForm, imagesText: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
            />
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="text-xs" />
            {uploadingImg && <p className="text-xs text-[#2563EB]">Uploading images...</p>}
            <input
              placeholder="Search Tags (comma-separated, e.g. organic,wireless,deal)"
              value={pForm.tagsText}
              onChange={(e) => setPForm({ ...pForm, tagsText: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              placeholder="Specifications (Key: Value per line, e.g. Material: Cotton)"
              value={pForm.specificationsText}
              onChange={(e) => setPForm({ ...pForm, specificationsText: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              placeholder="Product Description"
              rows={3}
              value={pForm.description}
              onChange={(e) => setPForm({ ...pForm, description: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs font-semibold text-[#14213D] cursor-pointer">
              <input
                type="checkbox"
                checked={pForm.active}
                onChange={(e) => setPForm({ ...pForm, active: e.target.checked })}
              />
              Active &amp; visible to customers
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] text-white font-semibold text-sm hover:bg-blue-700 cursor-pointer"
              >
                {editingProductId ? 'Update Product' : 'Save Product'}
              </button>
              {editingProductId && (
                <button
                  type="button"
                  onClick={() => setEditingProductId(null)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-2 min-w-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="py-2">Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="py-3 font-medium">
                      <p className="truncate max-w-xs">{p.name}</p>
                      <span className="text-xs text-slate-400 font-mono">
                        {p.sku} · {p.images?.length || 1} img
                      </span>
                    </td>
                    <td className="font-mono tabular-nums">{formatINR(p.sellingPrice)}</td>
                    <td>
                      <input
                        type="number"
                        defaultValue={p.stock}
                        onBlur={(e) =>
                          updateDoc(doc(db, 'products', p.id), {
                            stock: Math.max(0, Number(e.target.value)),
                            updatedAt: new Date().toISOString(),
                          }).then(refreshAll)
                        }
                        className="w-16 border border-slate-300 rounded px-2 py-1 text-xs font-mono"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          updateDoc(doc(db, 'products', p.id), {
                            active: !(p.active !== false),
                            updatedAt: new Date().toISOString(),
                          }).then(refreshAll)
                        }
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer ${
                          p.active !== false
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {p.active !== false ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="space-x-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProductId(p.id);
                          setPForm({
                            name: p.name,
                            sku: p.sku,
                            brand: p.brand,
                            categoryId: p.categoryId,
                            originalPrice: p.originalPrice,
                            sellingPrice: p.sellingPrice,
                            stock: p.stock,
                            taxRatePercent: p.taxRatePercent || 18,
                            sizesText: (p.availableSizes || []).join(', '),
                            colorsText: (p.availableColors || []).join(', '),
                            tagsText: (p.tags || []).join(', '),
                            specificationsText: Object.entries(p.specifications || {})
                              .map(([k, v]) => `${k}: ${v}`)
                              .join('\n'),
                            description: p.description,
                            imageUrl: p.images[0] || '',
                            imagesText: (p.images || []).join('\n'),
                            active: p.active !== false,
                          });
                        }}
                        className="text-xs font-semibold text-[#2563EB] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc(db, 'products', p.id)).then(refreshAll)}
                        className="text-xs font-semibold text-red-600 cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            <input
              placeholder="Category Name *"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <input
              placeholder="Icon slug (e.g. headphones, shirt, shopping-basket)"
              value={catIcon}
              onChange={(e) => setCatIcon(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
            />
            <input
              placeholder="Image URL"
              value={catImg}
              onChange={(e) => setCatImg(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#14213D] cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={catActive}
                  onChange={(e) => setCatActive(e.target.checked)}
                />
                Active
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (!catName.trim()) return;
                  if (editingCatId) {
                    await updateDoc(doc(db, 'categories', editingCatId), {
                      name: catName.trim(),
                      icon: catIcon.trim() || 'tag',
                      description: catDesc.trim().slice(0, 300),
                      imageUrl: catImg.trim() || DEFAULT_PRODUCT_IMAGE,
                      active: catActive,
                    });
                    setEditingCatId(null);
                    setFeedback('Category updated.');
                  } else {
                    await addDoc(collection(db, 'categories'), {
                      name: catName.trim(),
                      slug: catName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                      icon: catIcon.trim() || 'tag',
                      description: catDesc.trim().slice(0, 300),
                      imageUrl: catImg.trim() || DEFAULT_PRODUCT_IMAGE,
                      displayOrder: categories.length + 1,
                      active: catActive,
                    });
                    setFeedback('Category added.');
                  }
                  setCatName('');
                  setCatImg('');
                  setCatDesc('');
                  setCatIcon('tag');
                  setCatActive(true);
                  refreshAll();
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold cursor-pointer"
              >
                {editingCatId ? 'Update' : 'Add Category'}
              </button>
              {editingCatId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCatId(null);
                    setCatName('');
                    setCatImg('');
                    setCatDesc('');
                    setCatIcon('tag');
                    setCatActive(true);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
            <input
              placeholder="Category Description (shown on category browse banner)"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              className="md:col-span-2 lg:col-span-3 border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleCategoryImageUpload}
                className="text-xs w-full"
              />
              {uploadingCatImg && <span className="text-[11px] text-[#2563EB] shrink-0">Uploading...</span>}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`flex items-start justify-between gap-3 p-3.5 border rounded-xl text-sm ${
                  c.active === false ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#14213D] truncate">{c.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.active !== false
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {c.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(c.id);
                        setCatName(c.name);
                        setCatImg(c.imageUrl || '');
                        setCatDesc(c.description || '');
                        setCatIcon(c.icon || 'tag');
                        setCatActive(c.active !== false);
                      }}
                      className="text-xs text-[#2563EB] font-semibold cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'categories', c.id)).then(refreshAll)}
                      className="text-xs text-red-600 font-semibold cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateDoc(doc(db, 'categories', c.id), {
                        active: !(c.active !== false),
                      }).then(refreshAll)
                    }
                    className="text-[11px] font-semibold text-slate-600 hover:text-[#14213D] cursor-pointer"
                  >
                    {c.active !== false ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[220px] flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  placeholder="Search order #, customer, mobile, city, PIN..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs"
                />
              </div>
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
              >
                <option value="ALL">All Statuses ({orders.length})</option>
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExportOrdersCsv}
              className="px-3.5 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV ({filteredOrders.length})
            </button>
          </div>

          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2">Order ID</th>
                <th>Customer &amp; Delivery Address</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Courier &amp; Map</th>
                <th>Order Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => {
                const fullAddr = [
                  o.deliveryAddress.houseNo,
                  o.deliveryAddress.street,
                  o.deliveryAddress.locality,
                  o.deliveryAddress.landmark,
                  o.deliveryAddress.city,
                  o.deliveryAddress.district,
                  `${o.deliveryAddress.state} - ${o.deliveryAddress.pincode}`,
                ]
                  .filter(Boolean)
                  .join(', ');
                const hasCoords =
                  typeof o.deliveryAddress.lat === 'number' &&
                  typeof o.deliveryAddress.lng === 'number';
                const isEditingTracking = editingTrackingOrderId === o.id;

                return (
                  <tr key={o.id} className="border-b last:border-b-0 align-top">
                    <td className="py-3 pr-3 font-mono font-bold text-[#14213D] whitespace-nowrap">
                      {o.orderNumber}
                    </td>
                    <td className="py-3 pr-4 max-w-md">
                      <p className="font-semibold">
                        {o.customerInfo.fullName} (<span className="font-mono">{o.customerInfo.mobile}</span>)
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{fullAddr}</p>
                      {o.serviceAreaMeta?.zoneName && (
                        <p className="text-[11px] font-semibold text-[#2563EB] mt-0.5">
                          Zone: {o.serviceAreaMeta.zoneName}
                          {o.serviceAreaMeta.wardNumber ? ` · Ward #${o.serviceAreaMeta.wardNumber}` : ''}
                        </p>
                      )}
                      {hasCoords && (
                        <p className="text-[11px] font-mono text-emerald-700 mt-1">
                          Pin: {o.deliveryAddress.lat?.toFixed(5)}, {o.deliveryAddress.lng?.toFixed(5)}
                        </p>
                      )}
                      {o.returnRequest && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1">
                          Return: {o.returnRequest.reason}
                          {o.returnRequest.comments ? ` (${o.returnRequest.comments})` : ''}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-bold font-mono tabular-nums whitespace-nowrap">
                      {formatINR(o.pricing.finalAmount)}
                    </td>
                    <td className="py-3 pr-3 text-xs whitespace-nowrap">
                      <p className="font-semibold text-[#14213D]">
                        {o.paymentMethod} ({o.paymentStatus})
                      </p>
                      {o.razorpayPaymentId && (
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Pay: {o.razorpayPaymentId}
                        </p>
                      )}
                      {o.razorpayOrderId && (
                        <p className="text-[10px] font-mono text-slate-400">
                          Order: {o.razorpayOrderId}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-3 space-y-2 min-w-[200px]">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMapModalOrder(o)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {hasCoords ? 'View on Map' : 'Address Map'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditingTracking) {
                              setEditingTrackingOrderId(null);
                            } else {
                              setEditingTrackingOrderId(o.id);
                              setTrackingForm({
                                providerName: o.courierTracking?.providerName || '',
                                trackingId: o.courierTracking?.trackingId || '',
                                trackingUrl: o.courierTracking?.trackingUrl || '',
                              });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          {o.courierTracking?.verifiedIntegration ? 'Edit Tracking' : 'Add Courier'}
                        </button>
                      </div>

                      {o.courierTracking?.verifiedIntegration && !isEditingTracking && (
                        <p className="text-[11px] text-slate-600">
                          <strong>{o.courierTracking.providerName}</strong> ·{' '}
                          <span className="font-mono">{o.courierTracking.trackingId}</span>
                        </p>
                      )}

                      {isEditingTracking && (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                          <input
                            placeholder="Courier Provider (e.g. Delhivery)"
                            value={trackingForm.providerName}
                            onChange={(e) =>
                              setTrackingForm({ ...trackingForm, providerName: e.target.value })
                            }
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1 text-xs bg-white"
                          />
                          <input
                            placeholder="AWB / Tracking ID"
                            value={trackingForm.trackingId}
                            onChange={(e) =>
                              setTrackingForm({ ...trackingForm, trackingId: e.target.value })
                            }
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono bg-white"
                          />
                          <input
                            placeholder="Verified Tracking URL (Optional)"
                            value={trackingForm.trackingUrl}
                            onChange={(e) =>
                              setTrackingForm({ ...trackingForm, trackingUrl: e.target.value })
                            }
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1 text-xs bg-white"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveCourierTracking(o.id)}
                              className="px-2.5 py-1 rounded-lg bg-[#14213D] text-white text-[11px] font-semibold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTrackingOrderId(null)}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 text-[11px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <select
                        value={o.orderStatus}
                        onChange={(e) => handleOrderStatusChange(o.id, e.target.value as OrderStatus)}
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-medium"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'returns' && user && (
        <AdminReturnsPanel
          orders={orders}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          razorpayConfigured={Boolean(serverConfig?.razorpayConfigured)}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'customers' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                placeholder="Search customers by name, email, mobile, or UID..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs"
              />
            </div>
            <span className="text-xs text-slate-500">
              Showing {filteredCustomers.length} of {customers.length} accounts · Click row to inspect orders
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2">Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Orders</th>
                <th>Status</th>
                <th>Moderation</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((u) => {
                const userOrders = orders.filter((o) => o.userId === u.uid);
                const isInspected = inspectedCustomerUid === u.uid;
                return (
                  <React.Fragment key={u.uid}>
                    <tr
                      onClick={() => setInspectedCustomerUid(isInspected ? null : u.uid)}
                      className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 font-semibold text-[#14213D]">
                        {u.fullName}
                        <p className="text-[10px] font-mono text-slate-400">{u.uid}</p>
                      </td>
                      <td className="text-xs">{u.email}</td>
                      <td className="font-mono text-xs">{u.mobile || '—'}</td>
                      <td className="font-mono tabular-nums text-xs">{userOrders.length}</td>
                      <td className="text-xs font-bold">
                        {u.suspended ? (
                          <span className="text-red-700">Suspended</span>
                        ) : (
                          <span className="text-emerald-700">Active ({u.role})</span>
                        )}
                      </td>
                      <td className="py-2" onClick={(e) => e.stopPropagation()}>
                        {u.role !== 'admin' && user && (
                          <button
                            type="button"
                            onClick={async () => {
                              await adminSetUserSuspended({
                                targetUid: u.uid,
                                suspended: !u.suspended,
                                reason: !u.suspended
                                  ? 'Suspended by CARTZY Admin moderation'
                                  : undefined,
                                adminUid: user.uid,
                                adminEmail: user.email || 'admin@cartzy.in',
                              });
                              setFeedback(
                                `${u.fullName} account ${!u.suspended ? 'suspended' : 're-activated'}.`
                              );
                              await refreshAll();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${
                              u.suspended
                                ? 'bg-emerald-600 text-white'
                                : 'border border-red-300 text-red-600 hover:bg-red-50'
                            }`}
                          >
                            {u.suspended ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" /> Activate
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" /> Suspend
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isInspected && (
                      <tr className="bg-[#F8FAFC] border-b">
                        <td colSpan={6} className="p-4 text-xs space-y-2">
                          <p className="font-bold text-[#14213D]">
                            Order History for {u.fullName} ({userOrders.length})
                          </p>
                          {userOrders.length === 0 ? (
                            <p className="text-slate-500">No orders placed by this customer.</p>
                          ) : (
                            <div className="grid sm:grid-cols-2 gap-2">
                              {userOrders.map((uo) => (
                                <div
                                  key={uo.id}
                                  className="bg-white p-2.5 rounded-xl border border-slate-200 flex justify-between items-center"
                                >
                                  <div>
                                    <span className="font-mono font-bold text-[#14213D]">
                                      {uo.orderNumber}
                                    </span>
                                    <p className="text-[11px] text-slate-500">
                                      {new Date(uo.createdAt).toLocaleDateString('en-IN')} · {uo.orderStatus}
                                    </p>
                                  </div>
                                  <span className="font-mono font-bold">{formatINR(uo.pricing.finalAmount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sellers' && user && (
        <AdminSellersPanel
          sellers={sellers}
          settlements={settlements}
          products={products}
          orders={orders}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'delivery' && user && (
        <AdminDeliveryPanel
          partners={deliveryPartners}
          assignments={deliveryAssignments}
          orders={orders}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'service-areas' && user && (
        <AdminServiceAreaPanel
          orders={orders}
          sellers={sellers}
          deliveryPartners={deliveryPartners}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          mapsApiKey={getBrowserMapsApiKey(serverConfig?.googleMapsApiKey)}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'coupons' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
          <div className="grid sm:grid-cols-6 gap-2">
            <input
              placeholder="CODE"
              value={cForm.code}
              onChange={(e) => setCForm({ ...cForm, code: e.target.value.toUpperCase() })}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm uppercase font-mono"
            />
            <select
              value={cForm.type}
              onChange={(e) => setCForm({ ...cForm, type: e.target.value as any })}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="PERCENT">Percent %</option>
              <option value="FIXED">Fixed ₹</option>
            </select>
            <input
              type="number"
              placeholder="Value"
              value={cForm.value}
              onChange={(e) => setCForm({ ...cForm, value: Number(e.target.value) })}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
            />
            <input
              type="number"
              placeholder="Min Order ₹"
              value={cForm.minOrderAmount}
              onChange={(e) => setCForm({ ...cForm, minOrderAmount: Number(e.target.value) })}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
            />
            <input
              type="date"
              value={cForm.expiryDate}
              onChange={(e) => setCForm({ ...cForm, expiryDate: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!cForm.code) return;
                await addDoc(collection(db, 'coupons'), {
                  ...cForm,
                  expiryDate: new Date(cForm.expiryDate).toISOString(),
                  usedCount: 0,
                  active: true,
                });
                setCForm({ ...cForm, code: '' });
                refreshAll();
              }}
              className="rounded-xl bg-[#2563EB] text-white text-sm font-semibold py-2"
            >
              Create Coupon
            </button>
          </div>

          <div className="space-y-2">
            {coupons.map((cp) => (
              <div key={cp.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-xl text-sm">
                <span>
                  <strong className="font-mono">{cp.code}</strong> —{' '}
                  {cp.type === 'PERCENT' ? `${cp.value}%` : `₹${cp.value}`} off (Min ₹{cp.minOrderAmount}) · Used{' '}
                  <span className="font-mono">{cp.usedCount}/{cp.usageLimit}</span>
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => updateDoc(doc(db, 'coupons', cp.id), { active: !cp.active }).then(refreshAll)}
                    className="text-xs font-semibold text-[#2563EB]"
                  >
                    {cp.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDoc(doc(db, 'coupons', cp.id)).then(refreshAll)}
                    className="text-xs font-semibold text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'flash-sales' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const catalogPool = products.length > 0 ? products : STARTER_PRODUCTS;
              const selectedProd = catalogPool.find((p) => p.id === fsForm.productId);
              if (!selectedProd) {
                setFeedback('Select a valid product for this Flash Sale.');
                return;
              }
              const startIso = new Date(fsForm.startDate).toISOString();
              const endIso = new Date(fsForm.endDate).toISOString();
              if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
                setFeedback('End date/time must be after start date/time.');
                return;
              }
              const salePrice = Math.max(1, Number(fsForm.salePrice));
              if (salePrice > selectedProd.originalPrice) {
                setFeedback('Sale price cannot exceed product MRP.');
                return;
              }
              const discountPct = Math.max(
                0,
                Math.min(
                  95,
                  Math.round(((selectedProd.originalPrice - salePrice) / selectedProd.originalPrice) * 100)
                )
              );

              await saveFlashSale(
                editingFlashSaleId,
                {
                  title: fsForm.title.trim() || 'Flash Deal',
                  productId: selectedProd.id,
                  productName: selectedProd.name,
                  productImage: selectedProd.images[0] || '',
                  brand: selectedProd.brand,
                  categoryName: selectedProd.categoryName,
                  originalPrice: selectedProd.originalPrice,
                  salePrice,
                  discountPercent: discountPct,
                  saleStock: Math.max(1, Number(fsForm.saleStock)),
                  soldCount: Math.max(0, Number(fsForm.soldCount)),
                  startDate: startIso,
                  endDate: endIso,
                  active: fsForm.active,
                },
                editingFlashCreatedAt
              );
              setFeedback(editingFlashSaleId ? 'Flash Sale updated.' : 'Flash Sale created.');
              setEditingFlashSaleId(null);
              setEditingFlashCreatedAt(undefined);
              setFsForm({
                title: 'Lightning Deal',
                productId: '',
                salePrice: 0,
                discountPercent: 25,
                saleStock: 15,
                soldCount: 0,
                startDate: new Date().toISOString().slice(0, 16),
                endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
                active: true,
              });
              await refreshAll();
            }}
            className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 h-fit"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FCA311] fill-[#FCA311]" />
              <h2 className="font-bold text-[#14213D]">
                {editingFlashSaleId ? 'Edit Flash Sale' : 'Create Flash Sale'}
              </h2>
            </div>

            <select
              required
              value={fsForm.productId}
              onChange={(e) => {
                const catalogPool = products.length > 0 ? products : STARTER_PRODUCTS;
                const prod = catalogPool.find((p) => p.id === e.target.value);
                if (prod) {
                  const pct = fsForm.discountPercent || 25;
                  const suggestedSale = Math.max(1, Math.round(prod.originalPrice * (1 - pct / 100)));
                  setFsForm({
                    ...fsForm,
                    productId: prod.id,
                    salePrice: suggestedSale,
                  });
                } else {
                  setFsForm({ ...fsForm, productId: '' });
                }
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Select Product</option>
              {(products.length > 0 ? products : STARTER_PRODUCTS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (MRP {formatINR(p.originalPrice)})
                </option>
              ))}
            </select>

            <input
              required
              placeholder="Flash Sale Label (e.g. Audio Lightning Deal)"
              value={fsForm.title}
              onChange={(e) => setFsForm({ ...fsForm, title: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Discount %
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  max={90}
                  value={fsForm.discountPercent}
                  onChange={(e) => {
                    const pct = Math.max(0, Math.min(90, Number(e.target.value)));
                    const catalogPool = products.length > 0 ? products : STARTER_PRODUCTS;
                    const prod = catalogPool.find((p) => p.id === fsForm.productId);
                    const nextPrice = prod
                      ? Math.max(1, Math.round(prod.originalPrice * (1 - pct / 100)))
                      : fsForm.salePrice;
                    setFsForm({ ...fsForm, discountPercent: pct, salePrice: nextPrice });
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Sale Price ₹
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  value={fsForm.salePrice || ''}
                  onChange={(e) => {
                    const price = Math.max(1, Number(e.target.value));
                    const catalogPool = products.length > 0 ? products : STARTER_PRODUCTS;
                    const prod = catalogPool.find((p) => p.id === fsForm.productId);
                    const nextPct =
                      prod && prod.originalPrice > 0
                        ? Math.max(0, Math.round(((prod.originalPrice - price) / prod.originalPrice) * 100))
                        : fsForm.discountPercent;
                    setFsForm({ ...fsForm, salePrice: price, discountPercent: nextPct });
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Sale Stock
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  value={fsForm.saleStock}
                  onChange={(e) => setFsForm({ ...fsForm, saleStock: Math.max(1, Number(e.target.value)) })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Start Date &amp; Time
                </label>
                <input
                  required
                  type="datetime-local"
                  value={fsForm.startDate}
                  onChange={(e) => setFsForm({ ...fsForm, startDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  End Date &amp; Time
                </label>
                <input
                  required
                  type="datetime-local"
                  value={fsForm.endDate}
                  onChange={(e) => setFsForm({ ...fsForm, endDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#14213D]">
              <input
                type="checkbox"
                checked={fsForm.active}
                onChange={(e) => setFsForm({ ...fsForm, active: e.target.checked })}
                className="rounded border-slate-300"
              />
              Flash Sale Active
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] text-white font-semibold text-sm hover:bg-blue-700"
              >
                {editingFlashSaleId ? 'Update Flash Sale' : 'Create Flash Sale'}
              </button>
              {editingFlashSaleId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingFlashSaleId(null);
                    setEditingFlashCreatedAt(undefined);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-2 min-w-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 overflow-x-auto space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#14213D]">Managed Flash Sales ({flashSales.length})</h3>
              {flashSales.length === 0 && (
                <span className="text-xs text-slate-500">
                  Click &quot;Sync Starter Catalog&quot; above to seed starter deals or create one on the left.
                </span>
              )}
            </div>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="py-2">Product &amp; Deal</th>
                  <th>Pricing</th>
                  <th>Stock</th>
                  <th>Schedule &amp; Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flashSales.map((s) => {
                  const isLive = isFlashSaleCurrentlyActive(s);
                  const isEnded = Date.now() > new Date(s.endDate).getTime();
                  const statusLabel = !s.active
                    ? 'PAUSED'
                    : isLive
                    ? 'LIVE'
                    : isEnded
                    ? 'ENDED'
                    : 'UPCOMING';

                  return (
                    <tr key={s.id} className="border-b last:border-b-0 align-top">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-[#14213D] max-w-xs truncate">{s.productName}</p>
                        <p className="text-xs text-amber-700 font-bold">{s.title}</p>
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs whitespace-nowrap">
                        <p className="font-bold text-[#14213D]">{formatINR(s.salePrice)}</p>
                        <p className="text-slate-400 line-through">{formatINR(s.originalPrice)}</p>
                        <p className="text-emerald-700 font-bold">{s.discountPercent}% off</p>
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs whitespace-nowrap">
                        {s.soldCount || 0} / {s.saleStock} sold
                      </td>
                      <td className="py-3 pr-3 text-xs space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-extrabold text-[10px] ${
                            statusLabel === 'LIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : statusLabel === 'UPCOMING'
                              ? 'bg-blue-100 text-blue-800'
                              : statusLabel === 'PAUSED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {statusLabel}
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {new Date(s.startDate).toLocaleDateString('en-IN')} →{' '}
                          {new Date(s.endDate).toLocaleDateString('en-IN')}
                        </p>
                      </td>
                      <td className="py-3 space-x-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={async () => {
                            await updateDoc(doc(db, 'flashSales', s.id), {
                              active: !s.active,
                              updatedAt: new Date().toISOString(),
                            });
                            refreshAll();
                          }}
                          className="text-xs font-semibold text-[#2563EB]"
                        >
                          {s.active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFlashSaleId(s.id);
                            setEditingFlashCreatedAt(s.createdAt);
                            setFsForm({
                              title: s.title,
                              productId: s.productId,
                              salePrice: s.salePrice,
                              discountPercent: s.discountPercent,
                              saleStock: s.saleStock,
                              soldCount: s.soldCount || 0,
                              startDate: new Date(s.startDate).toISOString().slice(0, 16),
                              endDate: new Date(s.endDate).toISOString().slice(0, 16),
                              active: s.active,
                            });
                          }}
                          className="text-xs font-semibold text-[#14213D]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFlashSale(s.id).then(refreshAll)}
                          className="text-xs font-semibold text-red-600"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'support' && user && (
        <AdminSupportPanel
          tickets={supportTickets}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'reviews' && user && (
        <AdminReviewsPanel
          reviews={reviews}
          products={products}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'settings' && user && (
        <AdminSettingsPanel
          settings={storeSettings}
          auditLogs={auditLogs}
          adminUid={user.uid}
          adminEmail={user.email || 'admin@cartzy.in'}
          onFeedback={setFeedback}
          onRefresh={refreshAll}
        />
      )}

      {tab === 'payments' && <AdminPaymentsPanel payments={payments} />}

      {tab === 'audit' && <AdminAuditLogsPanel auditLogs={auditLogs} />}

      {mapModalOrder && (
        <OrderLocationMapModal
          isOpen={Boolean(mapModalOrder)}
          onClose={() => setMapModalOrder(null)}
          apiKey={getBrowserMapsApiKey(serverConfig?.googleMapsApiKey)}
          orderNumber={mapModalOrder.orderNumber}
          recipientName={mapModalOrder.customerInfo.fullName}
          addressText={[
            mapModalOrder.deliveryAddress.houseNo,
            mapModalOrder.deliveryAddress.street,
            mapModalOrder.deliveryAddress.locality,
            mapModalOrder.deliveryAddress.landmark,
            mapModalOrder.deliveryAddress.city,
            mapModalOrder.deliveryAddress.district,
            `${mapModalOrder.deliveryAddress.state} - ${mapModalOrder.deliveryAddress.pincode}`,
          ]
            .filter(Boolean)
            .join(', ')}
          lat={mapModalOrder.deliveryAddress.lat}
          lng={mapModalOrder.deliveryAddress.lng}
        />
      )}
    </div>
  );
};
