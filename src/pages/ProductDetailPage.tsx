import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Heart,
  ShoppingBag,
  Star,
  ShieldCheck,
  Scale,
  Zap,
  Clock,
  Share2,
  ArrowRight,
  MapPin,
  Store,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useCompare } from '../contexts/CompareContext';
import { useLocationService } from '../contexts/LocationContext';
import {
  appendRecentlyViewed,
  fetchActiveFlashSales,
  fetchActiveProducts,
  fetchProductById,
  fetchReviewsForProduct,
  normalizeCategoryKey,
  submitProductReview,
} from '../services/storeService';
import { formatINR } from '../services/indianValidation';
import { FlashSale, Product, Review } from '../types';
import { ProductCard } from '../components/products/ProductCard';
import { formatCountdown } from '../components/products/FlashSalesSection';
import { SafeImage } from '../components/common/SafeImage';

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { addToCart, toggleWishlist, isInWishlist, showToast } = useCart();
  const { toggleCompare, isInCompare } = useCompare();
  const { customerLocation, serviceability, checkProductDeliverable, openLocationModal } =
    useLocationService();

  const [product, setProduct] = useState<Product | null>(null);
  const [activeSale, setActiveSale] = useState<FlashSale | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedImg, setSelectedImg] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const [revRating, setRevRating] = useState(5);
  const [revTitle, setRevTitle] = useState('');
  const [revComment, setRevComment] = useState('');
  const [revStatus, setRevStatus] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadProduct = async (productId: string) => {
    setLoading(true);
    try {
      const [prod, flashSales, allActive] = await Promise.all([
        fetchProductById(productId),
        fetchActiveFlashSales(),
        fetchActiveProducts(60),
      ]);
      setProduct(prod);
      setSelectedSize(prod?.availableSizes?.[0] || '');
      setSelectedColor(prod?.availableColors?.[0] || '');
      setQty(1);
      setCatalogProducts(allActive);

      const matchedSale =
        flashSales.find(
          (s) => s.productId === productId && Math.max(0, s.saleStock - (s.soldCount || 0)) > 0
        ) || null;
      setActiveSale(matchedSale);

      if (prod) {
        appendRecentlyViewed(prod.id);
        const revs = await fetchReviewsForProduct(productId);
        setReviews(revs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setSelectedImg(0);
    loadProduct(id);
  }, [id]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !user) return;
    setRevStatus('Publishing review...');
    try {
      await submitProductReview({
        productId: product.id,
        userId: user.uid,
        userName: profile?.fullName || user.displayName || 'CARTZY Customer',
        rating: revRating,
        title: revTitle,
        comment: revComment,
      });
      setRevStatus('Thank you! Your verified review has been published.');
      setRevTitle('');
      setRevComment('');
      await loadProduct(product.id);
    } catch (err: any) {
      setRevStatus(err.message || 'Unable to publish review.');
    }
  };

  const handleShare = async () => {
    if (!product) return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: `Check out ${product.name} on CARTZY`,
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled or unsupported -> fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Product link copied to clipboard');
    } catch {
      showToast('Copy the URL from your browser bar to share');
    }
  };

  if (loading) {
    return <div className="p-16 text-center text-sm text-slate-500">Loading product details...</div>;
  }

  if (!product) {
    return (
      <div className="max-w-lg mx-auto my-16 bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <h1 className="text-xl font-bold text-[#14213D]">Product Not Found</h1>
        <Link to="/products" className="inline-block mt-4 text-sm font-semibold text-[#2563EB] hover:underline">
          Browse Catalog
        </Link>
      </div>
    );
  }

  const remainingFlashStock = activeSale
    ? Math.max(0, activeSale.saleStock - (activeSale.soldCount || 0))
    : 0;
  const flashPriceActive = Boolean(
    activeSale && remainingFlashStock > 0 && activeSale.salePrice < product.sellingPrice
  );
  const displayedPrice = flashPriceActive && activeSale ? activeSale.salePrice : product.sellingPrice;
  const displayedDiscount =
    flashPriceActive && activeSale ? activeSale.discountPercent : product.discountPercent;
  const compared = isInCompare(product.id);
  const areaCheck = checkProductDeliverable(product);
  const isProductActive =
    product.active !== false && (!product.approvalStatus || product.approvalStatus === 'Approved');
  const maxAllowedQty = Math.max(
    1,
    flashPriceActive ? Math.min(product.stock, remainingFlashStock) : product.stock
  );
  const canBuy = isProductActive && product.stock > 0 && areaCheck.deliverable;

  const related = catalogProducts
    .filter(
      (p) =>
        p.id !== product.id &&
        normalizeCategoryKey(p.categoryId) === normalizeCategoryKey(product.categoryId) &&
        p.active !== false &&
        (!p.approvalStatus || p.approvalStatus === 'Approved') &&
        (p.stock || 0) > 0 &&
        checkProductDeliverable(p).deliverable
    )
    .slice(0, 4);

  const addOptions = {
    ...(flashPriceActive && activeSale
      ? {
          sellingPriceOverride: activeSale.salePrice,
          maxStockOverride: remainingFlashStock,
        }
      : {}),
    ...(selectedSize ? { selectedSize } : {}),
    ...(selectedColor ? { selectedColor } : {}),
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-5 md:py-8 space-y-8 md:space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200">
        {/* Gallery Left */}
        <div className="lg:col-span-6 space-y-3 min-w-0">
          <div className="aspect-square max-h-[440px] w-full mx-auto rounded-2xl overflow-hidden bg-[#F8FAFC] border border-slate-100">
            <SafeImage
              src={product.images[selectedImg]}
              alt={product.name}
              loading="eager"
              className="w-full h-full object-contain"
            />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImg(idx)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                    selectedImg === idx ? 'border-[#2563EB]' : 'border-slate-200'
                  }`}
                >
                  <SafeImage src={img} alt={`${product.name} view ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contiguous Purchase Module Right */}
        <div className="lg:col-span-6 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-bold uppercase tracking-wider text-[#2563EB]">
              {product.brand} · {product.categoryName}
            </span>
            <span className="font-mono">SKU: {product.sku}</span>
          </div>

          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#14213D] leading-tight">
            {product.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2.5 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-[#14213D] tabular-nums">
              <Star className="w-4 h-4 fill-[#FCA311] text-[#FCA311]" />
              {(product.ratingAvg || 0).toFixed(1)}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 tabular-nums">{product.reviewCount || 0} Verified Reviews</span>
            {product.sellerName && (
              <>
                <span className="text-slate-400">·</span>
                <Link
                  to={`/products?shop=${encodeURIComponent(product.sellerId || 'hub-bhavanipuram')}`}
                  className="text-xs text-slate-600 hover:text-[#2563EB]"
                >
                  Sold by <strong className="text-[#14213D] underline">{product.sellerName}</strong>
                </Link>
              </>
            )}
          </div>

          {!isProductActive && (
            <div className="rounded-2xl bg-red-50 border border-red-200 text-red-800 p-3.5 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>This product is currently unavailable or unlisted by the merchant.</span>
            </div>
          )}

          {flashPriceActive && activeSale && (
            <div className="rounded-2xl bg-[#14213D] text-white p-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#FCA311]">
                <Zap className="w-4 h-4 fill-[#FCA311]" />
                <span>{activeSale.title} · Only {remainingFlashStock} flash units left</span>
              </div>
              <span className="text-xs font-mono font-bold inline-flex items-center gap-1.5 text-amber-200">
                <Clock className="w-3.5 h-3.5" />
                Ends in {formatCountdown(activeSale.endDate, nowMs)}
              </span>
            </div>
          )}

          <div className="py-4 border-y border-slate-100 flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-extrabold text-[#14213D] font-mono tabular-nums">
              {formatINR(displayedPrice)}
            </span>
            {product.originalPrice > displayedPrice && (
              <>
                <span className="text-base text-slate-400 line-through font-mono tabular-nums">
                  {formatINR(product.originalPrice)}
                </span>
                <span className="text-sm font-bold text-emerald-700">{displayedDiscount}% off</span>
              </>
            )}
            <span className="text-xs text-slate-500 w-full">Inclusive of all taxes (GST {product.taxRatePercent}%)</span>
          </div>

          {/* Interactive Size & Colour Variants */}
          {product.availableSizes && product.availableSizes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-[#14213D]">
                Size / Variant: <span className="text-[#2563EB]">{selectedSize}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {product.availableSizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setSelectedSize(sz)}
                    className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selectedSize === sz
                        ? 'border-[#14213D] bg-[#14213D] text-white'
                        : 'border-slate-300 bg-white text-[#1F2937] hover:border-[#2563EB]'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.availableColors && product.availableColors.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-[#14213D]">
                Colour: <span className="text-[#2563EB]">{selectedColor}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {product.availableColors.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedColor(col)}
                    className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selectedColor === col
                        ? 'border-[#2563EB] bg-blue-50 text-[#14213D]'
                        : 'border-slate-300 bg-white text-[#1F2937] hover:border-[#2563EB]'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vijayawada Delivery & Shop Availability */}
          <div
            className={`rounded-2xl p-3.5 border text-xs space-y-1.5 ${
              areaCheck.deliverable
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold inline-flex items-center gap-1.5">
                {areaCheck.deliverable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  {customerLocation.locality}
                  {customerLocation.pincode ? ` (${customerLocation.pincode})` : ''}
                </span>
                {serviceability.matchedZoneName && (
                  <span className="text-[11px] font-semibold opacity-80">
                    · {serviceability.matchedZoneName}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={openLocationModal}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[#2563EB] font-bold hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                Change Area
              </button>
            </div>
            {areaCheck.deliverable ? (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-emerald-900">
                {areaCheck.shop && (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Store className="w-3.5 h-3.5 text-emerald-700" />
                    Fulfilled by {areaCheck.shop.shopName}
                  </span>
                )}
                <span>
                  Delivery:{' '}
                  <strong>
                    {serviceability.deliveryCharge === 0
                      ? 'FREE'
                      : formatINR(serviceability.deliveryCharge)}
                  </strong>{' '}
                  ({serviceability.estimatedDeliveryText})
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-amber-900">
                {areaCheck.reason || serviceability.message}
              </p>
            )}
          </div>

          <p className={`text-sm font-bold ${!isProductActive ? 'text-red-600' : product.stock > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {!isProductActive
              ? 'Currently Unavailable'
              : product.stock > 0
              ? `In Stock (${product.stock} units available)`
              : 'Currently Out of Stock'}
          </p>

          <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>

          {canBuy && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-bold text-[#14213D]">Quantity:</span>
              <div className="inline-flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 text-sm font-bold hover:bg-slate-100 cursor-pointer"
                >
                  −
                </button>
                <span className="px-3.5 text-sm font-mono font-bold tabular-nums">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((prev) => Math.min(maxAllowedQty, prev + 1))}
                  disabled={qty >= maxAllowedQty}
                  className="px-3 py-1.5 text-sm font-bold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-500">Max {maxAllowedQty}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              type="button"
              disabled={!canBuy}
              title={!areaCheck.deliverable ? areaCheck.reason : undefined}
              onClick={() => addToCart(product, qty, addOptions).catch(() => {})}
              className="flex-1 min-w-[145px] min-h-[46px] py-3 px-4 sm:px-5 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] font-extrabold text-sm flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {!isProductActive
                  ? 'Unavailable'
                  : product.stock <= 0
                  ? 'Out of Stock'
                  : !areaCheck.deliverable
                  ? 'Area Unavailable'
                  : flashPriceActive
                  ? 'Grab Flash Deal'
                  : 'Add to Cart'}
              </span>
            </button>
            <button
              type="button"
              disabled={!canBuy}
              title={!areaCheck.deliverable ? areaCheck.reason : undefined}
              onClick={async () => {
                if (!canBuy) return;
                try {
                  await addToCart(product, qty, addOptions);
                  navigate('/checkout');
                } catch {
                  // toast shown by addToCart
                }
              }}
              className="flex-1 min-w-[130px] min-h-[46px] py-3 px-4 sm:px-5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white font-extrabold text-sm flex items-center justify-center gap-1.5 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
            >
              <span>Buy Now</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => toggleCompare(product)}
                aria-label={compared ? 'Remove from comparison' : 'Compare product'}
                className={`flex-1 sm:flex-none min-h-[46px] px-3.5 py-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  compared
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : 'border-slate-300 text-[#14213D] hover:bg-slate-50'
                }`}
              >
                <Scale className="w-4 h-4" />
                {compared ? 'In Compare' : 'Compare'}
              </button>
              <button
                type="button"
                onClick={() => toggleWishlist(product.id).catch(() => {})}
                aria-label="Toggle wishlist"
                className="min-h-[46px] min-w-[46px] px-3.5 py-3 rounded-xl border border-slate-300 hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Heart
                  className={`w-5 h-5 ${
                    isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-slate-600'
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share product"
                className="min-h-[46px] min-w-[46px] px-3.5 py-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="pt-4">
              <h2 className="font-bold text-sm text-[#14213D] mb-2">Specifications</h2>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                {Object.entries(product.specifications).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 border-b last:border-b-0 border-slate-200">
                    <span className="bg-[#F8FAFC] p-3 font-semibold text-slate-600 break-words min-w-0">{k}</span>
                    <span className="col-span-2 p-3 text-[#1F2937] break-words min-w-0">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200 grid md:grid-cols-2 gap-6 md:gap-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-lg text-[#14213D]">Customer Reviews</h2>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {(product.ratingAvg || 0).toFixed(1)} ★ · {reviews.length} Verified
            </span>
          </div>

          {reviews.length > 0 && (
            <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-4 space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviews.filter((r) => Math.round(r.rating) === star).length;
                const pct = Math.round((count / reviews.length) * 100);
                return (
                  <div key={star} className="flex items-center gap-2.5 text-xs">
                    <span className="w-8 font-bold text-[#14213D] tabular-nums">{star} ★</span>
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-[#FCA311] rounded-full transition-all"
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-slate-600 tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {reviews.length === 0 ? (
            <p className="text-sm text-slate-500">
              No reviews yet. Customers who purchase this item can leave a verified review.
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r.id} className="border-b border-slate-100 pb-4 last:border-b-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#FCA311] text-sm font-bold shrink-0">
                        {'★'.repeat(r.rating)}
                      </span>
                      <span className="font-bold text-sm text-[#14213D] truncate">{r.title}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{r.comment}</p>
                  <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {r.userName} · Verified Purchase
                  </p>
                  {r.sellerReply && (
                    <div className="mt-2 p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 text-xs space-y-1">
                      <p className="font-bold text-[#14213D] inline-flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>
                          Official Shop Response · {r.sellerReplyBy || product.sellerName || 'CARTZY Seller'}
                        </span>
                        {r.sellerRepliedAt && (
                          <span className="font-normal text-slate-400 tabular-nums">
                            · {new Date(r.sellerRepliedAt).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-700 leading-relaxed">{r.sellerReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleReviewSubmit} className="space-y-3 bg-[#F8FAFC] p-5 rounded-2xl border border-slate-200 h-fit">
          <h3 className="font-bold text-sm text-[#14213D]">Write a Verified Review</h3>
          <p className="text-xs text-slate-500">Only verified purchasers of this product can submit reviews.</p>
          <select
            value={revRating}
            onChange={(e) => setRevRating(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} Stars
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Review headline"
            value={revTitle}
            onChange={(e) => setRevTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
          <textarea
            required
            rows={3}
            placeholder="Share your experience..."
            value={revComment}
            onChange={(e) => setRevComment(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
          {revStatus && <p className="text-xs text-[#2563EB] font-medium">{revStatus}</p>}
          <button
            type="submit"
            disabled={!user}
            className="px-5 py-2.5 rounded-xl bg-[#14213D] text-white text-xs font-semibold hover:bg-[#2563EB] disabled:opacity-50"
          >
            {user ? 'Submit Review' : 'Sign In to Review'}
          </button>
        </form>
      </section>

      {related.length > 0 && (
        <section>
          <h2 className="text-lg sm:text-xl font-bold text-[#14213D] mb-4">Related Products</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
