import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Clock, Flame, ShoppingBag, Scale, Calendar, ArrowLeft } from 'lucide-react';
import { FlashSale, Product } from '../types';
import { STARTER_FLASH_SALES, STARTER_PRODUCTS } from '../data/starterCatalog';
import { fetchActiveProducts, fetchAllFlashSales } from '../services/storeService';
import { useCart } from '../contexts/CartContext';
import { useCompare } from '../contexts/CompareContext';
import { useLocationService } from '../contexts/LocationContext';
import { formatINR } from '../services/indianValidation';
import { formatCountdown } from '../components/products/FlashSalesSection';
import { SafeImage } from '../components/common/SafeImage';

export const FlashSalesPage: React.FC = () => {
  const { addToCart } = useCart();
  const { toggleCompare, isInCompare } = useCompare();
  const { checkProductDeliverable } = useLocationService();

  const [sales, setSales] = useState<FlashSale[]>(STARTER_FLASH_SALES);
  const [products, setProducts] = useState<Product[]>(STARTER_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAllFlashSales(), fetchActiveProducts(80)])
      .then(([allSales, prods]) => {
        if (allSales.length > 0) setSales(allSales);
        if (prods.length > 0) setProducts(prods);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const categories = useMemo(() => {
    const names = Array.from(new Set(sales.map((s) => s.categoryName).filter(Boolean)));
    return ['ALL', ...names];
  }, [sales]);

  const filteredSales = useMemo(
    () =>
      sales.filter((s) => {
        if (!s.active) return false;
        const end = new Date(s.endDate).getTime();
        if (!Number.isFinite(end) || end < nowMs) return false;
        if (selectedCategory !== 'ALL' && s.categoryName !== selectedCategory) return false;
        return true;
      }),
    [sales, selectedCategory, nowMs]
  );

  const liveSales = filteredSales.filter((s) => nowMs >= new Date(s.startDate).getTime());
  const upcomingSales = filteredSales.filter((s) => nowMs < new Date(s.startDate).getTime());

  const handleGrabDeal = async (sale: FlashSale) => {
    const product = products.find((p) => p.id === sale.productId);
    if (!product) return;
    const remaining = Math.max(0, sale.saleStock - (sale.soldCount || 0));
    if (remaining <= 0) return;

    setAddingId(sale.id);
    try {
      await addToCart(product, 1, {
        sellingPriceOverride: sale.salePrice,
        maxStockOverride: remaining,
      });
    } catch {
      // handled by toast
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 space-y-6 md:space-y-8">
      {/* Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#14213D] via-[#1B2B4F] to-[#2563EB] text-white p-5 sm:p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#FCA311] fill-[#FCA311] shrink-0" />
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">CARTZY Flash Deals</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-200 max-w-2xl">
            Time-bound price drops with verified limited inventory. Flash sale prices apply automatically in your cart and during Razorpay or COD checkout.
          </p>
        </div>

        <div className="flex sm:flex-wrap gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#FCA311] text-[#14213D]'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Live Flash Sales Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-[#14213D] flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#FCA311]" />
            Live Deals ({liveSales.length})
          </h2>
        </div>

        {liveSales.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <p className="font-bold text-[#14213D]">No live flash deals in this category right now.</p>
            <Link to="/products" className="inline-block text-sm font-semibold text-[#2563EB] hover:underline">
              Browse Full Catalog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {liveSales.map((sale) => {
              const product = products.find((p) => p.id === sale.productId);
              const remaining = Math.max(0, sale.saleStock - (sale.soldCount || 0));
              const areaCheck = product
                ? checkProductDeliverable(product)
                : { deliverable: false, reason: 'Product unavailable' };
              const canGrab =
                Boolean(product) &&
                product!.active !== false &&
                (!product!.approvalStatus || product!.approvalStatus === 'Approved') &&
                (product!.stock || 0) > 0 &&
                remaining > 0 &&
                areaCheck.deliverable;
              const soldPct =
                sale.saleStock > 0
                  ? Math.min(100, Math.round(((sale.soldCount || 0) / sale.saleStock) * 100))
                  : 100;
              const compared = product ? isInCompare(product.id) : false;

              return (
                <div
                  key={sale.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                >
                  <Link to={`/product/${sale.productId}`} className="relative aspect-[4/3] bg-[#F8FAFC]">
                    <SafeImage
                      src={sale.productImage || product?.images[0] || ''}
                      alt={sale.productName}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-3 left-3 bg-[#FCA311] text-[#14213D] px-2.5 py-1 rounded-lg text-xs font-extrabold inline-flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 fill-[#14213D]" />
                      {sale.discountPercent}% OFF
                    </span>
                  </Link>

                  <div className="p-4 flex flex-col flex-1 space-y-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[#2563EB]">
                        {sale.brand} · {sale.categoryName}
                      </p>
                      <Link
                        to={`/product/${sale.productId}`}
                        className="text-sm font-bold text-[#14213D] hover:text-[#2563EB] line-clamp-2 mt-0.5"
                      >
                        {sale.productName}
                      </Link>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-extrabold font-mono text-[#14213D]">
                        {formatINR(sale.salePrice)}
                      </span>
                      <span className="text-xs text-slate-400 line-through font-mono">
                        {formatINR(sale.originalPrice)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span className={remaining <= 5 ? 'text-red-600 font-bold' : 'text-slate-600'}>
                          {remaining > 0 ? `Only ${remaining} left` : 'Sold Out'}
                        </span>
                        <span className="font-mono text-slate-500">
                          {sale.soldCount}/{sale.saleStock} claimed
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${remaining <= 5 ? 'bg-red-500' : 'bg-[#FCA311]'}`}
                          style={{ width: `${soldPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-[11px] bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-[#14213D]">
                        <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                        Ends in {formatCountdown(sale.endDate, nowMs)}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {new Date(sale.startDate).toLocaleDateString('en-IN')} –{' '}
                          {new Date(sale.endDate).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-auto flex gap-2">
                      <button
                        type="button"
                        disabled={!canGrab || addingId === sale.id}
                        title={!areaCheck.deliverable ? areaCheck.reason : undefined}
                        onClick={() => handleGrabDeal(sale)}
                        className="flex-1 py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {remaining <= 0
                          ? 'Sold Out'
                          : !product || product.active === false || product.stock <= 0
                          ? 'Unavailable'
                          : !areaCheck.deliverable
                          ? 'Area Unavailable'
                          : addingId === sale.id
                          ? 'Adding...'
                          : 'Add at Flash Price'}
                      </button>
                      {product && (
                        <button
                          type="button"
                          onClick={() => toggleCompare(product)}
                          aria-label="Compare product"
                          className={`px-3 py-2.5 rounded-xl border text-xs font-semibold ${
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
        )}
      </section>

      {/* Upcoming Flash Sales */}
      {upcomingSales.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold text-[#14213D]">Upcoming Flash Drops</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {upcomingSales.map((sale) => (
              <div
                key={sale.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5 opacity-90"
              >
                <span className="text-[11px] font-bold uppercase text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-md inline-block">
                  Starts {new Date(sale.startDate).toLocaleString('en-IN')}
                </span>
                <p className="text-sm font-bold text-[#14213D]">{sale.productName}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-extrabold font-mono text-[#14213D]">
                    {formatINR(sale.salePrice)}
                  </span>
                  <span className="text-xs text-slate-400 line-through font-mono">
                    {formatINR(sale.originalPrice)}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-600">
                  Starts in {formatCountdown(sale.startDate, nowMs)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
