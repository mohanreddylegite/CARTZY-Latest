import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Scale,
  X,
  Plus,
  Star,
  ShoppingBag,
  Award,
  TrendingDown,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { MAX_COMPARE_PRODUCTS, useCompare } from '../contexts/CompareContext';
import { useCart } from '../contexts/CartContext';
import { useLocationService } from '../contexts/LocationContext';
import { STARTER_PRODUCTS } from '../data/starterCatalog';
import { fetchActiveFlashSales, fetchActiveProducts } from '../services/storeService';
import { formatINR } from '../services/indianValidation';
import { FlashSale, Product } from '../types';
import { SafeImage } from '../components/common/SafeImage';

function extractNumericMetric(specKey: string, val: string): number | null {
  const lowerKey = specKey.toLowerCase();
  // Keys where lower number is better (weight, noise) vs higher is better
  const match = val.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  if (lowerKey.includes('weight') || lowerKey.includes('noise') || lowerKey.includes('latency')) {
    return -num;
  }
  return num;
}

export const ComparePage: React.FC = () => {
  const { compareProducts, addToCompare, removeFromCompare, clearCompare } = useCompare();
  const { addToCart } = useCart();
  const { checkProductDeliverable } = useLocationService();

  const [catalog, setCatalog] = useState<Product[]>(STARTER_PRODUCTS);
  const [activeSales, setActiveSales] = useState<FlashSale[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchActiveProducts(80), fetchActiveFlashSales()])
      .then(([prods, sales]) => {
        if (prods.length > 0) setCatalog(prods);
        setActiveSales(sales);
      })
      .catch(() => {});
  }, []);

  const flashByProductId = useMemo(() => {
    const map = new Map<string, FlashSale>();
    for (const s of activeSales) {
      const remaining = Math.max(0, s.saleStock - (s.soldCount || 0));
      if (remaining > 0) map.set(s.productId, s);
    }
    return map;
  }, [activeSales]);

  const effectivePrice = (p: Product) => {
    const sale = flashByProductId.get(p.id);
    return sale && sale.salePrice < p.sellingPrice ? sale.salePrice : p.sellingPrice;
  };

  const availableToAdd = useMemo(
    () => catalog.filter((p) => !compareProducts.some((c) => c.id === p.id)),
    [catalog, compareProducts]
  );

  const allSpecKeys = useMemo(() => {
    const keys = new Set<string>();
    compareProducts.forEach((p) => {
      Object.keys(p.specifications || {}).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [compareProducts]);

  const highlights = useMemo(() => {
    if (compareProducts.length < 2) {
      return {
        lowestPriceId: null as string | null,
        bestRatingId: null as string | null,
        bestSpecsId: null as string | null,
        bestPerSpecKey: {} as Record<string, string>,
      };
    }

    const sortedByPrice = [...compareProducts].sort((a, b) => effectivePrice(a) - effectivePrice(b));
    const minPrice = effectivePrice(sortedByPrice[0]);
    const lowestPriceId =
      compareProducts.filter((p) => effectivePrice(p) === minPrice).length < compareProducts.length
        ? sortedByPrice[0].id
        : sortedByPrice[0].id;

    const sortedByRating = [...compareProducts].sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
    const bestRatingId = sortedByRating[0].id;

    // Best spec per numeric row + overall spec winner
    const bestPerSpecKey: Record<string, string> = {};
    const specWinScore = new Map<string, number>();
    compareProducts.forEach((p) => specWinScore.set(p.id, Object.keys(p.specifications || {}).length));

    allSpecKeys.forEach((key) => {
      const scored = compareProducts
        .map((p) => {
          const raw = p.specifications?.[key];
          if (!raw) return null;
          const metric = extractNumericMetric(key, raw);
          return metric !== null ? { id: p.id, metric } : null;
        })
        .filter((x): x is { id: string; metric: number } => Boolean(x));

      if (scored.length >= 2) {
        scored.sort((a, b) => b.metric - a.metric);
        if (scored[0].metric > scored[1].metric) {
          bestPerSpecKey[key] = scored[0].id;
          specWinScore.set(scored[0].id, (specWinScore.get(scored[0].id) || 0) + 3);
        }
      }
    });

    const bestSpecsId = [...compareProducts].sort(
      (a, b) => (specWinScore.get(b.id) || 0) - (specWinScore.get(a.id) || 0)
    )[0].id;

    return { lowestPriceId, bestRatingId, bestSpecsId, bestPerSpecKey };
  }, [compareProducts, allSpecKeys, flashByProductId]);

  const handleAddSelected = () => {
    if (!selectedToAdd) return;
    const found = catalog.find((p) => p.id === selectedToAdd);
    if (found) {
      addToCompare(found);
      setSelectedToAdd('');
    }
  };

  const handleCartAdd = async (p: Product) => {
    const sale = flashByProductId.get(p.id);
    setAddingId(p.id);
    try {
      await addToCart(
        p,
        1,
        sale
          ? {
              sellingPriceOverride: sale.salePrice,
              maxStockOverride: Math.max(0, sale.saleStock - (sale.soldCount || 0)),
            }
          : undefined
      );
    } catch {
      // toast handled by CartContext
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-10 space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Catalog
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <Scale className="w-6 h-6 text-[#2563EB] shrink-0" />
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#14213D]">
              Product Comparison
            </h1>
            <span className="text-xs font-bold bg-slate-100 text-[#14213D] px-2.5 py-1 rounded-full shrink-0">
              {compareProducts.length}/{MAX_COMPARE_PRODUCTS} Selected
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Compare live prices, active flash discounts, ratings, stock availability, and detailed technical specifications side by side.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {compareProducts.length < MAX_COMPARE_PRODUCTS && availableToAdd.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedToAdd}
                onChange={(e) => setSelectedToAdd(e.target.value)}
                aria-label="Select a product to add to comparison"
                className="flex-1 sm:w-72 border border-slate-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] outline-none focus:border-[#2563EB]"
              >
                <option value="">+ Add product from catalog...</option>
                {availableToAdd.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatINR(effectivePrice(p))}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedToAdd}
                onClick={handleAddSelected}
                className="px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          )}

          {compareProducts.length > 0 && (
            <button
              type="button"
              onClick={clearCompare}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Empty State with Instant Starter Suggestions */}
      {compareProducts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
            <Scale className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-[#14213D]">No Products Selected Yet</h2>
            <p className="text-sm text-slate-500">
              Select up to 4 products using the dropdown above, the Compare button on any product card, or quick-pick popular items below.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left max-w-5xl mx-auto">
            {catalog.slice(0, 4).map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
                <div className="aspect-[4/3] rounded-xl bg-white border border-slate-100 overflow-hidden">
                  <SafeImage src={p.images[0]} alt={p.name} className="w-full h-full object-contain p-2" />
                </div>
                <p className="text-[11px] font-bold uppercase text-[#2563EB]">{p.brand}</p>
                <p className="text-xs font-bold text-[#14213D] line-clamp-2">{p.name}</p>
                <p className="text-sm font-extrabold font-mono text-[#14213D] mt-auto">
                  {formatINR(effectivePrice(p))}
                </p>
                <button
                  type="button"
                  onClick={() => addToCompare(p)}
                  className="w-full py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to Compare
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Highlight Legend */}
          {compareProducts.length >= 2 && (
            <div className="flex flex-wrap gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                <TrendingDown className="w-3.5 h-3.5" /> Lowest Price Highlighted
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                <Award className="w-3.5 h-3.5" /> Best Rating Highlighted
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                <Sparkles className="w-3.5 h-3.5" /> Best Specifications Highlighted
              </span>
            </div>
          )}

          {/* Desktop Side-by-Side Comparison Table */}
          <div className="hidden md:block bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-xs">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC]">
                  <th className="p-5 w-52 align-top text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Product Overview
                  </th>
                  {compareProducts.map((p) => {
                    const price = effectivePrice(p);
                    const sale = flashByProductId.get(p.id);
                    const isLowest = highlights.lowestPriceId === p.id;
                    const isBestRated = highlights.bestRatingId === p.id;
                    const isBestSpecs = highlights.bestSpecsId === p.id;

                    return (
                      <th key={p.id} className="p-5 min-w-[230px] align-top border-l border-slate-200">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              {isLowest && (
                                <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                                  LOWEST PRICE
                                </span>
                              )}
                              {isBestRated && (
                                <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                                  TOP RATED
                                </span>
                              )}
                              {isBestSpecs && (
                                <span className="text-[10px] font-extrabold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                                  BEST SPECS
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFromCompare(p.id)}
                              aria-label={`Remove ${p.name}`}
                              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-red-600 transition-colors shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <Link
                            to={`/product/${p.id}`}
                            className="block aspect-[4/3] rounded-2xl bg-white border border-slate-200 overflow-hidden"
                          >
                            <SafeImage
                              src={p.images[0]}
                              alt={p.name}
                              className="w-full h-full object-contain p-2"
                            />
                          </Link>

                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                              {p.brand} · {p.categoryName}
                            </p>
                            <Link
                              to={`/product/${p.id}`}
                              className="text-sm font-bold text-[#14213D] hover:text-[#2563EB] line-clamp-2 mt-0.5"
                            >
                              {p.name}
                            </Link>
                            {sale && (
                              <p className="text-[11px] font-extrabold text-amber-700 mt-1">
                                Active Flash Deal: {formatINR(price)}
                              </p>
                            )}
                          </div>

                          {(() => {
                            const areaCheck = checkProductDeliverable(p);
                            const canBuy =
                              p.active !== false &&
                              (!p.approvalStatus || p.approvalStatus === 'Approved') &&
                              p.stock > 0 &&
                              areaCheck.deliverable;
                            return (
                              <button
                                type="button"
                                disabled={!canBuy || addingId === p.id}
                                title={!areaCheck.deliverable ? areaCheck.reason : undefined}
                                onClick={() => handleCartAdd(p)}
                                className="w-full py-2.5 px-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                {p.stock <= 0
                                  ? 'Out of Stock'
                                  : !areaCheck.deliverable
                                  ? 'Unavailable in Area'
                                  : addingId === p.id
                                  ? 'Adding...'
                                  : 'Add to Cart'}
                              </button>
                            );
                          })()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* Selling Price */}
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">Selling Price</td>
                  {compareProducts.map((p) => {
                    const price = effectivePrice(p);
                    const isLowest = highlights.lowestPriceId === p.id;
                    return (
                      <td
                        key={p.id}
                        className={`p-4 border-l border-slate-200 font-mono text-base font-extrabold ${
                          isLowest ? 'bg-emerald-50/70 text-emerald-800' : 'text-[#14213D]'
                        }`}
                      >
                        {formatINR(price)}
                        {isLowest && (
                          <span className="ml-2 text-[10px] font-sans font-bold text-emerald-700">
                            Best Value
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Original MRP */}
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">Original Price (MRP)</td>
                  {compareProducts.map((p) => (
                    <td key={p.id} className="p-4 border-l border-slate-200 font-mono text-slate-500">
                      {formatINR(p.originalPrice)}
                    </td>
                  ))}
                </tr>

                {/* Discount */}
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">Discount</td>
                  {compareProducts.map((p) => {
                    const sale = flashByProductId.get(p.id);
                    const pct = sale ? sale.discountPercent : p.discountPercent;
                    return (
                      <td key={p.id} className="p-4 border-l border-slate-200 font-bold text-emerald-700">
                        {pct > 0 ? `${pct}% OFF` : '—'}
                      </td>
                    );
                  })}
                </tr>

                {/* Customer Rating */}
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">Customer Rating</td>
                  {compareProducts.map((p) => {
                    const isBest = highlights.bestRatingId === p.id;
                    return (
                      <td
                        key={p.id}
                        className={`p-4 border-l border-slate-200 ${isBest ? 'bg-amber-50/70' : ''}`}
                      >
                        <div className="inline-flex items-center gap-1.5 font-bold text-[#14213D]">
                          <Star className="w-4 h-4 fill-[#FCA311] text-[#FCA311]" />
                          <span>{(p.ratingAvg || 0).toFixed(1)}</span>
                          <span className="text-xs font-normal text-slate-500">
                            ({p.reviewCount || 0} reviews)
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Brand */}
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">Brand</td>
                  {compareProducts.map((p) => (
                    <td key={p.id} className="p-4 border-l border-slate-200 font-semibold text-[#1F2937]">
                      {p.brand}
                    </td>
                  ))}
                </tr>

                {/* Availability & Stock */}
                <tr className="border-b border-slate-100">
                  <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">Availability</td>
                  {compareProducts.map((p) => (
                    <td key={p.id} className="p-4 border-l border-slate-200">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          p.stock > 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {p.stock > 0 ? `In Stock (${p.stock} units)` : 'Out of Stock'}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Dynamic Specifications Matrix */}
                {allSpecKeys.map((specKey) => (
                  <tr key={specKey} className="border-b last:border-b-0 border-slate-100">
                    <td className="p-4 font-bold text-slate-600 bg-[#F8FAFC]/60">{specKey}</td>
                    {compareProducts.map((p) => {
                      const val = p.specifications?.[specKey];
                      const isBestSpec = highlights.bestPerSpecKey[specKey] === p.id;
                      return (
                        <td
                          key={p.id}
                          className={`p-4 border-l border-slate-200 text-xs sm:text-sm ${
                            isBestSpec
                              ? 'bg-blue-50/70 font-bold text-[#14213D]'
                              : 'text-[#1F2937]'
                          }`}
                        >
                          {val || <span className="text-slate-400">Not specified</span>}
                          {isBestSpec && (
                            <span className="ml-2 text-[10px] font-bold text-[#2563EB] uppercase">
                              Best
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Comparison Cards */}
          <div className="md:hidden space-y-4">
            {compareProducts.map((p) => {
              const price = effectivePrice(p);
              const sale = flashByProductId.get(p.id);
              const isLowest = highlights.lowestPriceId === p.id;
              const isBestRated = highlights.bestRatingId === p.id;
              const isBestSpecs = highlights.bestSpecsId === p.id;

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex gap-3 items-start">
                    <Link
                      to={`/product/${p.id}`}
                      className="w-20 h-20 rounded-xl bg-white border border-slate-100 overflow-hidden shrink-0"
                    >
                      <SafeImage src={p.images[0]} alt={p.name} className="w-full h-full object-contain p-1.5" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {isLowest && (
                          <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            LOWEST PRICE
                          </span>
                        )}
                        {isBestRated && (
                          <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                            TOP RATED
                          </span>
                        )}
                        {isBestSpecs && (
                          <span className="text-[10px] font-extrabold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            BEST SPECS
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold uppercase text-[#2563EB]">
                        {p.brand} · {p.categoryName}
                      </p>
                      <Link to={`/product/${p.id}`} className="text-sm font-bold text-[#14213D]">
                        {p.name}
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCompare(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8FAFC] p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-500 block">Selling Price</span>
                      <strong className="font-mono text-sm text-[#14213D]">{formatINR(price)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">MRP / Discount</span>
                      <span className="line-through text-slate-400 font-mono mr-1">
                        {formatINR(p.originalPrice)}
                      </span>
                      <strong className="text-emerald-700">
                        {sale ? sale.discountPercent : p.discountPercent}% off
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Rating</span>
                      <strong className="inline-flex items-center gap-1 text-[#14213D]">
                        <Star className="w-3.5 h-3.5 fill-[#FCA311] text-[#FCA311]" />
                        {(p.ratingAvg || 0).toFixed(1)} ({p.reviewCount || 0})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Availability</span>
                      <strong className={p.stock > 0 ? 'text-emerald-700' : 'text-red-600'}>
                        {p.stock > 0 ? `${p.stock} in stock` : 'Out of Stock'}
                      </strong>
                    </div>
                  </div>

                  {allSpecKeys.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      {allSpecKeys.map((k) => (
                        <div key={k} className="grid grid-cols-3 border-b last:border-b-0 border-slate-100">
                          <span className="bg-slate-50 p-2 font-semibold text-slate-600">{k}</span>
                          <span className="col-span-2 p-2 text-[#1F2937]">
                            {p.specifications?.[k] || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(() => {
                    const areaCheck = checkProductDeliverable(p);
                    const canBuy =
                      p.active !== false &&
                      (!p.approvalStatus || p.approvalStatus === 'Approved') &&
                      p.stock > 0 &&
                      areaCheck.deliverable;
                    return (
                      <button
                        type="button"
                        disabled={!canBuy || addingId === p.id}
                        onClick={() => handleCartAdd(p)}
                        className="w-full py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {p.stock <= 0
                          ? 'Out of Stock'
                          : !areaCheck.deliverable
                          ? 'Unavailable in Area'
                          : addingId === p.id
                          ? 'Adding...'
                          : 'Add to Cart'}
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
