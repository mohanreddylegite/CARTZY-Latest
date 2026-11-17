import React from 'react';
import { Link } from 'react-router-dom';
import { CartzyLogo } from '../../assets/CartzyLogo';
import { BUSINESS_CONFIG } from '../../config/businessConfig';
import { PWAInstallButton } from '../common/PWAInstallButton';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#14213D] text-slate-300 mt-12 md:mt-16 pb-24 md:pb-8">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-10 sm:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="space-y-3">
          <CartzyLogo darkBg size="sm" />
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
            {BUSINESS_CONFIG.tagline} Curated consumer technology, fashion, books, and home essentials across India with transparent pricing and verified order tracking.
          </p>
          <p className="text-xs text-slate-400">
            Support: {BUSINESS_CONFIG.supportEmail} · {BUSINESS_CONFIG.supportPhone}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold text-white mb-3">Shop &amp; Partner</h3>
          <ul className="space-y-2 text-xs">
            <li><Link to="/products" className="hover:text-white transition-colors">All Products</Link></li>
            <li><Link to="/products?category=electronics" className="hover:text-white transition-colors">Electronics</Link></li>
            <li><Link to="/products?category=mobiles" className="hover:text-white transition-colors">Mobiles</Link></li>
            <li><Link to="/products?category=books-and-stationery" className="hover:text-white transition-colors">Books &amp; Stationery</Link></li>
            <li><Link to="/seller/register" className="hover:text-[#FCA311] transition-colors">Sell on CARTZY</Link></li>
            <li><Link to="/seller/login" className="hover:text-[#FCA311] transition-colors">Seller Portal Login</Link></li>
            <li><Link to="/delivery/register" className="hover:text-[#FCA311] transition-colors">Deliver with CARTZY</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold text-white mb-3">Customer Care</h3>
          <ul className="space-y-2 text-xs">
            <li><Link to="/orders" className="hover:text-white transition-colors">My Orders &amp; Tracking</Link></li>
            <li><Link to="/account" className="hover:text-white transition-colors">Account &amp; Rewards</Link></li>
            <li><Link to="/support" className="hover:text-white transition-colors">Help &amp; Support</Link></li>
            <li><Link to="/legal/about" className="hover:text-white transition-colors">About CARTZY</Link></li>
            <li><Link to="/legal/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold text-white mb-3">Policies &amp; Mobile App</h3>
          <ul className="space-y-2 text-xs">
            <li><Link to="/legal/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link to="/legal/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link></li>
            <li><Link to="/legal/shipping" className="hover:text-white transition-colors">Shipping Policy</Link></li>
            <li><Link to="/legal/returns" className="hover:text-white transition-colors">Return &amp; Refund Policy</Link></li>
            <li><Link to="/legal/account-deletion" className="hover:text-white transition-colors">Account Deletion Policy</Link></li>
            <li><Link to="/legal/android-build" className="hover:text-[#FCA311] transition-colors">Android / Play Store Setup</Link></li>
          </ul>
          <div className="mt-4">
            <PWAInstallButton variant="footer" />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} {BUSINESS_CONFIG.legalEntityName}. All rights reserved.</span>
          <span>Payments secured via Razorpay &amp; Cash on Delivery across India</span>
        </div>
      </div>
    </footer>
  );
};
