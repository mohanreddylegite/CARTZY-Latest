import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Star, ShoppingBag, Scale } from 'lucide-react';
import { Product } from '../../types';
import { useCart } from '../../contexts/CartContext';
import { useCompare } from '../../contexts/CompareContext';
import { useLocationService } from '../../contexts/LocationContext';
import { formatINR } from '../../services/indianValidation';
import { SafeImage } from '../common/SafeImage';

export const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const { toggleCompare, isInCompare } = useCompare();
  const { checkProductDeliverable } = useLocationService();
  const [adding, setAdding] = useState(false);
  const wished = isInWishlist(product.id);
  const compared = isInCompare(product.id);
  const areaCheck = checkProductDeliverable(product);
  const isAvailable =
    product.active !== false && (!product.approvalStatus || product.approvalStatus === 'Approved');
  const canPurchase = isAvailable && product.stock > 0 && areaCheck.deliverable;

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canPurchase) return;
    setAdding(true);
    try {
      await addToCart(product, 1);
    } catch {
      // handled by toast
    } finally {
      setAdding(false);
    }
  };

  return (
    <Link
      to={`/product/${product.id}`}
      className="group bg-white rounded-2xl border border-slate-200/80 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden min-w-0"
    >
      <div className="relative aspect-square bg-[#F8FAFC] overflow-hidden">
        <SafeImage
          src={product.images[0]}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />

        {(!isAvailable || product.stock <= 0) && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center p-2">
            <span className="bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg tracking-wide">
              {!isAvailable ? 'CURRENTLY UNAVAILABLE' : 'OUT OF STOCK'}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.id).catch(() => {});
          }}
          aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
          className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 border border-slate-200 shadow-xs flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
        >
          <Heart className={`w-4 h-4 ${wished ? 'fill-red-500 text-red-500' : 'text-slate-600'}`} />
        </button>
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-0">
          <span className="text-[#2563EB] truncate">{product.brand}</span>
          <span aria-hidden="true" className="shrink-0">·</span>
          <span className="truncate">{product.categoryName}</span>
        </div>

        <h3 className="text-xs sm:text-[15px] font-semibold text-[#1F2937] line-clamp-2 mt-1 mb-1.5 sm:mb-2 leading-snug min-h-[2.25rem] sm:min-h-[2.6rem]">
          {product.name}
        </h3>

        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 mb-2.5 sm:mb-3">
          <span className="inline-flex items-center gap-1 font-bold text-[#14213D] tabular-nums">
            <Star className="w-3.5 h-3.5 fill-[#FCA311] text-[#FCA311]" />
            {(product.ratingAvg || 0).toFixed(1)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums truncate">{product.reviewCount || 0} reviews</span>
        </div>

        <div className="mt-auto pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mb-2.5 sm:mb-3">
            <span className="text-sm sm:text-base font-bold text-[#14213D] font-mono tabular-nums">
              {formatINR(product.sellingPrice)}
            </span>
            {product.originalPrice > product.sellingPrice && (
              <>
                <span className="text-[11px] sm:text-xs text-slate-400 line-through font-mono tabular-nums">
                  {formatINR(product.originalPrice)}
                </span>
                <span className="text-[11px] sm:text-xs font-bold text-emerald-700 tabular-nums">
                  {product.discountPercent}% off
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canPurchase || adding}
              title={!areaCheck.deliverable ? areaCheck.reason : undefined}
              className="flex-1 min-w-0 min-h-[38px] py-2 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-colors bg-[#14213D] text-white hover:bg-[#2563EB] disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {!isAvailable
                  ? 'Unavailable'
                  : product.stock <= 0
                  ? 'Out of Stock'
                  : !areaCheck.deliverable
                  ? 'Unavailable'
                  : adding
                  ? 'Adding...'
                  : 'Add to Cart'}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleCompare(product);
              }}
              aria-label={compared ? 'Remove from comparison' : 'Compare product'}
              title={compared ? 'In comparison' : 'Compare product'}
              className={`min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                compared
                  ? 'bg-[#2563EB] border-[#2563EB] text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
};

