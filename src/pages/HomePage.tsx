import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocationService } from '../contexts/LocationContext';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import {
  fetchActiveCategories,
  fetchActiveFlashSales,
  fetchActiveProducts,
  fetchStoreSettings,
  getRecentlyViewedIds,
  seedInitialCatalog,
} from '../services/storeService';
import { isShopCurrentlyOpen } from '../services/serviceabilityService';
import {
  HERO_BANNER_IMAGE,
  STARTER_CATEGORIES,
  STARTER_FLASH_SALES,
  STARTER_PRODUCTS,
} from '../data/starterCatalog';
import { Category, FlashSale, Product, Review, StoreSettings } from '../types';
import { ProductCard } from '../components/products/ProductCard';
import { FlashSalesSection } from '../components/products/FlashSalesSection';
import { SafeImage } from '../components/common/SafeImage';

type ShowcaseTab =
  | 'all'
  | 'featured'
  | 'trending'
  | 'bestsellers'
  | 'new_arrivals'
  | 'special_offers';

export const HomePage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { customerLocation, serviceability, dataset, openLocationModal, checkProductDeliverable } =
    useLocationService();
  const [categories, setCategories] = useState<Category[]>(STARTER_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(STARTER_PRODUCTS);
  const [flashSales, setFlashSales] = useState<FlashSale[]>(STARTER_FLASH_SALES);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentlyViewedIds());
  const [activeTab, setActiveTab] = useState<ShowcaseTab>('all');

  useEffect(() => {
    setRecentIds(getRecentlyViewedIds());
    Promise.all([
      fetchActiveCategories(),
      fetchActiveProducts(80),
      fetchActiveFlashSales(),
      fetchStoreSettings(),
      getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(4))).catch(() => null),
    ]).then(([cats, prods, sales, settings, revSnap]) => {
      setCategories(cats);
      setProducts(prods);
      setFlashSales(sales);
      setStoreSettings(settings);
      if (revSnap) {
        setReviews(revSnap.docs.map((d) => d.data() as Review));
      }
    });
  }, []);

  // Quietly seed Firestore in the background when the store owner signs in and Firestore is empty
  useEffect(() => {
    if (!isAdmin) return;
    getDocs(query(collection(db, 'products'), limit(1)))
      .then((snap) => {
        if (snap.empty) {
          seedInitialCatalog().catch(() => {});
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  const deliverableProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.active !== false &&
          (!p.approvalStatus || p.approvalStatus === 'Approved') &&
          (p.stock || 0) > 0 &&
          checkProductDeliverable(p).deliverable
      ),
    [products, checkProductDeliverable]
  );

  const nearbyApprovedShops = useMemo(() => {
    const approved = dataset.publicShops.filter((s) => s.approvalStatus === 'Approved');
    if (serviceability.matchedZoneId) {
      const matchingZone = approved.filter((s) =>
        s.serviceZones.includes(serviceability.matchedZoneId!)
      );
      if (matchingZone.length > 0) return matchingZone;
    }
    return approved;
  }, [dataset.publicShops, serviceability.matchedZoneId]);

  const deliverableFlashSales = useMemo(() => {
    const allowedIds = new Set(deliverableProducts.map((p) => p.id));
    return flashSales.filter((s) => allowedIds.has(s.productId));
  }, [flashSales, deliverableProducts]);

  const tabProducts = useMemo(() => {
    const pool = deliverableProducts;
    if (activeTab === 'all') {
      return pool;
    }
    if (activeTab === 'featured') {
      const tagged = pool.filter((p) => p.tags?.includes('featured'));
      return (tagged.length ? tagged : pool).slice(0, 8);
    }
    if (activeTab === 'trending') {
      const tagged = pool.filter((p) => p.tags?.includes('trending'));
      return (tagged.length ? tagged : pool).slice(0, 8);
    }
    if (activeTab === 'bestsellers') {
      return [...pool].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 8);
    }
    if (activeTab === 'new_arrivals') {
      const tagged = pool.filter((p) => p.tags?.includes('new_arrival'));
      return (tagged.length ? tagged : pool).slice(0, 8);
    }
    return [...pool].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, 8);
  }, [deliverableProducts, activeTab]);

  const specialOffers = useMemo(
    () => [...deliverableProducts].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, 4),
    [deliverableProducts]
  );

  const recentlyViewedProducts = useMemo(() => {
    if (recentIds.length === 0) return [];
    const byId = new Map(deliverableProducts.map((p) => [p.id, p]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => Boolean(p))
      .slice(0, 4);
  }, [recentIds, deliverableProducts]);

  const popularBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of deliverableProducts) {
      if (p.brand) counts.set(p.brand, (counts.get(p.brand) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([brand, count]) => ({ brand, count }));
  }, [deliverableProducts]);

  return (
    <div className="space-y-10 md:space-y-12 pb-10 md:pb-16">
      {storeSettings?.promoBannerActive && storeSettings.promoBannerText && !bannerDismissed && (
        <div className="bg-[#FCA311] text-[#14213D] px-4 py-2 text-xs font-bold">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{storeSettings.promoBannerText}</span>
            </span>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss announcement"
              className="p-1 rounded hover:bg-black/10 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Promotional Hero */}
      <section className="bg-[#14213D] text-white">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-8 md:py-14 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-4 sm:space-y-5">
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-[#FCA311]">
              {BUSINESS_CONFIG.localSubheadline} · {BUSINESS_CONFIG.operationsHub.locality} Hub
            </p>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight text-white">
              {BUSINESS_CONFIG.localHeadline}
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-xl leading-relaxed">
              {BUSINESS_CONFIG.localPrompt}. Shop verified local electronics, 5G smartphones, fashion, footwear, beauty, and kitchen essentials with live city-wide Vijayawada Municipal Corporation delivery, COD, and Razorpay checkout.
            </p>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 pt-1">
              <Link
                to="/products"
                className="px-5 sm:px-6 py-3 min-h-[46px] rounded-xl bg-[#FCA311] hover:bg-amber-400 text-[#14213D] font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                Explore All Products <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={openLocationModal}
                className="px-5 sm:px-6 py-3 min-h-[46px] rounded-xl border border-slate-500 hover:border-[#FCA311] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-[#FCA311] shrink-0" />
                <span className="truncate">Deliver to {customerLocation.locality}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:gap-4 pt-4 border-t border-slate-700/80 text-[11px] sm:text-xs">
              <div className="flex flex-col sm:flex-row items-start gap-1.5 sm:gap-2">
                <Truck className="w-4 h-4 text-[#FCA311] shrink-0 sm:mt-0.5" />
                <div>
                  <p className="font-semibold text-white leading-tight">Free Shipping</p>
                  <p className="text-slate-400 mt-0.5">Orders ₹499+</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start gap-1.5 sm:gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FCA311] shrink-0 sm:mt-0.5" />
                <div>
                  <p className="font-semibold text-white leading-tight">Verified Pay</p>
                  <p className="text-slate-400 mt-0.5">UPI, Cards &amp; COD</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start gap-1.5 sm:gap-2">
                <RotateCcw className="w-4 h-4 text-[#FCA311] shrink-0 sm:mt-0.5" />
                <div>
                  <p className="font-semibold text-white leading-tight">7-Day Returns</p>
                  <p className="text-slate-400 mt-0.5">Easy support</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl overflow-hidden border border-slate-700/60 aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:h-full lg:min-h-[280px] max-h-[420px]">
              <SafeImage
                src={HERO_BANNER_IMAGE}
                alt="CARTZY flagship electronics, wireless headphones, smartphone and smartwatch showcase"
                loading="eager"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live Vijayawada Delivery Serviceability Status Strip */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 -mt-4 md:-mt-6">
        <div
          className={`rounded-2xl border p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-xs ${
            serviceability.deliverable
              ? 'bg-white border-emerald-200'
              : 'bg-amber-50 border-amber-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {serviceability.deliverable ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-[#14213D]">
                <span>
                  {customerLocation.locality}
                  {customerLocation.pincode ? ` (${customerLocation.pincode})` : ''} · {customerLocation.cityName}
                </span>
                {serviceability.matchedZoneName && (
                  <span className="text-[#2563EB]">· {serviceability.matchedZoneName}</span>
                )}
              </div>
              <p className="text-xs text-slate-600">{serviceability.message}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
              <Store className="w-3.5 h-3.5 text-[#2563EB]" />
              {serviceability.availableShopIds.length} open shop(s)
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
              <Truck className="w-3.5 h-3.5 text-[#FCA311]" />
              {serviceability.onlineDriverCount} rider(s) online
            </span>
            <button
              type="button"
              onClick={openLocationModal}
              className="px-3.5 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white font-bold transition-colors"
            >
              Change Delivery Area
            </button>
          </div>
        </div>
      </section>

      {/* Categories Directory */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6">
        <div className="flex items-center justify-between gap-2 mb-4 sm:mb-5">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[#14213D]">Shop by Category</h2>
          <Link to="/products" className="text-xs sm:text-sm font-semibold text-[#2563EB] hover:underline whitespace-nowrap">
            View All Categories
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/products?category=${cat.id}`}
              className="bg-white border border-slate-200/80 rounded-2xl p-3 text-center hover:border-[#2563EB] hover:shadow-sm transition-all flex flex-col items-center justify-center min-h-[118px]"
            >
              <div className="w-14 h-14 mx-auto rounded-xl overflow-hidden bg-slate-50 mb-2 shrink-0">
                <SafeImage src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
              </div>
              <span className="text-xs font-semibold text-[#1F2937] line-clamp-2 min-h-[32px] flex items-center justify-center leading-snug">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Nearby Approved Shops in Vijayawada */}
      {nearbyApprovedShops.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[#14213D]">
                Approved Shops Near {customerLocation.locality}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Verified Vijayawada merchants delivering to{' '}
                {serviceability.matchedZoneName || customerLocation.cityName}
              </p>
            </div>
            <Link to="/products" className="text-xs sm:text-sm font-semibold text-[#2563EB] hover:underline whitespace-nowrap">
              Browse All Products
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {nearbyApprovedShops.map((shop) => {
              const openNow = isShopCurrentlyOpen(shop.operatingHours);
              const shopItemCount = deliverableProducts.filter(
                (p) => (p.sellerId || 'hub-bhavanipuram') === shop.shopId
              ).length;
              return (
                <div
                  key={shop.shopId}
                  className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-[#2563EB] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-[#14213D] truncate">{shop.shopName}</h3>
                        <p className="text-xs text-slate-500 truncate">
                          {shop.locality} · PIN {shop.pincode}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                        openNow
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {openNow ? 'OPEN NOW' : 'CLOSED'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-600">
                      {shopItemCount > 0
                        ? `${shopItemCount} available item(s)`
                        : `${shop.serviceZones.length} VMC zone(s) covered`}
                    </span>
                    <Link
                      to={`/products?shop=${encodeURIComponent(shop.shopId)}`}
                      className="font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1"
                    >
                      Browse Shop <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Flash Sales Promotional Deals */}
      <FlashSalesSection sales={deliverableFlashSales} products={deliverableProducts} />

      {/* Curated Showcase Tabs + Visible Product Grid */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 space-y-5 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[#14213D]">
              Deliverable in {customerLocation.locality} ({tabProducts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing in-stock items from open approved shops delivering to {serviceability.matchedZoneName || customerLocation.cityName}
            </p>
          </div>
          <div className="flex md:flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'all', label: `All (${deliverableProducts.length})` },
                { id: 'featured', label: 'Featured' },
                { id: 'trending', label: 'Trending' },
                { id: 'bestsellers', label: 'Best Sellers' },
                { id: 'new_arrivals', label: 'New Arrivals' },
                { id: 'special_offers', label: 'Special Offers' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-[#14213D] shadow-sm'
                    : 'text-slate-600 hover:text-[#14213D]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {tabProducts.length === 0 ? (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 sm:p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <h3 className="font-bold text-lg text-[#14213D]">
              No products currently deliverable to {customerLocation.locality}
            </h3>
            <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
              {serviceability.message}
            </p>
            <button
              type="button"
              onClick={openLocationModal}
              className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
            >
              Switch Vijayawada Area or PIN Code
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {tabProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Popular Brands Strip */}
      {popularBrands.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 md:px-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold text-[#14213D]">Popular Brands</h2>
            <Link to="/products" className="text-sm font-semibold text-[#2563EB] hover:underline whitespace-nowrap">
              Browse All Brands
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {popularBrands.map(({ brand, count }) => (
              <Link
                key={brand}
                to={`/products?brand=${encodeURIComponent(brand)}`}
                className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-center justify-between hover:border-[#2563EB] hover:shadow-xs transition-all"
              >
                <span className="font-bold text-sm text-[#14213D] truncate">{brand}</span>
                <span className="text-[11px] font-mono text-slate-500 shrink-0 ml-2">
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Special Value Deals Row */}
      <section className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[#14213D]">Top Savings &amp; Offers</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Use code <span className="font-mono font-bold text-[#14213D]">WELCOME10</span> for 10% off orders ₹999+
            </p>
          </div>
          <Link to="/products?sort=discount" className="text-xs sm:text-sm font-semibold text-[#2563EB] hover:underline whitespace-nowrap">
            View Deals
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {specialOffers.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Recently Viewed Products */}
      {recentlyViewedProducts.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 space-y-4 sm:space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[#14213D]">Recently Viewed</h2>
            <Link to="/products" className="text-xs sm:text-sm font-semibold text-[#2563EB] hover:underline whitespace-nowrap">
              Continue Exploring
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {recentlyViewedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Verified Customer Reviews */}
      {reviews.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 md:px-6">
          <h2 className="text-xl md:text-2xl font-bold text-[#14213D] mb-4">Verified Customer Reviews</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl p-5 border border-slate-200">
                <div className="flex items-center gap-1 text-[#FCA311] mb-2">
                  {Array.from({ length: r.rating }).map((_, idx) => (
                    <Star key={idx} className="w-3.5 h-3.5 fill-[#FCA311]" />
                  ))}
                </div>
                <p className="font-bold text-sm text-[#14213D]">{r.title}</p>
                <p className="text-xs text-slate-600 mt-1 line-clamp-3 leading-relaxed">{r.comment}</p>
                <p className="text-[11px] text-slate-400 mt-3 font-medium">
                  {r.userName} · Verified Buyer
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
