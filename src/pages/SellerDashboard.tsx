import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  HelpCircle,
  IndianRupee,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Search,
  ShieldAlert,
  Star,
  Store,
  Trash2,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { fetchActiveCategories, getServerConfigStatus } from '../services/storeService';
import {
  SellerAllowedOrderStatus,
  computeSellerAnalytics,
  fetchMySellerProfile,
  fetchSellerOrders,
  fetchSellerProductReviews,
  fetchSellerProducts,
  fetchSellerSettlements,
  fetchSellerSupportTickets,
  sellerReplyToReview,
  sellerUpdateOrderStatus,
  submitSellerSupportTicket,
  updateMySellerProfile,
  uploadSellerFile,
} from '../services/marketplaceService';
import {
  INDIAN_STATES,
  formatINR,
  isValidIndianMobile,
  isValidIndianPincode,
} from '../services/indianValidation';
import { getBrowserMapsApiKey, ParsedGoogleAddress } from '../services/mapsAddressParser';
import { DEFAULT_VIJAYAWADA_ZONES } from '../data/vijayawadaDefaults';
import { DEFAULT_PRODUCT_IMAGE } from '../data/starterCatalog';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import {
  Category,
  Order,
  OrderStatus,
  Product,
  Review,
  SellerProfile,
  SellerSettlement,
  SellerVerificationDoc,
  ServerConfigStatus,
  SupportTicket,
} from '../types';
import { DeliveryLocationPicker } from '../components/maps/DeliveryLocationPicker';
import { SafeImage } from '../components/common/SafeImage';

type SellerTab = 'overview' | 'products' | 'orders' | 'reviews' | 'earnings' | 'profile' | 'support';
type OrderFilterTab = 'ALL' | 'PENDING' | 'PREPARING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
type ProductFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'LOW_STOCK';

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

export const SellerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    notifications,
    unreadCount: unreadNotifsCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const navigate = useNavigate();

  const [tab, setTab] = useState<SellerTab>('overview');
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replyDraftByReview, setReplyDraftByReview] = useState<Record<string, string>>({});
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<SellerSettlement[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);

  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Filters
  const [orderFilter, setOrderFilter] = useState<OrderFilterTab>('ALL');
  const [productFilter, setProductFilter] = useState<ProductFilter>('ALL');
  const [productSearch, setProductSearch] = useState('');

  // Product form
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
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
    imageUrl: '',
    imagesText: '',
    description: '',
    active: true,
  });

  // Profile form & Map Picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadingProfileMedia, setUploadingProfileMedia] = useState<string | null>(null);
  const [verificationDocs, setVerificationDocs] = useState<SellerVerificationDoc[]>([]);
  const [pendingDocType, setPendingDocType] = useState<SellerVerificationDoc['docType']>('PAN Card');
  const [pendingDocUrl, setPendingDocUrl] = useState('');
  const [profForm, setProfForm] = useState({
    businessName: '',
    ownerName: '',
    email: '',
    mobile: '',
    shopCategory: 'Groceries',
    shopPhone: '',
    description: '',
    logoUrl: '',
    coverImageUrl: '',
    gstin: '',
    payoutUpiOrBank: '',
    houseNo: '',
    street: '',
    locality: '',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    pincode: '520012',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    serviceZones: DEFAULT_VIJAYAWADA_ZONES.map((z) => z.id),
    openTime: '08:00',
    closeTime: '22:00',
    temporarilyClosed: false,
  });

  // Support ticket form
  const [ticketForm, setTicketForm] = useState({
    topic: 'Order Fulfillment / Dispatch',
    orderNumber: '',
    message: '',
  });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [sProf, cats, cfg] = await Promise.all([
        fetchMySellerProfile(user.uid),
        fetchActiveCategories(),
        getServerConfigStatus(),
      ]);
      setSeller(sProf);
      setCategories(cats);
      setServerConfig(cfg);

      if (sProf) {
        setProfForm({
          businessName: sProf.businessName,
          ownerName: sProf.ownerName,
          email: sProf.email,
          mobile: sProf.mobile,
          shopCategory: sProf.shopCategory || 'Groceries',
          shopPhone: sProf.shopPhone || '',
          description: sProf.description || '',
          logoUrl: sProf.logoUrl || '',
          coverImageUrl: sProf.coverImageUrl || '',
          gstin: sProf.gstin || '',
          payoutUpiOrBank: sProf.payoutUpiOrBank || '',
          houseNo: sProf.pickupAddress.houseNo,
          street: sProf.pickupAddress.street,
          locality: sProf.pickupAddress.locality,
          city: sProf.pickupAddress.city,
          state: sProf.pickupAddress.state,
          pincode: sProf.pickupAddress.pincode,
          lat: sProf.pickupAddress.lat,
          lng: sProf.pickupAddress.lng,
          serviceZones:
            sProf.serviceZones && sProf.serviceZones.length > 0
              ? sProf.serviceZones
              : DEFAULT_VIJAYAWADA_ZONES.map((z) => z.id),
          openTime: sProf.operatingHours?.openTime || '08:00',
          closeTime: sProf.operatingHours?.closeTime || '22:00',
          temporarilyClosed: Boolean(sProf.operatingHours?.temporarilyClosed),
        });
        setVerificationDocs(sProf.verificationDocs || []);

        const [prods, ords, setts, tks] = await Promise.all([
          fetchSellerProducts(user.uid),
          fetchSellerOrders(user.uid),
          fetchSellerSettlements(user.uid),
          fetchSellerSupportTickets(user.uid),
        ]);
        const revs = await fetchSellerProductReviews(user.uid, prods);
        setProducts(prods);
        setOrders(ords);
        setReviews(revs);
        setSettlements(setts);
        setTickets(tks);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  const analytics = useMemo(
    () =>
      computeSellerAnalytics({
        orders,
        settlements,
        products,
        sellerId: user?.uid || '',
      }),
    [orders, settlements, products, user?.uid]
  );

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (productFilter === 'ACTIVE' && p.active === false) return false;
      if (productFilter === 'INACTIVE' && p.active !== false) return false;
      if (productFilter === 'LOW_STOCK' && (p.stock || 0) > 5) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q)
      );
    });
  }, [products, productFilter, productSearch]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (orderFilter === 'ALL') return true;
      if (orderFilter === 'PENDING') {
        return ['Order Placed', 'Confirmed', 'Accepted'].includes(o.orderStatus);
      }
      if (orderFilter === 'PREPARING') {
        return ['Processing', 'Preparing', 'Packed', 'Ready for Pickup'].includes(o.orderStatus);
      }
      if (orderFilter === 'SHIPPED') {
        return ['Shipped', 'Out for Delivery'].includes(o.orderStatus);
      }
      if (orderFilter === 'COMPLETED') {
        return o.orderStatus === 'Delivered';
      }
      if (orderFilter === 'CANCELLED') {
        return ['Cancelled', 'Returned', 'Return Requested'].includes(o.orderStatus);
      }
      return true;
    });
  }, [orders, orderFilter]);

  const liveDiscountPct = useMemo(() => {
    const orig = Number(pForm.originalPrice || 0);
    const sell = Number(pForm.sellingPrice || 0);
    if (orig > 0 && sell > 0 && sell <= orig) {
      return Math.round(((orig - sell) / orig) * 100);
    }
    return 0;
  }, [pForm.originalPrice, pForm.sellingPrice]);

  const categoryOptions = Array.from(
    new Set([...categories.map((c) => c.name), ...SHOP_CATEGORIES])
  );

  const handleToggleShopOpen = async () => {
    if (!user || !seller) return;
    setError('');
    setFeedback('');
    const nextClosed = !Boolean(seller.operatingHours?.temporarilyClosed);
    try {
      await updateMySellerProfile(user.uid, {
        businessName: seller.businessName,
        ownerName: seller.ownerName,
        email: seller.email,
        mobile: seller.mobile,
        shopCategory: seller.shopCategory,
        shopPhone: seller.shopPhone,
        description: seller.description,
        logoUrl: seller.logoUrl,
        coverImageUrl: seller.coverImageUrl,
        verificationDocs: seller.verificationDocs,
        gstin: seller.gstin,
        payoutUpiOrBank: seller.payoutUpiOrBank,
        cityId: seller.cityId || 'vijayawada',
        serviceZones: seller.serviceZones,
        operatingHours: {
          openTime: seller.operatingHours?.openTime || '08:00',
          closeTime: seller.operatingHours?.closeTime || '22:00',
          daysOpen: seller.operatingHours?.daysOpen || [0, 1, 2, 3, 4, 5, 6],
          is24x7: Boolean(seller.operatingHours?.is24x7),
          temporarilyClosed: nextClosed,
        },
        pickupAddress: seller.pickupAddress,
      });
      setFeedback(nextClosed ? 'Shop marked Temporarily Closed on CARTZY.' : 'Shop is now OPEN for orders.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Unable to toggle shop open status.');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    e.target.value = '';
    if (files.length === 0 || !user) return;
    setUploadingImg(true);
    setError('');
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const storageRef = ref(storage, `products/${user.uid}_${Date.now()}_${file.name}`);
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
      setError(`Image upload failed (${err?.message || 'Storage disabled'}). Paste direct image URLs below.`);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !seller) return;
    setError('');
    setFeedback('');

    const orig = Math.max(1, Number(pForm.originalPrice));
    const sell = Math.max(1, Number(pForm.sellingPrice));
    if (sell > orig) {
      setError('Selling price cannot exceed Original MRP.');
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

    const specifications: Record<string, string> = { Seller: seller.businessName };
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

    const updatePayload: Record<string, any> = {
      sku: (pForm.sku || `SL-${Date.now().toString().slice(-6)}`).trim(),
      name: pForm.name.trim(),
      slug: pForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: pForm.description.trim() || `${pForm.name.trim()} sold by ${seller.businessName}`,
      categoryId: pForm.categoryId,
      categoryName: cat?.name || 'General',
      brand: pForm.brand.trim() || seller.businessName,
      images: finalImages,
      originalPrice: orig,
      sellingPrice: sell,
      discountPercent,
      stock: Math.max(0, Number(pForm.stock)),
      taxRatePercent: Math.max(0, Math.min(40, Number(pForm.taxRatePercent || 18))),
      availableSizes,
      availableColors,
      specifications,
      tags: parsedTags.length > 0 ? parsedTags : ['marketplace', 'seller'],
      sellerName: seller.businessName,
      cityId: seller.cityId || 'vijayawada',
      serviceZones:
        seller.serviceZones && seller.serviceZones.length > 0
          ? seller.serviceZones
          : DEFAULT_VIJAYAWADA_ZONES.map((z) => z.id),
      active: pForm.active,
      updatedAt: now,
    };

    try {
      if (editingProdId) {
        await updateDoc(doc(db, 'products', editingProdId), updatePayload);
        setFeedback('Product updated.');
        setEditingProdId(null);
      } else {
        await addDoc(collection(db, 'products'), {
          ...updatePayload,
          sellerId: user.uid,
          approvalStatus: 'Approved',
          ratingAvg: 0,
          reviewCount: 0,
          soldCount: 0,
          createdAt: now,
        });
        setFeedback('New product published to CARTZY.');
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
        imageUrl: '',
        imagesText: '',
        description: '',
        active: true,
      });
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Unable to save product.');
    }
  };

  const handleAdjustStock = async (p: Product, delta: number) => {
    const nextStock = Math.max(0, Number(p.stock || 0) + delta);
    await updateDoc(doc(db, 'products', p.id), {
      stock: nextStock,
      updatedAt: new Date().toISOString(),
    });
    await loadAll();
  };

  const handleOrderTransition = async (
    order: Order,
    status: SellerAllowedOrderStatus,
    reason?: string
  ) => {
    if (!user) return;
    setError('');
    setFeedback('');
    setBusyOrderId(order.id);
    try {
      await sellerUpdateOrderStatus(order.id, user.uid, status, reason);
      setRejectOrderId(null);
      setRejectReason('');
      setFeedback(
        status === 'Cancelled'
          ? `Order ${order.orderNumber} rejected and items restocked.`
          : `Order ${order.orderNumber} updated to ${status}.`
      );
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Unable to update order status.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleExportSettlementsCsv = () => {
    const headers = [
      'Order Number',
      'Date',
      'Gross INR',
      'Commission %',
      'Commission INR',
      'Net Payout INR',
      'Status',
      'UTR / Reference',
      'Deduction Note',
    ];
    const rows = settlements.map((s) => [
      s.orderNumber,
      new Date(s.createdAt).toLocaleDateString('en-IN'),
      s.grossAmount,
      s.commissionPercent,
      s.commissionAmount,
      s.netPayoutAmount,
      s.status,
      s.payoutReference || '',
      s.deductionReason || '',
    ]);
    const csv = [headers, ...rows]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cartzy_seller_earnings_${seller?.businessName.replace(/\W+/g, '_') || 'report'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleProfileMediaUpload = async (
    folder: 'logos' | 'covers' | 'docs',
    file?: File | null
  ) => {
    if (!file || !user) return;
    setError('');
    setFeedback('');
    setUploadingProfileMedia(folder);
    try {
      const url = await uploadSellerFile({ uid: user.uid, folder, file });
      if (folder === 'logos') {
        setProfForm((prev) => ({ ...prev, logoUrl: url }));
        setFeedback('Logo uploaded. Save profile to publish.');
      } else if (folder === 'covers') {
        setProfForm((prev) => ({ ...prev, coverImageUrl: url }));
        setFeedback('Cover banner uploaded. Save profile to publish.');
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
        setFeedback('Verification document attached. Save profile to update KYC record.');
      }
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setUploadingProfileMedia(null);
    }
  };

  const handleMapConfirm = (resolved: ParsedGoogleAddress) => {
    setProfForm((prev) => ({
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

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading Seller Portal...</div>;
  }

  if (!seller) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
          <Store className="w-12 h-12 text-[#2563EB] mx-auto" />
          <h1 className="text-2xl font-extrabold text-[#14213D]">No Seller Store Registered</h1>
          <p className="text-sm text-slate-600">
            This account does not have a registered CARTZY shop yet. Apply to register your Vijayawada shop or sign in with your existing Seller account.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to="/seller/register"
              className="px-6 py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-sm font-bold"
            >
              Register Your Shop
            </Link>
            <button
              type="button"
              onClick={() => logout().then(() => navigate('/seller/login'))}
              className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (seller.approvalStatus !== 'Approved') {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
          {seller.approvalStatus === 'Suspended' || seller.approvalStatus === 'Rejected' ? (
            <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
          ) : (
            <Clock className="w-12 h-12 text-[#FCA311] mx-auto" />
          )}
          <h1 className="text-2xl font-extrabold text-[#14213D]">{seller.businessName}</h1>
          <p className="text-sm text-slate-600">
            Verification Status: <strong>{seller.approvalStatus}</strong>
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            {seller.approvalStatus === 'Pending'
              ? 'Your seller application is queued for review by CARTZY Admin. Once approved, product publishing and order fulfillment unlock automatically.'
              : seller.approvalStatus === 'Under Review'
              ? 'CARTZY Admin is currently inspecting your shop address & KYC documents.'
              : seller.approvalStatus === 'Rejected'
              ? seller.rejectionReason
                ? `Application returned for updates: ${seller.rejectionReason}`
                : 'Your application was returned by Admin. Review your details and resubmit.'
              : seller.rejectionReason
              ? `Account suspended: ${seller.rejectionReason}. Contact ${BUSINESS_CONFIG.supportEmail}.`
              : `Your seller store is currently suspended. Reach out to ${BUSINESS_CONFIG.supportEmail}.`}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {seller.approvalStatus === 'Rejected' && (
              <Link
                to="/seller/register"
                className="px-5 py-2.5 rounded-xl bg-[#FCA311] text-[#14213D] text-xs font-extrabold"
              >
                Edit &amp; Resubmit Application
              </Link>
            )}
            <Link
              to="/"
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold"
            >
              Return to Storefront
            </Link>
            <button
              type="button"
              onClick={() => logout().then(() => navigate('/seller/login'))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const maxDailySales = Math.max(1, ...analytics.dailySalesSeries.map((d) => d.sales));
  const isShopClosed = Boolean(seller.operatingHours?.temporarilyClosed);

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-10 space-y-6">
      {/* Crisp Top Workspace Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {seller.logoUrl ? (
              <img
                src={seller.logoUrl}
                alt={seller.businessName}
                className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#14213D] text-[#FCA311] flex items-center justify-center shrink-0">
                <Store className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                  Seller Central
                </span>
                {seller.shopCategory && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    · {seller.shopCategory}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#14213D] truncate">
                {seller.businessName}
              </h1>
              <p className="text-xs text-slate-500">
                Commission: <strong className="font-mono tabular-nums">{seller.commissionPercent}%</strong> ·{' '}
                {seller.pickupAddress.locality}, {seller.pickupAddress.city} ({seller.pickupAddress.pincode})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleShopOpen}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                isShopClosed
                  ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Shop Status: {isShopClosed ? 'Closed (Click to Open)' : 'Open (Accepting Orders)'}
            </button>
            <button
              type="button"
              onClick={() => setTab('support')}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#14213D] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Alerts ({unreadNotifsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => logout().then(() => navigate('/seller/login'))}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'products', label: `Products (${products.length})` },
              { id: 'orders', label: `Orders (${orders.length})` },
              { id: 'reviews', label: `Reviews (${reviews.length})` },
              { id: 'earnings', label: 'Earnings & Payouts' },
              { id: 'profile', label: 'Shop Profile' },
              { id: 'support', label: `Alerts & Support${unreadNotifsCount ? ` (${unreadNotifsCount})` : ''}` },
            ] as Array<{ id: SellerTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                tab === t.id
                  ? 'bg-[#14213D] text-white'
                  : 'bg-[#F8FAFC] border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Sales', val: formatINR(analytics.totalGrossSales), sub: 'Active & delivered orders' },
              { label: 'Net Earnings', val: formatINR(analytics.netEarnings), sub: `Pending ${formatINR(analytics.pendingSettlementAmount)}` },
              { label: 'Total Orders', val: analytics.totalOrders, sub: `${analytics.completedOrders} completed` },
              { label: 'Pending Orders', val: analytics.pendingOrders, sub: 'Awaiting preparation / transit' },
              { label: 'Completed Orders', val: analytics.completedOrders, sub: 'Handover PIN verified' },
              { label: 'Cancelled / Returned', val: analytics.cancelledOrders, sub: `${analytics.returnRequestedOrders} return req` },
              { label: 'Total Products', val: analytics.totalProducts, sub: `${analytics.activeProducts} active in catalog` },
              { label: 'Available Stock', val: analytics.availableStockUnits, sub: 'Units across all listings' },
            ].map((card) => (
              <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-200">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <p className="text-xl sm:text-2xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">
                  {card.val}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Live Data Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-[#14213D] text-sm">Last 7 Days Sales (Real Orders)</h2>
                  <p className="text-xs text-slate-500">Computed directly from non-cancelled vendor orders</p>
                </div>
                <IndianRupee className="w-4 h-4 text-[#2563EB]" />
              </div>

              <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
                {analytics.dailySalesSeries.map((day) => {
                  const pct = day.sales > 0 ? Math.max(8, Math.round((day.sales / maxDailySales) * 100)) : 4;
                  return (
                    <div key={day.dateKey} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[10px] font-mono tabular-nums text-slate-500">
                        {day.sales > 0 ? `₹${Math.round(day.sales)}` : '0'}
                      </span>
                      <div className="w-full max-w-[34px] flex-1 flex items-end">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t-md ${
                            day.sales > 0 ? 'bg-[#2563EB]' : 'bg-slate-100'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-[#14213D] text-sm">Order Stage Breakdown</h2>
                  <p className="text-xs text-slate-500">Live fulfillment pipeline distribution</p>
                </div>
                <Package className="w-4 h-4 text-[#FCA311]" />
              </div>

              <div className="space-y-3">
                {analytics.statusBreakdown.map((item) => {
                  const widthPct =
                    analytics.totalOrders > 0
                      ? Math.round((item.count / analytics.totalOrders) * 100)
                      : 0;
                  const barColor =
                    item.tone === 'emerald'
                      ? 'bg-emerald-600'
                      : item.tone === 'red'
                      ? 'bg-red-500'
                      : item.tone === 'amber'
                      ? 'bg-[#FCA311]'
                      : 'bg-[#2563EB]';
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{item.label}</span>
                        <span className="font-mono font-bold tabular-nums text-[#14213D]">
                          {item.count}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div style={{ width: `${widthPct}%` }} className={`h-full ${barColor}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#14213D]">Recent Customer Orders ({orders.length})</h2>
              <button
                type="button"
                onClick={() => setTab('orders')}
                className="text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
              >
                Manage All Orders &rarr;
              </button>
            </div>
            {orders.length === 0 ? (
              <p className="text-xs text-slate-500">No customer orders contain your products yet.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {orders.slice(0, 6).map((o) => {
                  const myItems = o.itemsPreview.filter((i) => i.sellerId === user?.uid);
                  const myTotal = myItems.reduce((s, i) => s + i.lineTotal, 0);
                  return (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#F8FAFC] border border-slate-200"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#14213D]">{o.orderNumber}</span> ·{' '}
                        {o.deliveryAddress.locality}, {o.deliveryAddress.city} ({o.deliveryAddress.pincode})
                        <p className="text-slate-500 mt-0.5">
                          {myItems.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold tabular-nums text-[#14213D]">
                          {formatINR(myTotal)}
                        </p>
                        <span className="text-[11px] font-bold text-[#2563EB]">{o.orderStatus}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS */}
      {tab === 'products' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <form onSubmit={handleSaveProduct} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 h-fit">
            <h2 className="font-bold text-[#14213D]">
              {editingProdId ? 'Edit Product' : 'Add New Product'}
            </h2>
            <input
              required
              placeholder="Product Name *"
              value={pForm.name}
              onChange={(e) => setPForm({ ...pForm, name: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="Brand *"
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
              <option value="">Select Category *</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
                placeholder="Sell ₹"
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
            {liveDiscountPct > 0 && (
              <p className="text-[11px] font-bold text-emerald-700 font-mono tabular-nums">
                Auto-calculated discount: {liveDiscountPct}% OFF
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Sizes (comma-separated, e.g. S,M,L)"
                value={pForm.sizesText}
                onChange={(e) => setPForm({ ...pForm, sizesText: e.target.value })}
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
              <input
                placeholder="Colors (comma-separated)"
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
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-[#14213D] hover:bg-slate-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingImg ? 'Uploading...' : 'Upload Product Images (max 8)'}</span>
              <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            </label>
            <input
              placeholder="Search Tags (comma-separated, e.g. fresh,local,cotton)"
              value={pForm.tagsText}
              onChange={(e) => setPForm({ ...pForm, tagsText: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              placeholder="Specifications (Key: Value per line)"
              value={pForm.specificationsText}
              onChange={(e) => setPForm({ ...pForm, specificationsText: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              rows={3}
              placeholder="Description & key specs"
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
              Active &amp; available in storefront
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer"
              >
                {editingProdId ? 'Update Product' : 'Publish Product'}
              </button>
              {editingProdId && (
                <button
                  type="button"
                  onClick={() => setEditingProdId(null)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-2 min-w-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-[#14213D]">My Catalog ({filteredProducts.length})</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    placeholder="Filter products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs w-44"
                  />
                </div>
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value as ProductFilter)}
                  className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="ALL">All</option>
                  <option value="ACTIVE">Available</option>
                  <option value="INACTIVE">Unavailable</option>
                  <option value="LOW_STOCK">Low Stock (&le;5)</option>
                </select>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No products match your current filter.
              </p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b text-xs text-slate-500">
                    <th className="py-2">Product</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Availability</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="border-b last:border-b-0">
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-2.5">
                          <SafeImage
                            src={p.images?.[0]}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-[#14213D] max-w-[210px] truncate">{p.name}</p>
                            <span className="text-[11px] font-mono text-slate-400">
                              {p.sku} · {p.categoryName}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono tabular-nums whitespace-nowrap pr-2">
                        <span className="font-bold text-[#14213D]">{formatINR(p.sellingPrice)}</span>
                        {p.originalPrice > p.sellingPrice && (
                          <span className="block text-[11px] text-slate-400 line-through">
                            {formatINR(p.originalPrice)}
                          </span>
                        )}
                      </td>
                      <td className="pr-2 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 border border-slate-200 rounded-lg px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(p, -1)}
                            aria-label="Decrease stock"
                            className="p-1 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono tabular-nums text-xs font-bold px-1.5">
                            {p.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(p, 1)}
                            aria-label="Increase stock"
                            className="p-1 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="pr-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateDoc(doc(db, 'products', p.id), {
                              active: !(p.active !== false),
                              updatedAt: new Date().toISOString(),
                            }).then(loadAll)
                          }
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer ${
                            p.active !== false
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {p.active !== false ? 'Available' : 'Unavailable'}
                        </button>
                      </td>
                      <td className="space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProdId(p.id);
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
                                .filter(([k]) => k !== 'Seller')
                                .map(([k, v]) => `${k}: ${v}`)
                                .join('\n'),
                              imageUrl: p.images[0] || '',
                              imagesText: (p.images || []).join('\n'),
                              description: p.description,
                              active: p.active !== false,
                            });
                          }}
                          className="text-xs font-semibold text-[#2563EB] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDoc(doc(db, 'products', p.id)).then(loadAll)}
                          className="text-xs font-semibold text-red-600 cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ORDERS */}
      {tab === 'orders' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 overflow-x-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#14213D]">Order Management ({filteredOrders.length})</h2>
              <p className="text-xs text-slate-500">
                Note: Only verified CARTZY delivery partners (via customer 4-digit Handover PIN) or Admins mark orders Delivered.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'PENDING', label: 'New / Pending' },
                  { id: 'PREPARING', label: 'Preparing / Ready' },
                  { id: 'SHIPPED', label: 'Dispatched' },
                  { id: 'COMPLETED', label: 'Completed' },
                  { id: 'CANCELLED', label: 'Cancelled / Returns' },
                ] as Array<{ id: OrderFilterTab; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOrderFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    orderFilter === f.id
                      ? 'bg-[#14213D] text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No orders match this status filter.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="py-2">Order</th>
                  <th>Your Items</th>
                  <th>Customer Delivery Area</th>
                  <th>Status</th>
                  <th>Fulfillment Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => {
                  const myItems = o.itemsPreview.filter((i) => i.sellerId === user?.uid);
                  const myTotal = myItems.reduce((s, i) => s + i.lineTotal, 0);
                  const canReject = [
                    'Order Placed',
                    'Confirmed',
                    'Accepted',
                    'Processing',
                    'Preparing',
                  ].includes(o.orderStatus);
                  const canAdvance = [
                    'Order Placed',
                    'Confirmed',
                    'Accepted',
                    'Processing',
                    'Preparing',
                    'Packed',
                    'Ready for Pickup',
                  ].includes(o.orderStatus);

                  return (
                    <tr key={o.id} className="border-b last:border-b-0 align-top">
                      <td className="py-3 pr-3 font-mono font-bold text-[#14213D] whitespace-nowrap">
                        {o.orderNumber}
                        <p className="text-[11px] font-sans font-normal text-slate-500">
                          {new Date(o.createdAt).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs font-mono font-bold text-emerald-700 mt-0.5 tabular-nums">
                          {formatINR(myTotal)}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-xs space-y-1">
                        {myItems.map((i, idx) => (
                          <div key={idx}>
                            {i.name} × {i.quantity}{' '}
                            <span className="font-mono font-semibold tabular-nums">
                              ({formatINR(i.lineTotal)})
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <p className="font-semibold text-[#14213D]">{o.customerInfo.fullName}</p>
                        <p className="text-slate-600">
                          {o.deliveryAddress.locality}, {o.deliveryAddress.city} - {o.deliveryAddress.pincode}
                        </p>
                        {o.serviceAreaMeta?.zoneName && (
                          <p className="text-[11px] text-[#2563EB]">{o.serviceAreaMeta.zoneName}</p>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs font-bold text-[#2563EB] whitespace-nowrap">
                        {o.orderStatus}
                        {o.assignedDriverId && !['Delivered', 'Cancelled', 'Returned'].includes(o.orderStatus) && (
                          <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                            Driver Assigned
                          </p>
                        )}
                      </td>
                      <td className="py-3 space-y-2">
                        {canAdvance ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(['Order Placed', 'Confirmed'] as OrderStatus[]).includes(o.orderStatus) && (
                              <button
                                type="button"
                                disabled={busyOrderId === o.id}
                                onClick={() => handleOrderTransition(o, 'Accepted')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Accept Order
                              </button>
                            )}
                            {(['Order Placed', 'Confirmed', 'Accepted', 'Processing'] as OrderStatus[]).includes(o.orderStatus) && (
                              <button
                                type="button"
                                disabled={busyOrderId === o.id}
                                onClick={() => handleOrderTransition(o, 'Preparing')}
                                className="px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Mark Preparing
                              </button>
                            )}
                            {(['Accepted', 'Processing', 'Preparing', 'Packed'] as OrderStatus[]).includes(o.orderStatus) && (
                              <button
                                type="button"
                                disabled={busyOrderId === o.id}
                                onClick={() => handleOrderTransition(o, 'Ready for Pickup')}
                                className="px-2.5 py-1.5 rounded-lg bg-[#14213D] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Ready for Pickup
                              </button>
                            )}
                            {(['Preparing', 'Packed', 'Ready for Pickup'] as OrderStatus[]).includes(o.orderStatus) && (
                              <button
                                type="button"
                                disabled={busyOrderId === o.id}
                                onClick={() => handleOrderTransition(o, 'Shipped')}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[#14213D] hover:bg-slate-50 text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Mark Shipped
                              </button>
                            )}
                            {canReject && rejectOrderId !== o.id && (
                              <button
                                type="button"
                                disabled={busyOrderId === o.id}
                                onClick={() => {
                                  setRejectOrderId(o.id);
                                  setRejectReason('');
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject Order
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {o.orderStatus === 'Shipped' || o.orderStatus === 'Out for Delivery'
                              ? 'With Delivery Partner'
                              : `Locked at ${o.orderStatus}`}
                          </span>
                        )}

                        {rejectOrderId === o.id && (
                          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 space-y-2 max-w-xs">
                            <input
                              placeholder="Reason for rejecting order (required)..."
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full border border-red-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                            />
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={!rejectReason.trim() || busyOrderId === o.id}
                                onClick={() => handleOrderTransition(o, 'Cancelled', rejectReason)}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                              >
                                Confirm Reject &amp; Restock
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectOrderId(null)}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 4: EARNINGS & PAYOUTS */}
      {tab === 'earnings' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total Sales', val: formatINR(analytics.totalGrossSales), cls: 'text-[#14213D]' },
              { label: 'Commission Deducted', val: `-${formatINR(analytics.commissionDeducted)}`, cls: 'text-slate-700' },
              { label: 'Refund / Cancel Deductions', val: `-${formatINR(analytics.refundDeductions)}`, cls: 'text-red-600' },
              { label: 'Pending Settlements', val: formatINR(analytics.pendingSettlementAmount), cls: 'text-amber-700' },
              { label: 'Paid Settlements', val: formatINR(analytics.paidSettlementAmount), cls: 'text-emerald-700' },
              { label: 'Net Earnings', val: formatINR(analytics.netEarnings), cls: 'text-[#14213D]' },
            ].map((k) => (
              <div key={k.label} className="bg-white p-4 rounded-2xl border border-slate-200">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className={`text-lg font-extrabold mt-1 font-mono tabular-nums ${k.cls}`}>
                  {k.val}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 overflow-x-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-[#14213D] flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#2563EB]" />
                  Commission &amp; Settlements Ledger ({settlements.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Real itemized ledger linked directly to orders and admin payouts.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSettlementsCsv}
                disabled={settlements.length === 0}
                className="px-3.5 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV Report
              </button>
            </div>

            {settlements.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No settlement entries generated yet.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b text-xs text-slate-500">
                    <th className="py-2">Order</th>
                    <th>Date</th>
                    <th>Gross</th>
                    <th>Commission</th>
                    <th>Net Payout</th>
                    <th>Status &amp; Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="py-3 font-mono font-bold text-[#14213D]">{s.orderNumber}</td>
                      <td className="text-xs text-slate-500">
                        {new Date(s.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="font-mono tabular-nums">{formatINR(s.grossAmount)}</td>
                      <td className="font-mono tabular-nums text-slate-600">
                        -{formatINR(s.commissionAmount)} ({s.commissionPercent}%)
                      </td>
                      <td className="font-mono tabular-nums font-bold text-emerald-700">
                        {s.status === 'Cancelled' ? formatINR(0) : formatINR(s.netPayoutAmount)}
                      </td>
                      <td className="text-xs">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            s.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'Cancelled'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {s.status}
                        </span>
                        {s.payoutReference && (
                          <span className="ml-2 font-mono text-slate-500">{s.payoutReference}</span>
                        )}
                        {s.deductionReason && (
                          <span className="ml-2 text-red-600">{s.deductionReason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SHOP PROFILE */}
      {tab === 'profile' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!user) return;
            setError('');
            setFeedback('');
            if (!isValidIndianMobile(profForm.mobile) || !isValidIndianPincode(profForm.pincode)) {
              setError('Valid 10-digit Indian mobile and 6-digit PIN code are required.');
              return;
            }
            if (profForm.shopPhone.trim() && !isValidIndianMobile(profForm.shopPhone.trim())) {
              setError('Shop contact phone must be a valid 10-digit Indian mobile number.');
              return;
            }
            await updateMySellerProfile(user.uid, {
              businessName: profForm.businessName,
              ownerName: profForm.ownerName,
              email: profForm.email,
              mobile: profForm.mobile,
              shopCategory: profForm.shopCategory,
              shopPhone: profForm.shopPhone.trim() || profForm.mobile,
              description: profForm.description,
              logoUrl: profForm.logoUrl,
              coverImageUrl: profForm.coverImageUrl,
              verificationDocs,
              gstin: profForm.gstin,
              payoutUpiOrBank: profForm.payoutUpiOrBank,
              cityId: seller.cityId || 'vijayawada',
              serviceZones:
                profForm.serviceZones.length > 0
                  ? profForm.serviceZones
                  : [DEFAULT_VIJAYAWADA_ZONES[0].id],
              operatingHours: {
                openTime: profForm.openTime || '08:00',
                closeTime: profForm.closeTime || '22:00',
                daysOpen: [0, 1, 2, 3, 4, 5, 6],
                is24x7: false,
                temporarilyClosed: profForm.temporarilyClosed,
              },
              pickupAddress: {
                houseNo: profForm.houseNo,
                street: profForm.street,
                locality: profForm.locality,
                city: profForm.city,
                state: profForm.state,
                pincode: profForm.pincode,
                ...(typeof profForm.lat === 'number' ? { lat: profForm.lat } : {}),
                ...(typeof profForm.lng === 'number' ? { lng: profForm.lng } : {}),
              },
            });
            setFeedback('Shop profile, branding, Google Maps pin, and zone coverage updated.');
            await loadAll();
          }}
          className="bg-white p-6 rounded-2xl border border-slate-200 max-w-4xl space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="font-bold text-[#14213D]">Shop Profile, Location &amp; KYC Documents</h2>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-[#FCA311]/15 border border-[#FCA311] text-[#14213D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
              Update Shop Pin on Google Maps
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <input
              required
              placeholder="Shop Name *"
              value={profForm.businessName}
              onChange={(e) => setProfForm({ ...profForm, businessName: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="Owner Name *"
              value={profForm.ownerName}
              onChange={(e) => setProfForm({ ...profForm, ownerName: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <select
              value={profForm.shopCategory}
              onChange={(e) => setProfForm({ ...profForm, shopCategory: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
            >
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <input
              required
              type="email"
              placeholder="Business Email *"
              value={profForm.email}
              onChange={(e) => setProfForm({ ...profForm, email: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              maxLength={10}
              placeholder="Owner Mobile *"
              value={profForm.mobile}
              onChange={(e) => setProfForm({ ...profForm, mobile: e.target.value.replace(/\D/g, '') })}
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              maxLength={10}
              placeholder="Shop Phone"
              value={profForm.shopPhone}
              onChange={(e) => setProfForm({ ...profForm, shopPhone: e.target.value.replace(/\D/g, '') })}
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              placeholder="GSTIN (Optional)"
              value={profForm.gstin}
              onChange={(e) => setProfForm({ ...profForm, gstin: e.target.value.toUpperCase() })}
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              placeholder="Payout UPI / Bank Ref"
              value={profForm.payoutUpiOrBank}
              onChange={(e) => setProfForm({ ...profForm, payoutUpiOrBank: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2 sm:col-span-2"
            />
          </div>

          <textarea
            rows={2}
            placeholder="Business description"
            value={profForm.description}
            onChange={(e) => setProfForm({ ...profForm, description: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#14213D]">
                <span>Shop Logo</span>
                {profForm.logoUrl && (
                  <img src={profForm.logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-cover border" />
                )}
              </div>
              <input
                placeholder="Logo URL"
                value={profForm.logoUrl}
                onChange={(e) => setProfForm({ ...profForm, logoUrl: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingProfileMedia === 'logos' ? 'Uploading...' : 'Upload Logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleProfileMediaUpload('logos', e.target.files?.[0])}
                />
              </label>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#14213D]">
                <span>Cover Banner</span>
                {profForm.coverImageUrl && (
                  <img src={profForm.coverImageUrl} alt="Cover" className="w-16 h-9 rounded-lg object-cover border" />
                )}
              </div>
              <input
                placeholder="Cover URL"
                value={profForm.coverImageUrl}
                onChange={(e) => setProfForm({ ...profForm, coverImageUrl: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingProfileMedia === 'covers' ? 'Uploading...' : 'Upload Cover'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleProfileMediaUpload('covers', e.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <input
              required
              placeholder="Building / Unit *"
              value={profForm.houseNo}
              onChange={(e) => setProfForm({ ...profForm, houseNo: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="Street *"
              value={profForm.street}
              onChange={(e) => setProfForm({ ...profForm, street: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="Locality *"
              value={profForm.locality}
              onChange={(e) => setProfForm({ ...profForm, locality: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="City *"
              value={profForm.city}
              onChange={(e) => setProfForm({ ...profForm, city: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <select
              value={profForm.state}
              onChange={(e) => setProfForm({ ...profForm, state: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
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
              placeholder="PIN Code *"
              value={profForm.pincode}
              onChange={(e) => setProfForm({ ...profForm, pincode: e.target.value.replace(/\D/g, '') })}
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
          </div>

          {typeof profForm.lat === 'number' && typeof profForm.lng === 'number' && (
            <p className="text-xs font-mono text-emerald-700">
              Shop GPS Pin: {profForm.lat.toFixed(5)}, {profForm.lng.toFixed(5)}
            </p>
          )}

          {/* Private KYC Documents */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <p className="text-xs font-bold text-[#14213D] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#2563EB]" />
              Private Verification Documents (visible only to you &amp; CARTZY Admin)
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={pendingDocType}
                onChange={(e) =>
                  setPendingDocType(e.target.value as SellerVerificationDoc['docType'])
                }
                className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white"
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingProfileMedia === 'docs' ? 'Uploading...' : 'Upload Document'}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleProfileMediaUpload('docs', e.target.files?.[0])}
                />
              </label>
              <input
                placeholder="Or paste document URL"
                value={pendingDocUrl}
                onChange={(e) => setPendingDocUrl(e.target.value)}
                className="flex-1 min-w-[180px] border border-slate-300 rounded-xl px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!/^https?:\/\//i.test(pendingDocUrl.trim())) return;
                  setVerificationDocs((prev) =>
                    [
                      ...prev,
                      {
                        docType: pendingDocType,
                        label: `${pendingDocType} Link`,
                        url: pendingDocUrl.trim(),
                        uploadedAt: new Date().toISOString(),
                      },
                    ].slice(0, 8)
                  );
                  setPendingDocUrl('');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Add Link
              </button>
            </div>
            {verificationDocs.length > 0 && (
              <ul className="space-y-1.5 text-xs">
                {verificationDocs.map((d, idx) => (
                  <li
                    key={`${d.docType}_${idx}`}
                    className="flex items-center justify-between gap-2 bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                      <strong>{d.docType}:</strong>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2563EB] hover:underline truncate"
                      >
                        {d.label}
                      </a>
                    </span>
                    <button
                      type="button"
                      onClick={() => setVerificationDocs((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Zone coverage & opening hours */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <p className="text-xs font-bold text-[#14213D]">Vijayawada Delivery Zone Coverage</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {DEFAULT_VIJAYAWADA_ZONES.map((z) => {
                const checked = profForm.serviceZones.includes(z.id);
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
                        setProfForm((prev) => ({
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
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">Opens At (IST)</label>
                <input
                  type="time"
                  value={profForm.openTime}
                  onChange={(e) => setProfForm({ ...profForm, openTime: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14213D] mb-1">Closes At (IST)</label>
                <input
                  type="time"
                  value={profForm.closeTime}
                  onChange={(e) => setProfForm({ ...profForm, closeTime: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profForm.temporarilyClosed}
                  onChange={(e) => setProfForm({ ...profForm, temporarilyClosed: e.target.checked })}
                />
                <span>Temporarily Closed</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer"
          >
            Save Store Profile
          </button>
        </form>
      )}

      {/* TAB: CUSTOMER REVIEWS & REPLIES */}
      {tab === 'reviews' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-[#14213D] flex items-center gap-2">
                <Star className="w-4 h-4 fill-[#FCA311] text-[#FCA311]" />
                Verified Customer Reviews ({reviews.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Respond to verified buyer feedback on your shop catalog. Replies publish directly on the product page.
              </p>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div>
                <p className="text-slate-500">Avg Rating</p>
                <p className="text-lg font-extrabold text-[#14213D] font-mono tabular-nums">
                  {reviews.length > 0
                    ? (
                        reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length
                      ).toFixed(1)
                    : '0.0'}{' '}
                  ★
                </p>
              </div>
              <div>
                <p className="text-slate-500">Awaiting Reply</p>
                <p className="text-lg font-extrabold text-[#2563EB] font-mono tabular-nums">
                  {reviews.filter((r) => !r.sellerReply).length}
                </p>
              </div>
            </div>
          </div>

          {reviews.length === 0 ? (
            <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
              No verified customer reviews have been posted on your products yet.
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((rev) => {
                const draft = replyDraftByReview[rev.id] ?? rev.sellerReply ?? '';
                const productTitle = productNameById.get(rev.productId) || `Product #${rev.productId}`;
                return (
                  <div
                    key={rev.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-bold text-[#2563EB]">{productTitle}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[#FCA311] font-bold">{'★'.repeat(rev.rating)}</span>
                          <span className="font-bold text-sm text-[#14213D]">{rev.title}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {new Date(rev.createdAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>

                    <p className="text-slate-700 leading-relaxed">{rev.comment}</p>
                    <p className="text-[11px] text-slate-500">
                      By <strong>{rev.userName}</strong> · Verified Purchase
                    </p>

                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <label className="text-[11px] font-bold text-[#14213D] flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{rev.sellerReply ? 'Update Shop Reply' : 'Post Official Shop Reply'}</span>
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={draft}
                          onChange={(e) =>
                            setReplyDraftByReview((prev) => ({
                              ...prev,
                              [rev.id]: e.target.value,
                            }))
                          }
                          placeholder="Thank the customer or address their feedback..."
                          className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs"
                        />
                        <button
                          type="button"
                          disabled={savingReplyId === rev.id || !draft.trim()}
                          onClick={async () => {
                            if (!user || !seller) return;
                            setError('');
                            setFeedback('');
                            setSavingReplyId(rev.id);
                            try {
                              await sellerReplyToReview({
                                review: rev,
                                sellerUid: user.uid,
                                sellerBusinessName: seller.businessName,
                                replyText: draft,
                              });
                              setFeedback(`Shop reply published for "${rev.title}".`);
                              await loadAll();
                            } catch (err: any) {
                              setError(err?.message || 'Unable to post shop reply.');
                            } finally {
                              setSavingReplyId(null);
                            }
                          }}
                          className="px-4 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] disabled:opacity-50 text-white font-bold cursor-pointer shrink-0"
                        >
                          {savingReplyId === rev.id
                            ? 'Saving...'
                            : rev.sellerReply
                            ? 'Update Reply'
                            : 'Publish Reply'}
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

      {/* TAB 6: NOTIFICATIONS & SUPPORT */}
      {tab === 'support' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-[#14213D] flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#2563EB]" />
                Live Seller Notifications ({notifications.length})
              </h2>
              {unreadNotifsCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Mark All Read ({unreadNotifsCount})
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No notifications right now.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                      n.read ? 'bg-[#F8FAFC] border-slate-200' : 'bg-blue-50/50 border-blue-200'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-[#14213D]">{n.title}</p>
                      <p className="text-slate-600 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                        {new Date(n.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(n.id)}
                        className="text-[11px] font-bold text-[#2563EB] shrink-0 cursor-pointer hover:underline"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!user || !seller || !ticketForm.message.trim()) return;
                setSubmittingTicket(true);
                try {
                  await submitSellerSupportTicket({
                    uid: user.uid,
                    name: `${seller.businessName} (${seller.ownerName})`,
                    email: seller.email,
                    topic: ticketForm.topic,
                    orderNumber: ticketForm.orderNumber,
                    message: ticketForm.message,
                  });
                  setTicketForm({ topic: 'Order Fulfillment / Dispatch', orderNumber: '', message: '' });
                  setFeedback('Support ticket submitted to CARTZY Merchant Support.');
                  await loadAll();
                } finally {
                  setSubmittingTicket(false);
                }
              }}
              className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3"
            >
              <h2 className="font-bold text-[#14213D] flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#FCA311]" />
                Merchant Support Request
              </h2>
              <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                <select
                  value={ticketForm.topic}
                  onChange={(e) => setTicketForm({ ...ticketForm, topic: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
                >
                  <option value="Order Fulfillment / Dispatch">Order Fulfillment / Dispatch</option>
                  <option value="Settlement / Payout Query">Settlement / Payout Query</option>
                  <option value="Catalog / Product Listing">Catalog / Product Listing</option>
                  <option value="Shop KYC / Verification">Shop KYC / Verification</option>
                  <option value="Other Seller Support">Other Seller Support</option>
                </select>
                <input
                  placeholder="Related Order # (optional)"
                  value={ticketForm.orderNumber}
                  onChange={(e) => setTicketForm({ ...ticketForm, orderNumber: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <textarea
                required
                rows={3}
                placeholder="Describe your issue or request for CARTZY Merchant Ops..."
                value={ticketForm.message}
                onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={submittingTicket}
                className="px-4 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {submittingTicket ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </form>

            {tickets.length > 0 && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Recent Support Tickets ({tickets.length})
                </h3>
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-[#14213D]">
                          {t.topic}
                          {t.orderNumber ? ` · ${t.orderNumber}` : ''}
                        </p>
                        <p className="text-slate-600 mt-0.5">{t.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                          {new Date(t.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <span
                        className={`font-bold shrink-0 ${
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
                    {t.adminReply && (
                      <div className="p-2.5 rounded-lg bg-white border border-blue-200 space-y-0.5">
                        <p className="font-bold text-[#14213D] text-[11px]">
                          CARTZY Admin Reply
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

      <DeliveryLocationPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        apiKey={getBrowserMapsApiKey(serverConfig?.googleMapsApiKey)}
        initialLocation={
          typeof profForm.lat === 'number' && typeof profForm.lng === 'number'
            ? { lat: profForm.lat, lng: profForm.lng }
            : null
        }
        onConfirm={handleMapConfirm}
      />
    </div>
  );
};
