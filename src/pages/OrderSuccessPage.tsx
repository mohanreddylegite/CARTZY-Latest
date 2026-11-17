import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle2, Package, MapPin, ArrowRight, FileText } from 'lucide-react';
import { db } from '../lib/firebase';
import { CartzyLogo } from '../assets/CartzyLogo';
import { formatINR } from '../services/indianValidation';
import { getServerConfigStatus } from '../services/storeService';
import { getBrowserMapsApiKey } from '../services/mapsAddressParser';
import { Order, ServerConfigStatus } from '../types';
import { SafeImage } from '../components/common/SafeImage';
import { OrderLocationMapModal } from '../components/maps/OrderLocationMapModal';
import { OrderInvoiceModal } from '../components/common/OrderInvoiceModal';

export const OrderSuccessPage: React.FC = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<Order | null>((location.state as any)?.order || null);
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  useEffect(() => {
    getServerConfigStatus().then(setServerConfig);
  }, []);

  useEffect(() => {
    if (!order && orderId) {
      getDoc(doc(db, 'orders', orderId)).then((snap) => {
        if (snap.exists()) setOrder(snap.data() as Order);
      });
    }
  }, [order, orderId]);

  if (!order) {
    return <div className="p-16 text-center text-sm text-slate-500">Loading order confirmation...</div>;
  }

  const mapsApiKey = getBrowserMapsApiKey(serverConfig?.googleMapsApiKey);
  const hasCoords =
    typeof order.deliveryAddress.lat === 'number' && typeof order.deliveryAddress.lng === 'number';
  const fullAddressText = [
    order.deliveryAddress.houseNo,
    order.deliveryAddress.street,
    order.deliveryAddress.locality,
    order.deliveryAddress.landmark,
    order.deliveryAddress.city,
    order.deliveryAddress.district,
    `${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="max-w-3xl mx-auto px-3.5 sm:px-4 py-6 sm:py-10 pb-24 md:pb-12">
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-4 sm:pb-5 mb-5 sm:mb-6">
          <CartzyLogo size="sm" />
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
            {order.orderStatus}
          </span>
        </div>

        <div className="text-center mb-8">
          <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-[#14213D]">Order Placed Successfully</h1>
          <p className="text-sm text-slate-500 mt-1">
            Order ID:{' '}
            <span className="font-mono font-bold text-[#14213D]">{order.orderNumber}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-sm">
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/70">
            <h2 className="font-bold text-[#14213D] flex items-center gap-1.5 mb-2">
              <MapPin className="w-4 h-4 text-[#2563EB]" /> Delivery Address
            </h2>
            <p className="font-semibold">{order.customerInfo.fullName}</p>
            <p className="text-slate-600 font-mono text-xs">{order.customerInfo.mobile}</p>
            <p className="text-slate-600 mt-1 text-xs leading-relaxed">
              {fullAddressText}
            </p>
            {hasCoords && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                  Pin: {order.deliveryAddress.lat?.toFixed(5)}, {order.deliveryAddress.lng?.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className="text-xs font-bold text-[#2563EB] hover:underline"
                >
                  View on Google Maps
                </button>
              </div>
            )}
            <p className="text-xs text-[#2563EB] font-medium mt-2">
              Est. Delivery: {order.estimatedDeliveryText}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/70">
            <h2 className="font-bold text-[#14213D] flex items-center gap-1.5 mb-2">
              <Package className="w-4 h-4 text-[#2563EB]" /> Payment &amp; Receipt Details
            </h2>
            <p className="text-xs text-slate-600">
              Method: <strong className="text-[#14213D]">{order.paymentMethod}</strong>
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Payment Status: <strong className="text-[#14213D]">{order.paymentStatus}</strong>
            </p>
            {order.razorpayOrderId && (
              <p className="text-xs text-slate-600 mt-1 font-mono break-all">
                Gateway Order ID: <strong className="text-[#14213D]">{order.razorpayOrderId}</strong>
              </p>
            )}
            {order.razorpayPaymentId && (
              <p className="text-xs text-slate-600 mt-1 font-mono break-all">
                Transaction Ref: <strong className="text-[#14213D]">{order.razorpayPaymentId}</strong>
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Included GST: {formatINR(order.pricing.taxAmount)} · Delivery:{' '}
              {order.pricing.deliveryCharge === 0 ? 'FREE' : formatINR(order.pricing.deliveryCharge)}
            </p>
            {(order.pricing.rewardsDiscount || 0) > 0 && (
              <p className="text-xs text-emerald-700 mt-1">
                Rewards Used: {order.pricing.rewardsRedeemed} pts (-{formatINR(order.pricing.rewardsDiscount || 0)})
              </p>
            )}
            <p className="text-lg font-extrabold text-[#14213D] mt-3 font-mono tabular-nums">
              {order.paymentStatus === 'Paid' ? 'Total Paid:' : 'Total Payable:'}{' '}
              {formatINR(order.pricing.finalAmount)}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 mb-6 space-y-2.5">
          <h2 className="font-bold text-sm text-[#14213D]">Ordered Items</h2>
          {order.itemsPreview.map((item, idx) => (
            <div key={`${item.productId}_${idx}`} className="flex items-center justify-between text-sm py-1.5">
              <div className="flex items-center gap-3 min-w-0">
                <SafeImage
                  src={item.image}
                  alt={item.name}
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0">
                  <span className="truncate block">
                    {item.name} × <strong>{item.quantity}</strong>
                  </span>
                  {(item.selectedSize || item.selectedColor) && (
                    <span className="text-[11px] text-slate-500">
                      {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
              <span className="font-semibold font-mono tabular-nums shrink-0">
                {formatINR(item.lineTotal)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3 justify-center">
          <button
            type="button"
            onClick={() => setInvoiceOpen(true)}
            className="px-5 py-3 rounded-xl border border-slate-300 text-[#14213D] text-sm font-semibold hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            GST Invoice
          </button>
          <Link
            to="/orders"
            className="px-5 py-3 rounded-xl bg-[#14213D] text-white text-sm font-semibold hover:bg-[#2563EB] transition-colors text-center"
          >
            View My Orders
          </Link>
          <Link
            to="/products"
            className="px-5 py-3 rounded-xl bg-[#FCA311] text-[#14213D] text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-amber-500 transition-colors"
          >
            Continue Shopping <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <OrderLocationMapModal
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        apiKey={mapsApiKey}
        orderNumber={order.orderNumber}
        recipientName={order.customerInfo.fullName}
        addressText={fullAddressText}
        lat={order.deliveryAddress.lat}
        lng={order.deliveryAddress.lng}
      />

      <OrderInvoiceModal
        order={invoiceOpen ? order : null}
        onClose={() => setInvoiceOpen(false)}
      />
    </div>
  );
};
