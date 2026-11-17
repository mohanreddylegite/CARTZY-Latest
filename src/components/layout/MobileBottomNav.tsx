import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Heart, ShoppingCart, User } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';

export const MobileBottomNav: React.FC = () => {
  const { totalCount, wishlistIds } = useCart();
  const location = useLocation();
  const activeTab = new URLSearchParams(location.search).get('tab');

  const isHome = location.pathname === '/';
  const isProducts =
    location.pathname.startsWith('/products') || location.pathname.startsWith('/flash-sales');
  const isWishlist =
    location.pathname === '/wishlist' ||
    (location.pathname === '/account' && activeTab === 'wishlist');
  const isCart = location.pathname === '/cart';
  const isAccount = location.pathname === '/account' && activeTab !== 'wishlist';

  const getItemClass = (active: boolean) =>
    `relative flex flex-col items-center justify-center min-h-[50px] py-1.5 text-[11px] flex-1 transition-colors ${
      active ? 'text-[#2563EB] font-bold' : 'text-slate-500 font-medium hover:text-[#14213D]'
    }`;

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] flex items-center justify-around pb-[env(safe-area-inset-bottom)]"
    >
      <Link to="/" className={getItemClass(isHome)}>
        {isHome && <span className="absolute top-0 w-7 h-0.5 rounded-full bg-[#2563EB]" />}
        <Home className="w-5 h-5 mb-0.5" />
        <span>Home</span>
      </Link>
      <Link to="/products" className={getItemClass(isProducts)}>
        {isProducts && <span className="absolute top-0 w-7 h-0.5 rounded-full bg-[#2563EB]" />}
        <LayoutGrid className="w-5 h-5 mb-0.5" />
        <span>Shop</span>
      </Link>
      <Link to="/wishlist" className={getItemClass(isWishlist)}>
        {isWishlist && <span className="absolute top-0 w-7 h-0.5 rounded-full bg-[#2563EB]" />}
        <div className="relative">
          <Heart className={`w-5 h-5 mb-0.5 ${isWishlist ? 'fill-[#2563EB]' : ''}`} />
          {wishlistIds.length > 0 && (
            <span className="absolute -top-1.5 -right-2.5 bg-[#2563EB] text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold tabular-nums">
              {wishlistIds.length}
            </span>
          )}
        </div>
        <span>Wishlist</span>
      </Link>
      <Link to="/cart" className={getItemClass(isCart)}>
        {isCart && <span className="absolute top-0 w-7 h-0.5 rounded-full bg-[#2563EB]" />}
        <div className="relative">
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          {totalCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 bg-[#FCA311] text-[#14213D] text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold tabular-nums">
              {totalCount}
            </span>
          )}
        </div>
        <span>Cart</span>
      </Link>
      <Link to="/account" className={getItemClass(isAccount)}>
        {isAccount && <span className="absolute top-0 w-7 h-0.5 rounded-full bg-[#2563EB]" />}
        <User className="w-5 h-5 mb-0.5" />
        <span>Account</span>
      </Link>
    </nav>
  );
};
