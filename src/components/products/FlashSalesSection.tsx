import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Clock, ShoppingBag, Scale, ArrowRight, Flame } from 'lucide-react';
import { FlashSale, Product } from '../../types';
import { useCart } from '../../contexts/CartContext';
import { useCompare } from '../../contexts/CompareContext';
import { formatINR } from '../../services/indianValidation';
import { SafeImage } from '../common/SafeImage';

export function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  if (diff <= 0) return '00h : 00m : 00s';
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0
    ? `${days}d : ${pad(hrs)}h : ${pad(mins)}m : ${pad(secs)}s`
    : `${pad(hrs)}h : ${pad(mins)}m : ${pad(secs)}s`;
}

interface FlashSalesSectionProps {
  sales: FlashSale[];
  products: Product[];
}

export const FlashSalesSection: React.FC<FlashSalesSectionProps> = ({ sales, products }) => {
  const { addToCart } = useCart();
  const { toggleCompare, isInCompare } = useCompare();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveSales = useMemo(
    () =>
      sales.filter((s) => {
        if (!s.active) return false;
        const start = new Date(s.startDate).getTime();
        const end = new Date(s.endDate).getTime();
        return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= end;
      }),
    [sales, nowMs]
  );

  if (liveSales.length === 0) return null;

  const earliestEnd = [...liveSales].sort((a, b) => a.endDate.localeCompare(b.endDate))[0].endDate;

  const handleGrabDeal = async (sale: FlashSale) => {
    const product = products.find((p) => p.id === sale.productId);
    if (!product) return;
    const remainingSaleStock = Math.max(0, sale.saleStock - (sale.soldCount || 0));
    if (remainingSaleStock <= 0) return;

    setAddingId(sale.id);
    try {
      await addToCart(product, 1, {
        sellingPriceOverride: sale.salePrice,
        maxStockOverride: remainingSaleStock,
      });
    } catch {
      // toast handled by CartContext
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section className="max-w-[1440px] mx-auto px-4 md:px-6 space-y-5">
      {/* Promotional Flash Sale Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#14213D] via-[#1B2B4F] to-[#2563EB] text-white p-5 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-[#FCA311]">
            <Zap className="w-4 h-4 fill-[#FCA311]" />
            CARTZY Flash Sales · Limited Time Deals
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Lightning Price Drops Up to{' '}
            <span className="text-[#FCA311]">
              {Math.max(...liveSales.map((s) => s.discountPercent))}% OFF
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-200 max-w-2xl">
            Verified limited-quantity flash pricing applied automatically at checkout while sale stock lasts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Next Deal Ends In
            </p>
            <p className="text-base md:text-lg font-extrabold font-mono tabular-nums text-white mt-0.5">
              {formatCountdown(earliestEnd, nowMs)}
            </p>
          </div>
          <Link
            to="/flash-sales"
            className="px-5 py-3 rounded-xl bg-[#FCA311] hover:bg-amber-400 text-[#14213D] font-extrabold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            View All Deals <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Flash Sale Product Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {liveSales.slice(0, 4).map((sale) => {
          const product = products.find((p) => p.id === sale.productId);
          const remaining = Math.max(0, sale.saleStock - (sale.soldCount || 0));
          const soldPct =
            sale.saleStock > 0 ? Math.min(100, Math.round(((sale.soldCount || 0) / sale.saleStock) * 100)) : 100;
          const isLow = remaining > 0 && remaining <= 5;
          const compared = product ? isInCompare(product.id) : false;

          return (
            <div
              key={sale.id}
              className="bg-white rounded-2xl border border-slate-200 hover:shadow-md transition-all flex flex-col overflow-hidden min-w-0"
            >
              <Link to={`/product/${sale.productId}`} className="relative aspect-[4/3] bg-[#F8FAFC] overflow-hidden">
                <SafeImage
                  src={sale.productImage || product?.images[0] || ''}
                  alt={sale.productName}
                  className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-300"
                />
                <div className="absolute top-3 left-3 bg-[#FCA311] text-[#14213D] px-2.5 py-1 rounded-lg text-xs font-extrabold inline-flex items-center gap-1 shadow-sm">
                  <Zap className="w-3.5 h-3.5 fill-[#14213D]" />
                  {sale.discountPercent}% OFF
                </div>
                {remaining === 0 && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <span className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                      FLASH STOCK CLAIMED
                    </span>
                  </div>
                )}
              </Link>

              <div className="p-4 flex flex-col flex-1 space-y-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 min-w-0">
                  <span className="text-[#2563EB] uppercase tracking-wider truncate">
                    {sale.brand} · {sale.categoryName}
                  </span>
                  <span className="text-amber-700 font-bold shrink-0 truncate max-w-[48%]">{sale.title}</span>
                </div>

                <Link
                  to={`/product/${sale.productId}`}
                  className="text-[15px] font-semibold text-[#1F2937] hover:text-[#2563EB] line-clamp-2 leading-snug"
                >
                  {sale.productName}
                </Link>

                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-lg font-extrabold text-[#14213D] font-mono tabular-nums">
                    {formatINR(sale.salePrice)}
                  </span>
                  <span className="text-xs text-slate-400 line-through font-mono tabular-nums">
                    {formatINR(sale.originalPrice)}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 ml-auto">
                    Save {formatINR(Math.max(0, sale.originalPrice - sale.salePrice))}
                  </span>
                </div>

                {/* Limited Stock Indicator */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className={`inline-flex items-center gap-1 ${isLow ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                      <Flame className="w-3.5 h-3.5 text-[#FCA311]" />
                      {remaining > 0 ? `Only ${remaining} of ${sale.saleStock} left` : 'Sold out'}
                    </span>
                    <span className="text-slate-500 font-mono tabular-nums">{soldPct}% claimed</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isLow ? 'bg-red-500' : 'bg-[#FCA311]'
                      }`}
                      style={{ width: `${soldPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                  <Clock className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  <span className="truncate">Ends in {formatCountdown(sale.endDate, nowMs)}</span>
                </div>

                <div className="mt-auto pt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={remaining <= 0 || !product || addingId === sale.id}
                    onClick={() => handleGrabDeal(sale)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:bg-slate-200 disabled:text-slate-400 transition-colors whitespace-nowrap"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {remaining <= 0 ? 'Deal Ended' : addingId === sale.id ? 'Adding...' : 'Grab Deal'}
                  </button>
                  {product && (
                    <button
                      type="button"
                      onClick={() => toggleCompare(product)}
                      aria-label={compared ? 'Remove from comparison' : 'Compare product'}
                      title={compared ? 'In comparison' : 'Compare'}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center transition-colors ${
                        compared
                          ? 'bg-[#2563EB] border-[#2563EB] text-white'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
