import React from 'react';
import { useParams } from 'react-router-dom';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import { PWAInstallButton } from '../components/common/PWAInstallButton';

const POLICY_MAP: Record<string, { title: string; sections: Array<{ heading: string; body: string }> }> = {
  about: {
    title: 'About CARTZY',
    sections: [
      {
        heading: 'Our Mission — Shop Smart. Live Better.',
        body: `${BUSINESS_CONFIG.legalEntityName} operates CARTZY to deliver verified consumer technology, lifestyle, fashion, and home essentials across India with transparent GST-inclusive pricing, zero fake discounts, and reliable order tracking.`,
      },
      {
        heading: 'Registered Office',
        body: `${BUSINESS_CONFIG.registeredAddress} · GSTIN: ${BUSINESS_CONFIG.gstin}`,
      },
    ],
  },
  contact: {
    title: 'Contact Us',
    sections: [
      {
        heading: 'Customer Support',
        body: `Email: ${BUSINESS_CONFIG.supportEmail} | Phone: ${BUSINESS_CONFIG.supportPhone} (Mon–Sat, 9:00 AM – 7:00 PM IST)`,
      },
      {
        heading: 'Corporate Address',
        body: BUSINESS_CONFIG.registeredAddress,
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Information We Collect',
        body: 'CARTZY collects only the account, contact, and delivery address details necessary to fulfill orders, verify payments securely via Razorpay, and provide order status notifications.',
      },
      {
        heading: 'Location Services & Google Maps Platform',
        body: 'When you choose to search an address, drop a delivery pin, or click Use Current Location, CARTZY uses Google Maps Platform (Maps JavaScript API, Places API, and Geocoding API) to populate your Indian delivery coordinates and address fields. Browser geolocation is requested only upon explicit button click, and manual address entry is always available if permission is denied.',
      },
      {
        heading: 'Google Play Data Safety & Multi-Role Disclosure',
        body: 'Location Services: CARTZY collects delivery pin coordinates strictly when customers select a delivery address on the map, sellers set a pickup warehouse pin, or verified delivery partners toggle Online and have an active Out for Delivery order (live GPS stops immediately upon delivery completion or going offline). Seller & Delivery Partner KYC: Sellers and delivery partners provide business/GSTIN, payout UPI/bank reference, and vehicle/license details solely for marketplace verification, order fulfillment, and payouts. Account Deletion: Any user can permanently erase their account and personal data at /legal/account-deletion or inside Account Dashboard -> Profile & Security.',
      },
      {
        heading: 'Payment & Data Security',
        body: 'Card and UPI credentials are never stored on CARTZY servers. All authentication is secured via Firebase Authentication, and user records are protected by strict owner-scoped Firestore Security Rules.',
      },
    ],
  },
  terms: {
    title: 'Terms and Conditions',
    sections: [
      {
        heading: 'Pricing & Order Acceptance',
        body: 'All prices are displayed in Indian Rupees (INR) inclusive of applicable GST. Final order totals, stock availability, and coupon eligibility are recalculated and validated on the server before an order is confirmed.',
      },
      {
        heading: 'Cash on Delivery & Online Payments',
        body: `Cash on Delivery is available up to ₹${BUSINESS_CONFIG.maxCodAmount.toLocaleString('en-IN')}. Online payments are confirmed only after cryptographic signature verification from Razorpay.`,
      },
      {
        heading: 'Google Maps End User Terms',
        body: 'By using interactive map selection and address search on CARTZY, you also agree to the Google Maps / Google Earth Additional Terms of Service (https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio) and Google Privacy Policy.',
      },
    ],
  },
  shipping: {
    title: 'Shipping Policy',
    sections: [
      {
        heading: 'Standard & Express Shipping Rules',
        body: `Standard delivery is FREE on orders of ₹${BUSINESS_CONFIG.freeShippingThreshold} and above (₹${BUSINESS_CONFIG.standardShippingFee} below threshold). Express Metro delivery (₹${BUSINESS_CONFIG.expressShippingFee}) is available for eligible metro PIN codes.`,
      },
      {
        heading: 'Dispatch & Tracking',
        body: 'Delivery estimates (4–7 business days standard; 1–3 business days Metro Express) depend on courier partner dispatch and destination PIN code serviceability.',
      },
    ],
  },
  cancellation: {
    title: 'Cancellation Policy',
    sections: [
      {
        heading: 'Eligible Cancellation Window',
        body: 'Customers can cancel orders directly from My Orders while the order status is Order Placed, Confirmed, or Processing. Once Packed or Shipped, cancellation is handled through our return process.',
      },
    ],
  },
  returns: {
    title: 'Return and Refund Policy',
    sections: [
      {
        heading: `${BUSINESS_CONFIG.returnWindowDays}-Day Return Window`,
        body: `Eligible unused items in original packaging with tags intact may be requested for return within ${BUSINESS_CONFIG.returnWindowDays} days of delivery via My Orders or Customer Support.`,
      },
      {
        heading: 'Refund Timeline',
        body: 'Prepaid refunds are initiated back to the original Razorpay payment source within 5–7 business days after quality verification.',
      },
    ],
  },
  'account-deletion': {
    title: 'Account & Data Deletion Policy',
    sections: [
      {
        heading: 'How to Delete Your CARTZY Account In-App',
        body: 'Signed-in customers can permanently delete their CARTZY account at any time by visiting Account Dashboard -> Profile & Security -> Danger Zone (Delete Account) at /account?tab=profile, entering your password (for email accounts), typing DELETE, and confirming.',
      },
      {
        heading: 'Request Deletion via Email',
        body: `If you no longer have access to your device, send a deletion request from your registered email address to ${BUSINESS_CONFIG.supportEmail} with your registered +91 mobile number. Requests are verified and processed within 7 business days.`,
      },
      {
        heading: 'What Data Is Erased vs. Retained',
        body: 'Deleting your account immediately erases your Firebase Authentication user, profile document, saved delivery addresses, synced cart, wishlist, and CARTZY Rewards balance. Completed GST tax invoices and financial ledger records may be retained strictly as required by Indian tax and GST accounting law.',
      },
    ],
  },
  'android-build': {
    title: 'PWA Installability, Android & Play Store Packaging Guide',
    sections: [
      {
        heading: 'PWA & Capacitor Configuration Ready',
        body: 'CARTZY includes a complete Progressive Web App setup (vite-plugin-pwa with autoUpdate service worker, offline storefront shell & Vijayawada Ward map precaching, public/manifest.json with 192x192, 512x512, maskable 512x512 PNG icons, and iOS 180x180 apple-touch-icon.png) alongside capacitor.config.ts (appId: in.cartzy.app, appName: CARTZY, splash color #14213D, webDir: dist).',
      },
      {
        heading: 'Build Steps for Android Studio & Play Store',
        body: '1. Install Capacitor Android dependencies: npm install @capacitor/core @capacitor/cli @capacitor/android. 2. Run npm run build && npx cap add android && npm run cap:sync. 3. Open android/ in Android Studio, configure your release signing keystore, test on device, and submit the signed AAB to Google Play Console.',
      },
      {
        heading: 'Play Console Data Safety & Account Deletion URLs',
        body: 'In Google Play Console -> App content -> Account deletion, provide your hosted /legal/account-deletion URL and reference the in-app deletion path (/account?tab=profile). In Data safety, declare Approximate/Precise Location (optional, user-triggered pin picker & active-delivery-only driver mode), Name/Email/Phone (account & order fulfillment), and encrypted transport via HTTPS/Firebase Auth.',
      },
    ],
  },
};

export const LegalPages: React.FC = () => {
  const { page = 'about' } = useParams();
  const content = POLICY_MAP[page] || POLICY_MAP.about;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-10">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-10 space-y-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#14213D] border-b border-slate-100 pb-4">
          {content.title}
        </h1>
        {content.sections.map((sec) => (
          <section key={sec.heading} className="space-y-2">
            <h2 className="text-base font-bold text-[#14213D]">{sec.heading}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{sec.body}</p>
          </section>
        ))}
        {page === 'android-build' && (
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              <strong className="text-[#14213D]">Install directly as a Web App (PWA):</strong> Available on Chrome, Edge, Android, and iOS Safari Share menu.
            </div>
            <PWAInstallButton variant="footer" />
          </div>
        )}
      </div>
    </div>
  );
};
