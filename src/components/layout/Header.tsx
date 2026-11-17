import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, Heart, ShoppingCart, User, ShieldCheck, X, Clock, Zap, Scale, Bell, CheckCheck } from 'lucide-react';
import { CartzyLogo } from '../../assets/CartzyLogo';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useCart } from '../../contexts/CartContext';
import { useCompare } from '../../contexts/CompareContext';
import { useLocationService } from '../../contexts/LocationContext';
import { fetchActiveProducts } from '../../services/storeService';
import { AppNotification, Product } from '../../types';
import { SafeImage } from '../common/SafeImage';
import { PWAInstallButton } from '../common/PWAInstallButton';

const RECENT_SEARCH_KEY = 'cartzy_recent_searches_v1';

export const Header: React.FC = () => {
  const { user, profile, isAdmin } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { totalCount, wishlistIds } = useCart();
  const { compareProducts } = useCompare();
  const { customerLocation, serviceability, openLocationModal, checkProductDeliverable } =
    useLocationService();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [catalogCache, setCatalogCache] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCH_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (item: AppNotification) => {
    if (!item.read) {
      await markAsRead(item.id);
    }
    setShowNotifications(false);
    if (profile?.role === 'seller') {
      navigate('/seller');
      return;
    }
    if (profile?.role === 'delivery') {
      navigate('/delivery');
      return;
    }
    if (item.orderId) {
      navigate('/orders');
      return;
    }
    navigate('/account?tab=notifications');
  };

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      let source = catalogCache;
      if (source.length === 0) {
        try {
          source = await fetchActiveProducts(100);
          setCatalogCache(source);
        } catch {
          source = [];
        }
      }
      const matched = source
        .filter((p) => {
          if (p.active === false) return false;
          if (p.approvalStatus && p.approvalStatus !== 'Approved') return false;
          if ((p.stock || 0) <= 0) return false;
          if (!checkProductDeliverable(p).deliverable) return false;
          const specText = Object.entries(p.specifications || {})
            .map(([k, v]) => `${k} ${v}`)
            .join(' ')
            .toLowerCase();
          const tagsText = (p.tags || []).join(' ').toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.categoryName.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            tagsText.includes(q) ||
            specText.includes(q)
          );
        })
        .slice(0, 6);
      setSuggestions(matched);
    }, 180);

    return () => clearTimeout(timer);
  }, [searchTerm, catalogCache, checkProductDeliverable]);

  const executeSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) {
      navigate('/products');
      setShowDropdown(false);
      return;
    }
    const next = [clean, ...recentSearches.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(
      0,
      6
    );
    setRecentSearches(next);
    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
    setShowDropdown(false);
    navigate(`/products?q=${encodeURIComponent(clean)}`);
  };

  const removeRecentSearch = (termToRemove: string) => {
    const next = recentSearches.filter((r) => r !== termToRemove);
    setRecentSearches(next);
    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCH_KEY);
    } catch {
      // ignore storage errors
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Slim Top Utility Bar (Desktop only so mobile sticky height stays compact) */}
      <div className="hidden md:flex bg-[#14213D] text-slate-200 text-xs py-1.5 px-6 justify-between items-center">
        <span>Delivering across Vijayawada · Free delivery above ₹499</span>
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={openLocationModal}
            className="inline-flex items-center gap-1.5 hover:text-[#FCA311] transition-colors whitespace-nowrap shrink-0"
          >
            <MapPin className="w-3.5 h-3.5 text-[#FCA311]" />
            <span>
              {serviceability.deliverable ? 'Deliver to' : 'Check area'}:{' '}
              <strong className="text-white">{customerLocation.locality}</strong>
              {customerLocation.pincode && (
                <span className="font-mono text-slate-300 ml-1">({customerLocation.pincode})</span>
              )}
            </span>
          </button>
          <Link to="/seller/login" className="text-[#FCA311] font-semibold hover:text-amber-300 transition-colors whitespace-nowrap shrink-0">
            Seller Portal
          </Link>
          <Link to="/orders" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Track Order
          </Link>
          <Link to="/support" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Help &amp; Support
          </Link>
          <PWAInstallButton variant="header-utility" />
        </div>
      </div>

      {/* Main Header Row (2 compact rows on mobile, single row on md+) */}
      <div className="max-w-[1440px] mx-auto px-3.5 md:px-6 py-2 md:py-0 md:h-16 flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-4 lg:gap-6">
        <div className="order-1 flex items-center gap-4 xl:gap-6 shrink-0">
          <Link to="/" aria-label="CARTZY Home" className="shrink-0">
            <CartzyLogo size="sm" />
          </Link>

          <nav className="hidden lg:flex items-center gap-4 xl:gap-5 text-sm font-medium text-slate-600">
            <Link to="/products" className="hover:text-[#14213D] transition-colors whitespace-nowrap shrink-0">
              Shop All
            </Link>
            <Link
              to="/products?category=electronics"
              className="hover:text-[#14213D] transition-colors whitespace-nowrap shrink-0"
            >
              Electronics
            </Link>
            <Link
              to="/products?category=mobiles"
              className="hover:text-[#14213D] transition-colors whitespace-nowrap shrink-0"
            >
              Mobiles
            </Link>
            <Link
              to="/products?category=fashion"
              className="hover:text-[#14213D] transition-colors whitespace-nowrap shrink-0"
            >
              Fashion
            </Link>
            <Link
              to="/flash-sales"
              className="inline-flex items-center gap-1 text-amber-700 font-bold hover:text-[#14213D] transition-colors whitespace-nowrap shrink-0"
            >
              <Zap className="w-3.5 h-3.5 fill-[#FCA311] text-[#FCA311]" />
              Flash Deals
            </Link>
          </nav>
        </div>

        {/* Mobile Quick Actions (Flash Deals + Live Alerts + Vijayawada Area Chip) */}
        <div className="order-2 md:hidden flex items-center gap-1.5 min-w-0">
          <PWAInstallButton variant="mobile-icon" />
          <Link
            to="/flash-sales"
            aria-label="Flash Deals"
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 shrink-0"
          >
            <Zap className="w-4 h-4 fill-[#FCA311] text-[#FCA311]" />
          </Link>
          {user && (
            <Link
              to={
                profile?.role === 'seller'
                  ? '/seller'
                  : profile?.role === 'delivery'
                  ? '/delivery'
                  : '/account?tab=notifications'
              }
              aria-label="Notifications"
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-[#14213D] shrink-0"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}
          <button
            type="button"
            onClick={openLocationModal}
            aria-label="Set Vijayawada delivery area"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-[#14213D] text-[11px] font-semibold max-w-[140px] min-h-[36px]"
          >
            <MapPin className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            <span className="truncate">{customerLocation.locality || 'Vijayawada'}</span>
          </button>
        </div>

        {/* Search Input (Full width row on mobile, centered flex-1 on desktop) */}
        <div className="order-3 md:order-2 relative w-full md:w-auto md:flex-1 md:max-w-xl" ref={dropdownRef}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSearch(searchTerm);
            }}
            className="flex items-center bg-[#F8FAFC] border border-slate-300 rounded-xl overflow-hidden focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 transition"
          >
            <input
              type="text"
              value={searchTerm}
              onFocus={() => setShowDropdown(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowDropdown(true);
              }}
              placeholder="Search products, brands, categories..."
              className="w-full min-w-0 px-3.5 py-2 text-sm bg-transparent outline-none text-[#1F2937] placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                className="p-2 text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              aria-label="Search"
              className="bg-[#FCA311] hover:bg-amber-500 text-[#14213D] px-3.5 py-2.5 transition-colors shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {showDropdown && (suggestions.length > 0 || recentSearches.length > 0) && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 max-h-[55vh] overflow-y-auto">
              <div className="flex justify-between items-center px-2.5 py-1 text-xs font-medium text-slate-400">
                <span>
                  {suggestions.length > 0 ? 'Matching Available Products' : 'Recent Searches'}
                </span>
                <div className="flex items-center gap-3">
                  {suggestions.length === 0 && recentSearches.length > 0 && (
                    <button
                      type="button"
                      onClick={clearRecentSearches}
                      className="text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                    >
                      Clear History
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDropdown(false)}
                    className="hover:text-slate-600 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
              {suggestions.length > 0
                ? suggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        navigate(`/product/${p.id}`);
                      }}
                      className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg text-left cursor-pointer"
                    >
                      <SafeImage
                        src={p.images[0]}
                        alt={p.name}
                        className="w-10 h-10 object-cover rounded-lg shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate text-[#1F2937]">{p.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {p.brand} · {p.categoryName}
                        </p>
                      </div>
                      <span className="text-xs font-semibold font-mono tabular-nums text-[#14213D] shrink-0">
                        ₹{p.sellingPrice.toLocaleString('en-IN')}
                      </span>
                    </button>
                  ))
                : recentSearches.map((term) => (
                    <div
                      key={term}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-slate-50 rounded-lg"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm(term);
                          executeSearch(term);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2 py-0.5 text-sm text-slate-700 text-left cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{term}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecentSearch(term)}
                        aria-label={`Remove "${term}" from recent searches`}
                        className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
            </div>
          )}
        </div>

        {/* Desktop Actions */}
        <div className="order-3 hidden md:flex items-center gap-2 lg:gap-2.5 shrink-0">
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-[#14213D] hover:bg-slate-50 text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
              Admin
            </Link>
          )}

          <Link
            to="/compare"
            aria-label="Compare products"
            title="Compare Products"
            className="relative p-2.5 rounded-xl hover:bg-slate-100 text-[#14213D] transition-colors"
          >
            <Scale className="w-5 h-5" />
            {compareProducts.length > 0 && (
              <span className="absolute top-1 right-1 bg-[#FCA311] text-[#14213D] text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-extrabold tabular-nums">
                {compareProducts.length}
              </span>
            )}
          </Link>

          <Link
            to="/wishlist"
            aria-label="Wishlist"
            className="relative p-2.5 rounded-xl hover:bg-slate-100 text-[#14213D] transition-colors"
          >
            <Heart className="w-5 h-5" />
            {wishlistIds.length > 0 && (
              <span className="absolute top-1 right-1 bg-[#2563EB] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold tabular-nums">
                {wishlistIds.length}
              </span>
            )}
          </Link>

          <Link
            to="/cart"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl hover:bg-slate-100 text-[#14213D] font-semibold text-sm whitespace-nowrap shrink-0 transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            <span>Cart</span>
            <span className="bg-[#FCA311] text-[#14213D] text-xs px-1.5 py-0.5 rounded-md font-bold tabular-nums">
              {totalCount}
            </span>
          </Link>

          {user && (
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setShowNotifications((prev) => !prev)}
                aria-label="Notifications"
                title="Live Notifications"
                className="relative p-2.5 rounded-xl hover:bg-slate-100 text-[#14213D] transition-colors cursor-pointer"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 bg-red-600 text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-[#F8FAFC]">
                    <div>
                      <p className="text-xs font-extrabold text-[#14213D]">Live Notifications</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {unreadCount > 0 ? `${unreadCount} unread alert(s)` : 'All caught up'}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllAsRead()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB] hover:underline cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-xs text-slate-500">
                        No alerts yet. Order, delivery &amp; support updates appear here in real time.
                      </p>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer ${
                            n.read ? 'bg-white' : 'bg-blue-50/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-[#14213D] leading-snug">{n.title}</p>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                            {new Date(n.createdAt).toLocaleString('en-IN')}
                          </p>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="px-4 py-2.5 border-t border-slate-100 bg-[#F8FAFC] flex items-center justify-between text-[11px] font-bold">
                    <Link
                      to={
                        profile?.role === 'seller'
                          ? '/seller'
                          : profile?.role === 'delivery'
                          ? '/delivery'
                          : '/account?tab=notifications'
                      }
                      onClick={() => setShowNotifications(false)}
                      className="text-[#2563EB] hover:underline"
                    >
                      Open Notification Center &rarr;
                    </Link>
                    <Link
                      to="/account?tab=support"
                      onClick={() => setShowNotifications(false)}
                      className="text-slate-600 hover:text-[#14213D]"
                    >
                      My Tickets
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <Link
            to={user ? '/account' : '/login'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            <User className="w-4 h-4" />
            <span className="max-w-[96px] truncate">
              {user ? profile?.fullName?.split(' ')[0] || 'Account' : 'Login'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
};

