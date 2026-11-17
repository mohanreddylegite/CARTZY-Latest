import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  SearchX,
  SlidersHorizontal,
  Store,
} from 'lucide-react';
import {
  fetchActiveCategories,
  fetchActiveProducts,
  normalizeCategoryKey,
} from '../services/storeService';
import { STARTER_CATEGORIES, STARTER_PRODUCTS } from '../data/starterCatalog';
import { useLocationService } from '../contexts/LocationContext';
import { Category, Product } from '../types';
import { ProductCard } from '../components/products/ProductCard';

type AvailabilityMode = 'in_stock' | 'high_discount' | 'low_stock';

export const ProductsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { customerLocation, serviceability, dataset, openLocationModal, checkProductDeliverable } =
    useLocationService();
  const [products, setProducts] = useState<Product[]>(STARTER_PRODUCTS);
  const [categories, setCategories] = useState<Category[]>(STARTER_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const q = searchParams.get('q') || '';
  const rawCategory = searchParams.get('category') || '';
  const selectedCategory = normalizeCategoryKey(rawCategory);
  const brandFromUrl = searchParams.get('brand') || '';
  const shopFromUrl = searchParams.get('shop') || '';
  const sortFromUrl = searchParams.get('sort') || 'popular';
  const [selectedBrand, setSelectedBrand] = useState(brandFromUrl);
  const [selectedShop, setSelectedShop] = useState(shopFromUrl);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(150000);
  const [minRating, setMinRating] = useState(0);
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>('in_stock');
  const [sortBy, setSortBy] = useState(sortFromUrl);

  useEffect(() => {
    setSelectedBrand(searchParams.get('brand') || '');
    setSelectedShop(searchParams.get('shop') || '');
    setSortBy(searchParams.get('sort') || 'popular');
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchActiveProducts(120), fetchActiveCategories()])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateUrlParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    setSearchParams(next);
  };

  const deliverablePool = useMemo(
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

  const approvedShops = useMemo(
    () => dataset.publicShops.filter((s) => s.approvalStatus === 'Approved'),
    [dataset.publicShops]
  );

  const brands = useMemo(
    () => Array.from(new Set(deliverablePool.map((p) => p.brand))).sort(),
    [deliverablePool]
  );

  const selectedCategoryObj = useMemo(
    () => categories.find((c) => normalizeCategoryKey(c.id) === selectedCategory),
    [categories, selectedCategory]
  );

  const selectedShopObj = useMemo(
    () => approvedShops.find((s) => s.shopId === selectedShop),
    [approvedShops, selectedShop]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const effectiveMin = Math.min(minPrice, maxPrice);
    const effectiveMax = Math.max(minPrice, maxPrice);

    return deliverablePool
      .filter((p) => {
        if (selectedCategory && normalizeCategoryKey(p.categoryId) !== selectedCategory) return false;
        if (selectedBrand && p.brand !== selectedBrand) return false;
        if (selectedShop && (p.sellerId || 'hub-bhavanipuram') !== selectedShop) return false;
        if (p.sellingPrice < effectiveMin || p.sellingPrice > effectiveMax) return false;
        if ((p.ratingAvg || 0) < minRating) return false;
        if (availabilityMode === 'high_discount' && (p.discountPercent || 0) < 20) return false;
        if (availabilityMode === 'low_stock' && (p.stock || 0) > 10) return false;

        if (term) {
          const specText = Object.entries(p.specifications || {})
            .map(([k, v]) => `${k} ${v}`)
            .join(' ')
            .toLowerCase();
          const tagsText = (p.tags || []).join(' ').toLowerCase();
          const matchesTerm =
            p.name.toLowerCase().includes(term) ||
            p.brand.toLowerCase().includes(term) ||
            p.categoryName.toLowerCase().includes(term) ||
            p.sku.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            tagsText.includes(term) ||
            specText.includes(term);
          if (!matchesTerm) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return a.sellingPrice - b.sellingPrice;
        if (sortBy === 'price_desc') return b.sellingPrice - a.sellingPrice;
        if (sortBy === 'newest') return b.createdAt.localeCompare(a.createdAt);
        if (sortBy === 'discount') return b.discountPercent - a.discountPercent;
        if (sortBy === 'rating') return (b.ratingAvg || 0) - (a.ratingAvg || 0);
        return (b.soldCount || 0) - (a.soldCount || 0);
      });
  }, [
    deliverablePool,
    q,
    selectedCategory,
    selectedBrand,
    selectedShop,
    minPrice,
    maxPrice,
    minRating,
    availabilityMode,
    sortBy,
  ]);

  const activeFilterCount =
    (selectedCategory ? 1 : 0) +
    (selectedBrand ? 1 : 0) +
    (selectedShop ? 1 : 0) +
    (minPrice > 0 || maxPrice < 150000 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (availabilityMode !== 'in_stock' ? 1 : 0);

  const recommended = useMemo(() => deliverablePool.slice(0, 4), [deliverablePool]);

  const resetAllFilters = () => {
    setSearchParams({});
    setSelectedBrand('');
    setSelectedShop('');
    setMinPrice(0);
    setMaxPrice(150000);
    setMinRating(0);
    setAvailabilityMode('in_stock');
    setSortBy('popular');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3.5 sm:px-4 md:px-6 py-5 md:py-8 pb-24 md:pb-10 grid grid-cols-1 lg:grid-cols-4 gap-5 lg:gap-6">
      {/* Mobile Collapsible Filter Toggle */}
      <div className="lg:hidden flex items-center justify-between gap-3 bg-white rounded-2xl px-4 py-3 border border-slate-200">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#14213D] cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#2563EB]" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-[#2563EB] text-white text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums">
              {activeFilterCount}
            </span>
          )}
          {mobileFiltersOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {(activeFilterCount > 0 || q) && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-xs text-[#2563EB] font-semibold hover:underline cursor-pointer"
          >
            Reset All
          </button>
        )}
      </div>

      <aside
        className={`${
          mobileFiltersOpen ? 'block' : 'hidden'
        } lg:block bg-white rounded-2xl p-5 border border-slate-200 h-fit space-y-5`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#14213D] flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filters
          </h2>
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-xs text-[#2563EB] font-semibold hover:underline cursor-pointer"
          >
            Reset All
          </button>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => updateUrlParams({ category: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">Brand</label>
          <select
            value={selectedBrand}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedBrand(val);
              updateUrlParams({ brand: val });
            }}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {approvedShops.length > 0 && (
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Local Approved Shop</label>
            <select
              value={selectedShop}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedShop(val);
                updateUrlParams({ shop: val });
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">All Approved Shops</option>
              {approvedShops.map((s) => (
                <option key={s.shopId} value={s.shopId}>
                  {s.shopName} ({s.locality})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 block">Price Range (INR)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-500 block mb-0.5">Min ₹</span>
              <input
                type="number"
                min={0}
                max={150000}
                step={100}
                value={minPrice}
                onChange={(e) => setMinPrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-0.5">Max ₹</span>
              <input
                type="number"
                min={0}
                max={150000}
                step={500}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
          <input
            type="range"
            min={500}
            max={150000}
            step={500}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-full accent-[#2563EB]"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Under ₹999', min: 0, max: 999 },
              { label: '₹1k–₹5k', min: 1000, max: 5000 },
              { label: '₹5k–₹25k', min: 5000, max: 25000 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setMinPrice(preset.min);
                  setMaxPrice(preset.max);
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-[#14213D] cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">Availability</label>
          <div className="space-y-1">
            {[
              { id: 'in_stock' as const, label: 'In Stock & Deliverable Only' },
              { id: 'high_discount' as const, label: 'Deals & 20%+ Discount' },
              { id: 'low_stock' as const, label: 'Limited Stock (≤ 10 left)' },
            ].map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 text-xs sm:text-sm py-0.5 cursor-pointer">
                <input
                  type="radio"
                  name="availabilityFilter"
                  checked={availabilityMode === opt.id}
                  onChange={() => setAvailabilityMode(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">Minimum Rating</label>
          <div className="space-y-1">
            {[4, 3, 2, 0].map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                <input
                  type="radio"
                  name="ratingFilter"
                  checked={minRating === r}
                  onChange={() => setMinRating(r)}
                />
                <span>{r === 0 ? 'All Ratings' : `${r}★ & above`}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      <div className="lg:col-span-3 space-y-4 sm:space-y-5 min-w-0">
        {/* Scrollable Category Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => updateUrlParams({ category: '' })}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
              !selectedCategory
                ? 'bg-[#14213D] text-white border-[#14213D]'
                : 'bg-white text-slate-700 border-slate-200 hover:border-[#2563EB]'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => {
            const active = selectedCategory === normalizeCategoryKey(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => updateUrlParams({ category: cat.id })}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#2563EB] text-white border-[#2563EB]'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-[#2563EB]'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>

        {selectedCategoryObj && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-extrabold text-[#14213D]">{selectedCategoryObj.name}</h1>
              {selectedCategoryObj.description && (
                <p className="text-xs text-slate-500 mt-0.5">{selectedCategoryObj.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => updateUrlParams({ category: '' })}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Show All Categories
            </button>
          </div>
        )}

        {selectedShopObj && (
          <div className="bg-white rounded-2xl p-4 border border-blue-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Store className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span>
                Browsing approved shop <strong className="text-[#14213D]">{selectedShopObj.shopName}</strong> ({selectedShopObj.locality})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedShop('');
                updateUrlParams({ shop: '' });
              }}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Clear Shop Filter
            </button>
          </div>
        )}

        <div
          className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            serviceability.deliverable
              ? 'bg-blue-50/70 border-blue-200 text-[#14213D]'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span className="min-w-0">
              <strong>
                {customerLocation.locality}
                {customerLocation.pincode ? ` (${customerLocation.pincode})` : ''}
              </strong>{' '}
              — {serviceability.message}
            </span>
          </div>
          <button
            type="button"
            onClick={openLocationModal}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold text-[#14213D] hover:bg-slate-50 shrink-0 cursor-pointer"
          >
            Change Area
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200">
          <p className="text-sm text-slate-600">
            Showing <strong className="text-[#14213D] tabular-nums">{filtered.length}</strong> deliverable products
            {q && (
              <>
                {' '}
                for &ldquo;<strong>{q}</strong>&rdquo;
              </>
            )}
          </p>
          <select
            value={sortBy}
            onChange={(e) => {
              const val = e.target.value;
              setSortBy(val);
              updateUrlParams({ sort: val === 'popular' ? '' : val });
            }}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white w-full sm:w-auto"
          >
            <option value="popular">Sort by: Popularity</option>
            <option value="rating">Sort by: Top Rated</option>
            <option value="newest">Sort by: Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="discount">Highest Discount</option>
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading CARTZY catalog...</div>
        ) : !serviceability.deliverable ? (
          <div className="bg-white rounded-2xl p-8 sm:p-10 text-center border border-amber-200 space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <h3 className="font-bold text-lg text-[#14213D]">
              Delivery unavailable in {customerLocation.locality}
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">{serviceability.message}</p>
            <button
              type="button"
              onClick={openLocationModal}
              className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-xs font-bold cursor-pointer"
            >
              Select Vijayawada Area
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl p-8 sm:p-10 text-center border border-slate-200 space-y-3">
              <SearchX className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="font-bold text-lg text-[#14213D]">
                No deliverable products matched {q ? `"${q}"` : 'your selected filters'}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Try clearing your search or price filters, or explore another local category in {customerLocation.locality}.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer"
                >
                  Clear Search &amp; Filters
                </button>
                <Link
                  to="/flash-sales"
                  className="px-4 py-2 rounded-xl border border-slate-300 text-[#14213D] hover:bg-slate-50 text-xs font-bold"
                >
                  View Flash Deals
                </Link>
              </div>
            </div>
            {recommended.length > 0 && (
              <div>
                <h3 className="font-bold text-lg text-[#14213D] mb-4">
                  Available Now in {customerLocation.locality}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  {recommended.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


