import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Heart,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Truck,
  Zap,
} from 'lucide-react';
import { getCartItemKey, useCart } from '../contexts/CartContext';
import { useLocationService } from '../contexts/LocationContext';
import { revalidateCartOnServer } from '../services/storeService';
import { formatINR } from '../services/indianValidation';
import { CartRevalidationResponse, RevalidatedCartItem } from '../types';
import { SafeImage } from '../components/common/SafeImage';

export const CartPage: React.FC = () => {
  const {
    items,
    subtotal,
    mrpTotal,
    updateQuantity,
    removeFromCart,
    syncValidatedItems,
    toggleWishlist,
    isInWishlist,
    showToast,
  } = useCart();
  const { customerLocation, serviceability, openLocationModal } = useLocationService();
  const navigate = useNavigate();

  const [validation, setValidation] = useState<CartRevalidationResponse | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [revalError, setRevalError] = useState('');

  const itemsSignature = useMemo(
    () => items.map((i) => `${getCartItemKey(i)}:${i.quantity}:${i.sellingPrice}`).join('|'),
    [items]
  );

  const runRevalidation = useCallback(async () => {
    if (items.length === 0) {
      setValidation(null);
      setRevalError('');
      return;
    }
    setRevalidating(true);
    setRevalError('');
    try {
      const res = await revalidateCartOnServer({
        items,
        location: {
          city: customerLocation.cityName,
          state: customerLocation.state,
          locality: customerLocation.locality,
          formattedAddress: customerLocation.formattedAddress,
          pincode: customerLocation.pincode,
          lat: customerLocation.lat,
          lng: customerLocation.lng,
          zoneId: customerLocation.zoneId,
          wardNumber: customerLocation.wardNumber,
        },
      });
      setValidation(res);

      // Sync verified sellingPrice / maxStock / capped quantity onto local & Firestore cart for available items
      const validatedMap = new Map<string, RevalidatedCartItem>(
        res.items.map((vi) => [getCartItemKey(vi), vi])
      );
      let hasDiff = false;
      const nextCartItems = items.map((cur) => {
        const vi = validatedMap.get(getCartItemKey(cur));
        if (!vi || !vi.available || vi.quantity <= 0) {
          return cur;
        }
        if (
          vi.quantity !== cur.quantity ||
          vi.sellingPrice !== cur.sellingPrice ||
          vi.originalPrice !== cur.originalPrice ||
          vi.maxStock !== cur.maxStock ||
          vi.name !== cur.name ||
          (vi.image && vi.image !== cur.image)
        ) {
          hasDiff = true;
          return {
            ...cur,
            name: vi.name || cur.name,
            image: vi.image || cur.image,
            sellingPrice: vi.sellingPrice,
            originalPrice: vi.originalPrice,
            quantity: vi.quantity,
            maxStock: vi.maxStock,
          };
        }
        return cur;
      });
      if (hasDiff) {
        await syncValidatedItems(nextCartItems);
      }
    } catch (err: any) {
      setRevalError(err?.message || 'Unable to verify live stock and prices.');
    } finally {
      setRevalidating(false);
    }
  }, [
    itemsSignature,
    customerLocation.cityName,
    customerLocation.state,
    customerLocation.locality,
    customerLocation.formattedAddress,
    customerLocation.pincode,
    customerLocation.lat,
    customerLocation.lng,
    customerLocation.zoneId,
    customerLocation.wardNumber,
  ]);

  useEffect(() => {
    void runRevalidation();
  }, [runRevalidation]);

  const validatedByKey = useMemo(() => {
    const map = new Map<string, RevalidatedCartItem>();
    validation?.items.forEach((vi) => {
      map.set(getCartItemKey(vi), vi);
    });
    return map;
  }, [validation]);

  const unavailableItems = useMemo(
    () => (validation?.items || []).filter((vi) => !vi.available),
    [validation]
  );

  const handleRemoveUnavailable = async () => {
    if (unavailableItems.length === 0) return;
    const badKeys = new Set(unavailableItems.map((u) => getCartItemKey(u)));
    const kept = items.filter((i) => !badKeys.has(getCartItemKey(i)));
    await syncValidatedItems(kept);
    showToast(`Removed ${unavailableItems.length} unavailable item(s) from cart.`);
  };

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <ShoppingBag className="w-16 h-16 mx-auto text-slate-300 mb-4" />
        <h1 className="text-2xl font-bold text-[#14213D] mb-2">Your CARTZY cart is empty</h1>
        <p className="text-sm text-slate-500 mb-6">
          Explore Groceries, Electronics, Mobiles, Fashion, Beauty &amp; Home Essentials delivered across Vijayawada.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/products"
            className="inline-block px-6 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-semibold hover:bg-blue-700"
          >
            Start Shopping
          </Link>
          <Link
            to="/wishlist"
            className="inline-block px-6 py-3 rounded-xl border border-slate-300 text-[#14213D] text-sm font-semibold hover:bg-white"
          >
            View Wishlist
          </Link>
        </div>
      </div>
    );
  }

  const displaySubtotal = validation ? validation.pricing.subtotal : subtotal;
  const displayMrpTotal = validation ? validation.pricing.mrpTotal : mrpTotal;
  const deliveryCharge = validation
    ? validation.pricing.deliveryCharge
    : serviceability.deliveryCharge;
  const freeThreshold = validation
    ? validation.pricing.freeDeliveryThreshold
    : serviceability.freeDeliveryThreshold;
  const estimatedTotal = validation
    ? validation.pricing.estimatedTotal
    : subtotal + (subtotal >= freeThreshold ? 0 : deliveryCharge);
  const amountForFreeDelivery = Math.max(0, freeThreshold - displaySubtotal);
  const freeProgressPct = Math.min(100, Math.round((displaySubtotal / Math.max(1, freeThreshold)) * 100));

  const areaDeliverable = validation ? validation.areaDeliverable : serviceability.deliverable;
  const areaMessage = validation ? validation.areaMessage : serviceability.message;
  const availableCount = validation
    ? validation.items.filter((i) => i.available).length
    : items.length;
  const canProceedCheckout =
    !revalidating &&
    !revalError &&
    availableCount > 0 &&
    Boolean(validation?.allItemsValid) &&
    areaDeliverable;

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-10 space-y-5">
      {/* Delivery Area Verification Banner */}
      <div
        className={`rounded-2xl p-3.5 sm:p-4 border flex flex-wrap items-center justify-between gap-3 ${
          areaDeliverable
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-red-50 border-red-200 text-red-900'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5 text-xs min-w-0 flex-1">
          {areaDeliverable ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div className="min-w-0">
            <p className="font-bold">
              Delivering to {customerLocation.locality} ({customerLocation.pincode})
            </p>
            <p className="text-[11px] opacity-90 truncate sm:whitespace-normal">{areaMessage}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runRevalidation()}
            disabled={revalidating}
            className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-[#14213D] text-xs font-semibold inline-flex items-center gap-1 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? 'animate-spin' : ''}`} />
            Recheck
          </button>
          <button
            type="button"
            onClick={openLocationModal}
            className="px-3 py-1.5 rounded-xl bg-[#14213D] text-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-[#2563EB] cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" /> Change Area
          </button>
        </div>
      </div>

      {revalError && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex flex-wrap items-center justify-between gap-2">
          <span>{revalError}</span>
          <button
            type="button"
            onClick={() => runRevalidation()}
            className="px-3 py-1 rounded-lg bg-white border border-red-300 font-bold text-red-700 cursor-pointer"
          >
            Retry Stock Check
          </button>
        </div>
      )}

      {unavailableItems.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>
              <strong>{unavailableItems.length} item(s)</strong> in your cart cannot be fulfilled
              right now (out of stock, inactive, or unavailable in {customerLocation.locality}).
              Remove them or move them to your Wishlist to proceed.
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemoveUnavailable}
            className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer shrink-0"
          >
            Remove Unavailable Items
          </button>
        </div>
      )}

      {validation?.hasPriceChanges || validation?.hasStockAdjustments ? (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Live catalog prices and available stock quantities were verified and updated for your cart.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#14213D]">
            Shopping Cart ({items.length})
          </h1>
          {items.map((item) => {
            const key = getCartItemKey(item);
            const v = validatedByKey.get(key);
            const isUnavailable = Boolean(v && !v.available);
            const effectiveMaxStock = v ? Math.max(0, v.maxStock) : item.maxStock;
            const inWish = isInWishlist(item.productId);

            return (
              <div
                key={key}
                className={`bg-white rounded-2xl p-3.5 sm:p-4 border flex gap-3 sm:gap-4 items-start ${
                  isUnavailable ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                }`}
              >
                <SafeImage
                  src={item.image}
                  alt={item.name}
                  className={`w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-xl bg-slate-50 border border-slate-100 p-1 shrink-0 ${
                    isUnavailable ? 'opacity-60 grayscale' : ''
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold text-[#2563EB] uppercase">{item.brand}</p>
                    {v?.isFlashDeal && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-[#FCA311]/20 text-[#92400E] px-1.5 py-0.5 rounded">
                        <Zap className="w-3 h-3" /> Flash Deal
                      </span>
                    )}
                    {v?.stockAdjusted && !isUnavailable && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                        Stock Capped at {v.maxStock}
                      </span>
                    )}
                    {v?.priceChanged && !isUnavailable && (
                      <span className="text-[10px] font-bold bg-blue-50 text-[#2563EB] px-1.5 py-0.5 rounded">
                        Price Synced
                      </span>
                    )}
                  </div>

                  <Link
                    to={`/product/${item.productId}`}
                    className="font-semibold text-[#1F2937] hover:underline line-clamp-2 mt-0.5"
                  >
                    {item.name}
                  </Link>

                  {(item.selectedSize || item.selectedColor) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.selectedSize ? `Size: ${item.selectedSize}` : ''}
                      {item.selectedSize && item.selectedColor ? ' · ' : ''}
                      {item.selectedColor ? `Colour: ${item.selectedColor}` : ''}
                    </p>
                  )}

                  {item.sellerName && (
                    <p className="text-[11px] text-slate-500 mt-0.5">Sold by {item.sellerName}</p>
                  )}

                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-bold text-[#14213D] font-mono tabular-nums">
                      {formatINR(item.sellingPrice)}
                    </span>
                    {item.originalPrice > item.sellingPrice && (
                      <span className="text-xs text-slate-400 line-through font-mono tabular-nums">
                        {formatINR(item.originalPrice)}
                      </span>
                    )}
                  </div>

                  {isUnavailable && v?.unavailableReason && (
                    <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{v.unavailableReason}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 mt-3">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity - 1,
                              item.selectedSize,
                              item.selectedColor
                            )
                          }
                          aria-label="Decrease quantity"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3.5 text-sm font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity + 1,
                              item.selectedSize,
                              item.selectedColor
                            )
                          }
                          disabled={isUnavailable || item.quantity >= effectiveMaxStock}
                          aria-label="Increase quantity"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {!isUnavailable && item.quantity >= effectiveMaxStock && (
                        <span className="text-[11px] font-medium text-amber-700">
                          Max stock ({effectiveMaxStock})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <span className="text-sm font-bold text-[#14213D] font-mono tabular-nums">
                        {formatINR(item.sellingPrice * item.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await toggleWishlist(item.productId);
                            if (!inWish) {
                              await removeFromCart(
                                item.productId,
                                item.selectedSize,
                                item.selectedColor
                              );
                            }
                          } catch {
                            // Toast shown by CartContext if user is guest
                          }
                        }}
                        className="text-slate-600 hover:text-[#2563EB] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer min-h-[32px]"
                      >
                        <Heart className={`w-3.5 h-3.5 ${inWish ? 'fill-rose-500 text-rose-500' : ''}`} />
                        {inWish ? 'Wishlisted' : 'Move to Wishlist'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(item.productId, item.selectedSize, item.selectedColor)
                        }
                        className="text-red-600 text-xs font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer min-h-[32px]"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 h-fit lg:sticky lg:top-24 space-y-4">
          <h2 className="font-bold text-lg text-[#14213D]">Price Summary</h2>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 font-semibold text-[#14213D]">
              <span className="inline-flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#2563EB]" />
                {amountForFreeDelivery === 0
                  ? 'Unlocked FREE Vijayawada Delivery'
                  : `Add ${formatINR(amountForFreeDelivery)} for FREE Delivery`}
              </span>
              <span className="font-mono text-[11px] text-slate-500">{freeProgressPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                style={{ width: `${freeProgressPct}%` }}
                className={`h-full rounded-full transition-all ${
                  amountForFreeDelivery === 0 ? 'bg-emerald-600' : 'bg-[#2563EB]'
                }`}
              />
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Total MRP</span>
              <span className="font-mono tabular-nums">{formatINR(displayMrpTotal)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Product Discount</span>
              <span className="font-mono tabular-nums">
                - {formatINR(Math.max(0, displayMrpTotal - displaySubtotal))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-mono tabular-nums">{formatINR(displaySubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Estimated Delivery</span>
              <span className="font-mono tabular-nums">
                {deliveryCharge === 0 ? (
                  <span className="text-emerald-700 font-bold">FREE</span>
                ) : (
                  formatINR(deliveryCharge)
                )}
              </span>
            </div>
            <div className="border-t pt-3 flex justify-between font-bold text-base text-[#14213D]">
              <span>Estimated Total</span>
              <span className="font-mono tabular-nums">{formatINR(estimatedTotal)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!canProceedCheckout}
            onClick={() => navigate('/checkout')}
            className="w-full py-3.5 px-6 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {revalidating
              ? 'Verifying Stock & Prices...'
              : unavailableItems.length > 0
              ? 'Remove Unavailable Items First'
              : !areaDeliverable
              ? 'Delivery Unavailable in Area'
              : 'Proceed to Checkout'}
            {!revalidating && canProceedCheckout && <ArrowRight className="w-4 h-4" />}
          </button>

          <p className="text-[11px] text-slate-500 text-center">
            Final stock, pricing &amp; Vijayawada ward delivery check are re-verified before order confirmation.
          </p>
        </aside>
      </div>
    </div>
  );
};
