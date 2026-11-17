import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Heart, ShoppingBag, ShoppingCart, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useLocationService } from '../contexts/LocationContext';
import { fetchProductsByIds } from '../services/storeService';
import { formatINR } from '../services/indianValidation';
import { Product } from '../types';
import { SafeImage } from '../components/common/SafeImage';

export const WishlistPage: React.FC = () => {
  const { user } = useAuth();
  const { wishlistIds, addToCart, toggleWishlist } = useCart();
  const { customerLocation, checkProductDeliverable } = useLocationService();

  const [productsMap, setProductsMap] = useState<Map<string, Product>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || wishlistIds.length === 0) {
      setProductsMap(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchProductsByIds(wishlistIds)
      .then((map) => {
        if (!cancelled) setProductsMap(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, wishlistIds]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 space-y-4">
          <Heart className="w-14 h-14 mx-auto text-rose-500" />
          <h1 className="text-2xl font-bold text-[#14213D]">Your CARTZY Wishlist</h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Sign in with your mobile number or email to save favourite products across devices and track price drops or stock updates.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/login?next=/wishlist"
              className="px-6 py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-sm font-bold transition-colors"
            >
              Sign In to View Wishlist
            </Link>
            <Link
              to="/products"
              className="px-6 py-3 rounded-xl border border-slate-300 text-[#14213D] text-sm font-semibold hover:bg-slate-50"
            >
              Explore Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
        Loading your saved wishlist items...
      </div>
    );
  }

  if (wishlistIds.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 space-y-4">
          <Heart className="w-16 h-16 mx-auto text-slate-300" />
          <h1 className="text-2xl font-bold text-[#14213D]">Your wishlist is empty</h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Tap the heart icon on any CARTZY product to save it here for quick comparison and one-click move to cart.
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700"
          >
            <ShoppingBag className="w-4 h-4" /> Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#14213D] flex items-center gap-2">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" /> My Wishlist ({wishlistIds.length})
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Checking availability &amp; delivery in {customerLocation.locality} ({customerLocation.pincode})
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/cart"
            className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-[#14213D] hover:bg-white"
          >
            View Cart
          </Link>
          <Link
            to="/products"
            className="px-4 py-2 rounded-xl bg-[#14213D] text-white text-xs font-bold hover:bg-[#2563EB]"
          >
            Continue Shopping
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {wishlistIds.map((pid) => {
          const product = productsMap.get(pid);

          if (!product) {
            return (
              <div
                key={pid}
                className="bg-white rounded-2xl border border-red-200 p-4 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" /> No Longer Available
                  </span>
                  <p className="font-semibold text-sm text-[#14213D]">Saved item ({pid})</p>
                  <p className="text-xs text-slate-500">
                    This product was removed from the CARTZY catalog and cannot be purchased.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleWishlist(pid)}
                  className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Remove from Wishlist
                </button>
              </div>
            );
          }

          const isActive =
            product.active !== false &&
            (!product.approvalStatus || product.approvalStatus === 'Approved');
          const hasStock = product.stock > 0;
          const areaCheck = checkProductDeliverable(product);
          const canMoveToCart = isActive && hasStock && areaCheck.deliverable;

          let unavailableReason = '';
          if (!isActive) {
            unavailableReason =
              product.approvalStatus && product.approvalStatus !== 'Approved'
                ? 'Seller item pending approval'
                : 'Currently inactive / unavailable';
          } else if (!hasStock) {
            unavailableReason = 'Currently out of stock';
          } else if (!areaCheck.deliverable) {
            unavailableReason = areaCheck.reason || 'Unavailable in your selected delivery area';
          }

          return (
            <div
              key={pid}
              className={`bg-white rounded-2xl border p-4 flex flex-col justify-between gap-4 ${
                canMoveToCart ? 'border-slate-200' : 'border-amber-200 bg-amber-50/20'
              }`}
            >
              <div className="flex gap-3.5 items-start">
                <Link to={`/product/${product.id}`} className="shrink-0">
                  <SafeImage
                    src={product.images?.[0]}
                    alt={product.name}
                    className={`w-20 h-20 rounded-xl object-contain bg-slate-50 border border-slate-100 p-1.5 ${
                      !canMoveToCart ? 'opacity-65 grayscale' : ''
                    }`}
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase text-[#2563EB] truncate">
                    {product.brand}
                  </p>
                  <Link
                    to={`/product/${product.id}`}
                    className="font-semibold text-sm text-[#14213D] hover:underline line-clamp-2"
                  >
                    {product.name}
                  </Link>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="font-extrabold text-base text-[#14213D] font-mono tabular-nums">
                      {formatINR(product.sellingPrice)}
                    </span>
                    {product.originalPrice > product.sellingPrice && (
                      <span className="text-xs text-slate-400 line-through font-mono tabular-nums">
                        {formatINR(product.originalPrice)}
                      </span>
                    )}
                    {product.discountPercent > 0 && (
                      <span className="text-[11px] font-bold text-emerald-700">
                        {product.discountPercent}% off
                      </span>
                    )}
                  </div>
                  {product.sellerName && (
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      Sold by {product.sellerName}
                    </p>
                  )}
                </div>
              </div>

              {!canMoveToCart ? (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Unavailable: {unavailableReason}</span>
                </div>
              ) : (
                <p className="text-[11px] text-emerald-700 font-semibold">
                  In stock ({product.stock} available) · Deliverable to {customerLocation.locality}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!canMoveToCart}
                  onClick={async () => {
                    await addToCart(product, 1);
                    await toggleWishlist(product.id);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  {canMoveToCart ? 'Move to Cart' : 'Unavailable'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  aria-label={`Remove ${product.name} from wishlist`}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 text-red-600 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
