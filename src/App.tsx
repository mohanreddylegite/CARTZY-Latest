import React, { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { CartProvider, useCart } from './contexts/CartContext';
import { CompareProvider } from './contexts/CompareContext';
import { LocationProvider } from './contexts/LocationContext';
import { Header } from './components/layout/Header';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { Footer } from './components/layout/Footer';
import { ServiceLocationModal } from './components/maps/ServiceLocationModal';
import { CompareBar } from './components/products/CompareBar';
import { CartzyAiAssistant } from './components/ai/CartzyAiAssistant';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { FIRST_VISIT_LOGIN_SEEN_KEY, MobileOtpLogin } from './components/auth/MobileOtpLogin';
import { HomePage } from './pages/HomePage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ComparePage } from './pages/ComparePage';
import { FlashSalesPage } from './pages/FlashSalesPage';
import { CartPage } from './pages/CartPage';
import { WishlistPage } from './pages/WishlistPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderSuccessPage } from './pages/OrderSuccessPage';
import { MyOrdersPage } from './pages/MyOrdersPage';
import { AccountDashboard } from './pages/AccountDashboard';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { AdminDashboard } from './pages/AdminDashboard';
import { SellerRegisterPage } from './pages/SellerRegisterPage';
import { SellerLoginPage } from './pages/SellerLoginPage';
import { SellerDashboard } from './pages/SellerDashboard';
import { DeliveryRegisterPage } from './pages/DeliveryRegisterPage';
import { DeliveryDashboard } from './pages/DeliveryDashboard';
import { SupportPage } from './pages/SupportPage';
import { LegalPages } from './pages/LegalPages';

const ToastBanner: React.FC = () => {
  const { toastMessage, clearToast } = useCart();
  if (!toastMessage) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[136px] md:bottom-24 right-3 left-3 sm:left-auto sm:right-6 z-50 bg-[#14213D] text-white px-4 py-3 rounded-xl shadow-xl border border-white/10 text-xs font-semibold flex items-center gap-3 sm:max-w-sm"
    >
      <span className="flex-1 min-w-0 leading-snug">{toastMessage}</span>
      <button
        type="button"
        onClick={clearToast}
        className="text-[#FCA311] hover:text-amber-300 font-bold shrink-0 px-1.5 py-0.5 cursor-pointer"
      >
        OK
      </button>
    </div>
  );
};

const MapsQuotaBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onQuota = () => setVisible(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 max-w-[1440px] mx-auto">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
        <span>
          <strong>Google Maps free tier quota exceeded:</strong> Map &amp; address autocomplete requests have hit the temporary limit. Manual address entry remains available.{' '}
          <a
            href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline text-[#14213D]"
          >
            Troubleshoot quota limits
          </a>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss Google Maps quota warning"
        className="p-1 rounded-lg hover:bg-amber-200/60 text-amber-900 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

const FirstTimeMobileLoginGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FIRST_VISIT_LOGIN_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  const needsProfileOnboarding = Boolean(user && profile && profile.onboardingCompleted === false);

  useEffect(() => {
    if (user && !needsProfileOnboarding) {
      try {
        localStorage.setItem(FIRST_VISIT_LOGIN_SEEN_KEY, '1');
      } catch {
        // ignore storage errors
      }
      setDismissed(true);
    }
  }, [user, needsProfileOnboarding]);

  const exemptPaths = ['/login', '/register', '/admin', '/seller/login', '/seller/register'];
  const isExempt =
    exemptPaths.includes(location.pathname) || location.pathname.startsWith('/legal');

  const showGate = !loading && !isExempt && (needsProfileOnboarding || (!user && !dismissed));

  if (showGate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#14213D] via-[#1B2B4B] to-[#0F172A] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          <MobileOtpLogin
            subtitle="Shop Smart. Live Better. Sign in quickly with your mobile number."
            showSkipGuest
            onSuccess={() => {
              try {
                localStorage.setItem(FIRST_VISIT_LOGIN_SEEN_KEY, '1');
              } catch {
                // ignore storage errors
              }
              setDismissed(true);
            }}
            onSkipGuest={() => {
              try {
                localStorage.setItem(FIRST_VISIT_LOGIN_SEEN_KEY, '1');
              } catch {
                // ignore storage errors
              }
              setDismissed(true);
            }}
            secondaryAuthSlot={
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem(FIRST_VISIT_LOGIN_SEEN_KEY, '1');
                    } catch {
                      // ignore storage errors
                    }
                    setDismissed(true);
                    navigate('/login');
                  }}
                  className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Use Google or Email Sign-In instead
                </button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <LocationProvider>
            <CartProvider>
              <CompareProvider>
                <FirstTimeMobileLoginGate>
                  <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#1F2937] overflow-x-clip">
                    <MapsQuotaBanner />
                    <Header />
                    <ServiceLocationModal />
                  <main className="flex-1 min-w-0">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/products" element={<ProductsPage />} />
                    <Route path="/product/:id" element={<ProductDetailPage />} />
                    <Route path="/compare" element={<ComparePage />} />
                    <Route path="/flash-sales" element={<FlashSalesPage />} />
                    <Route path="/cart" element={<CartPage />} />
                    <Route path="/wishlist" element={<WishlistPage />} />
                    <Route
                      path="/checkout"
                      element={
                        <ProtectedRoute>
                          <CheckoutPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/order-success/:orderId"
                      element={
                        <ProtectedRoute>
                          <OrderSuccessPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/orders"
                      element={
                        <ProtectedRoute>
                          <MyOrdersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/account"
                      element={
                        <ProtectedRoute>
                          <AccountDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/seller/login" element={<SellerLoginPage />} />
                    <Route path="/seller/register" element={<SellerRegisterPage />} />
                    <Route
                      path="/seller"
                      element={
                        <ProtectedRoute loginRedirect="/seller/login">
                          <SellerDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/delivery/register"
                      element={
                        <ProtectedRoute>
                          <DeliveryRegisterPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/delivery"
                      element={
                        <ProtectedRoute>
                          <DeliveryDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/support" element={<SupportPage />} />
                    <Route path="/legal/:page" element={<LegalPages />} />
                  </Routes>
                </main>
                <Footer />
                <MobileBottomNav />
                <CompareBar />
                <CartzyAiAssistant />
                <OfflineIndicator />
                <ToastBanner />
              </div>
            </FirstTimeMobileLoginGate>
          </CompareProvider>
        </CartProvider>
        </LocationProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
