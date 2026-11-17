import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  ExternalLink,
  FileText,
  Info,
  KeyRound,
  MapPin,
  Package,
  Phone,
  Radio,
  RefreshCw,
  RotateCcw,
  Truck,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import {
  cancelCustomerOrder,
  fetchOrderDeliveryOtp,
  fetchProductById,
  fetchUserOrders,
  getServerConfigStatus,
  requestCustomerReturn,
} from '../services/storeService';
import { getBrowserMapsApiKey } from '../services/mapsAddressParser';
import { haversineDistanceKm } from '../services/serviceabilityService';
import { DeliveryAssignment, Order, ServerConfigStatus } from '../types';
import { OrderTimeline } from '../components/products/OrderTimeline';
import { formatINR } from '../services/indianValidation';
import { OrderLocationMapModal } from '../components/maps/OrderLocationMapModal';
import { OrderInvoiceModal } from '../components/common/OrderInvoiceModal';

const RETURN_REASONS = [
  'Damaged or Defective Product',
  'Wrong Item or Variant Received',
  'Missing Accessories / Parts',
  'Product Quality Not as Expected',
  'Size or Fit Issue',
];

export const CustomerOrdersPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { user } = useAuth();
  const { addToCart, showToast } = useCart();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderOtps, setOrderOtps] = useState<Record<string, string>>({});
  const [assignmentsByOrder, setAssignmentsByOrder] = useState<Record<string, DeliveryAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Changed my mind');
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnComments, setReturnComments] = useState('');
  const [submittingReturnId, setSubmittingReturnId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [mapOrder, setMapOrder] = useState<Order | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);

  const syncOtpsForOrders = async (list: Order[]) => {
    const assigned = list.filter(
      (o) =>
        (o.assignedDriverId || o.deliveryAssignmentId) &&
        !['Delivered', 'Cancelled', 'Returned'].includes(o.orderStatus)
    );
    if (assigned.length === 0) return;
    const entries = await Promise.all(
      assigned.map(async (o) => [o.id, await fetchOrderDeliveryOtp(o.id)] as const)
    );
    const otpMap: Record<string, string> = {};
    for (const [oid, otp] of entries) {
      if (otp) otpMap[oid] = otp;
    }
    setOrderOtps(otpMap);
  };

  const loadOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await fetchUserOrders(user.uid);
      setOrders(list);
      await syncOtpsForOrders(list);
    } catch (err: any) {
      setError(err.message || 'Unable to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getServerConfigStatus().then(setServerConfig);

    const ordersQuery = query(collection(db, 'orders'), where('userId', '==', user.uid));
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Order)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setOrders(list);
        setLoading(false);
        void syncOtpsForOrders(list);
      },
      (err) => {
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'orders');
        } catch (wrapped: any) {
          setError(wrapped?.message || 'Unable to listen for order updates.');
        }
      }
    );

    return () => {
      unsubOrders();
    };
  }, [user]);

  // Live listener for active delivery assignments so customer sees driver status & GPS updates
  useEffect(() => {
    const activeAssignedIds = orders
      .filter(
        (o) =>
          (o.deliveryAssignmentId || o.assignedDriverId) &&
          !['Cancelled', 'Returned'].includes(o.orderStatus)
      )
      .map((o) => o.deliveryAssignmentId || o.id);

    if (activeAssignedIds.length === 0) return;

    const unsubs = activeAssignedIds.map((oid) =>
      onSnapshot(
        doc(db, 'deliveryAssignments', oid),
        (snap) => {
          if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() } as DeliveryAssignment;
            setAssignmentsByOrder((prev) => ({ ...prev, [data.orderId]: data }));
          }
        },
        () => {}
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [orders]);

  const handleCancel = async (orderId: string) => {
    if (!user) return;
    setCancellingId(orderId);
    setError('');
    setStatusMsg('');
    try {
      await cancelCustomerOrder(
        orderId,
        user.uid,
        cancelReason.trim() || 'Cancelled by customer from My Orders'
      );
      setConfirmCancelId(null);
      setCancelReason('Changed my mind');
      setStatusMsg('Order cancelled successfully. Product stock has been restored.');
      await loadOrders();
    } catch (err: any) {
      setError(err.message || 'Could not cancel order.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent, orderId: string) => {
    e.preventDefault();
    if (!user) return;
    setSubmittingReturnId(orderId);
    setError('');
    setStatusMsg('');
    try {
      await requestCustomerReturn(orderId, user.uid, returnReason, returnComments);
      setReturnOrderId(null);
      setReturnComments('');
      setStatusMsg('Return request submitted! Our team will inspect and process your request.');
      await loadOrders();
    } catch (err: any) {
      setError(err.message || 'Could not submit return request.');
    } finally {
      setSubmittingReturnId(null);
    }
  };

  const handleReorder = async (order: Order) => {
    setReorderingId(order.id);
    let addedCount = 0;
    try {
      for (const item of order.itemsPreview) {
        const prod = await fetchProductById(item.productId);
        if (prod && prod.active && prod.stock > 0) {
          await addToCart(prod, Math.min(item.quantity, prod.stock), {
            ...(item.selectedSize ? { selectedSize: item.selectedSize } : {}),
            ...(item.selectedColor ? { selectedColor: item.selectedColor } : {}),
          });
          addedCount += 1;
        }
      }
      if (addedCount > 0) {
        navigate('/cart');
      } else {
        showToast('Items from this order are currently out of stock.');
      }
    } finally {
      setReorderingId(null);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading your orders...</div>;
  }

  const mapsApiKey = getBrowserMapsApiKey(serverConfig?.googleMapsApiKey);

  return (
    <div className="space-y-5">
      {!embedded ? (
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#14213D]">My Orders &amp; Tracking</h1>
          <Link to="/products" className="text-sm font-semibold text-[#2563EB] hover:underline">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#14213D]">My Orders &amp; Tracking</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              View GST invoices, payment &amp; refund status, delivery milestones, and reorder past purchases.
            </p>
          </div>
          <Link to="/orders" className="text-xs font-semibold text-[#2563EB] hover:underline shrink-0">
            Full Orders View &rarr;
          </Link>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          {statusMsg}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-[#14213D]">No orders placed yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Once you place an order, you can track its live status here.
          </p>
          <Link
            to="/products"
            className="inline-block px-5 py-2.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        orders.map((order) => {
          const canCancel = ['Order Placed', 'Confirmed', 'Processing'].includes(order.orderStatus);
          const canRequestReturn = order.orderStatus === 'Delivered';
          const hasCoords =
            typeof order.deliveryAddress.lat === 'number' &&
            typeof order.deliveryAddress.lng === 'number';
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
          const verifiedCourier = order.courierTracking?.verifiedIntegration
            ? order.courierTracking
            : null;
          const handoverOtp = orderOtps[order.id];
          const driverAssignment = assignmentsByOrder[order.id];

          return (
            <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <span className="font-mono font-bold text-[#14213D] text-sm sm:text-base break-all">
                    {order.orderNumber}
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Placed {new Date(order.createdAt).toLocaleString('en-IN')} · {order.paymentMethod} (
                    {order.paymentStatus})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-[#14213D] font-mono tabular-nums mr-1">
                    {formatINR(order.pricing.finalAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setInvoiceOrder(order)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-[#14213D] text-xs font-semibold hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    GST Invoice
                  </button>
                  <button
                    type="button"
                    disabled={reorderingId === order.id}
                    onClick={() => handleReorder(order)}
                    className="px-3 py-1.5 rounded-lg bg-[#14213D] text-white text-xs font-semibold hover:bg-[#2563EB] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {reorderingId === order.id ? 'Adding...' : 'Reorder'}
                  </button>
                  {canCancel && confirmCancelId !== order.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelId(order.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  {canRequestReturn && returnOrderId !== order.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setReturnOrderId(order.id);
                        setReturnReason(RETURN_REASONS[0]);
                        setReturnComments('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Request Return
                    </button>
                  )}
                </div>
              </div>

              {handoverOtp && (
                <div className="p-3.5 rounded-xl bg-[#14213D] text-white flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#FCA311]" />
                    <span>
                      Share this 4-digit <strong>Delivery Handover PIN</strong> with your CARTZY driver only at doorstep delivery:
                    </span>
                  </div>
                  <span className="font-mono font-extrabold text-base tracking-widest bg-white/15 px-3 py-1 rounded-lg text-[#FCA311]">
                    {handoverOtp}
                  </span>
                </div>
              )}

              {(order.refundStatus && order.refundStatus !== 'None') || order.paymentStatus === 'Refunded' ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>Refund Status:</strong> {order.refundStatus || 'Processed'}
                    {order.refundAmount ? ` (${formatINR(order.refundAmount)})` : ''}
                    {order.refundNotes ? ` · ${order.refundNotes}` : ''}
                  </span>
                </div>
              ) : null}

              {confirmCancelId === order.id && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-red-900 font-semibold">
                      Confirm cancellation of order {order.orderNumber}?
                      {order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid'
                        ? ' A refund will be initiated automatically.'
                        : ''}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      maxLength={180}
                      placeholder="Cancellation reason (optional)"
                      className="flex-1 border border-red-200 bg-white rounded-lg px-3 py-1.5 text-xs"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-medium cursor-pointer"
                      >
                        Keep Order
                      </button>
                      <button
                        type="button"
                        disabled={cancellingId === order.id}
                        onClick={() => handleCancel(order.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {cancellingId === order.id ? 'Cancelling...' : 'Yes, Cancel Order'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {returnOrderId === order.id && (
                <form
                  onSubmit={(e) => handleReturnSubmit(e, order.id)}
                  className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#14213D]">
                      Request Return for {order.orderNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReturnOrderId(null)}
                      className="text-slate-500 hover:text-slate-800 font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Return Reason</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-xs"
                    >
                      {RETURN_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Additional Details (Optional)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={350}
                      placeholder="Describe the issue with the delivered item(s)..."
                      value={returnComments}
                      onChange={(e) => setReturnComments(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingReturnId === order.id}
                    className="px-4 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white font-bold text-xs disabled:opacity-50"
                  >
                    {submittingReturnId === order.id ? 'Submitting...' : 'Submit Return Request'}
                  </button>
                </form>
              )}

              {order.returnRequest && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                  <p className="font-bold">
                    Return Request ({order.returnRequest.status}) · Reason: {order.returnRequest.reason}
                  </p>
                  {order.returnRequest.comments && (
                    <p className="text-amber-800">{order.returnRequest.comments}</p>
                  )}
                  {order.returnRequest.adminNote && (
                    <p className="text-amber-900 font-medium">Review Note: {order.returnRequest.adminNote}</p>
                  )}
                  <p className="text-[11px] text-amber-700">
                    Requested on {new Date(order.returnRequest.requestedAt).toLocaleString('en-IN')}
                  </p>
                </div>
              )}

              <OrderTimeline currentStatus={order.orderStatus} />

              <div className="grid sm:grid-cols-2 gap-4 text-xs text-slate-600 bg-[#F8FAFC] p-4 rounded-xl border border-slate-200/60">
                <div className="space-y-1.5">
                  <p className="font-bold text-[#14213D]">Delivery Address</p>
                  <p>
                    {order.deliveryAddress.fullName}, {fullAddressText}
                  </p>
                  <p className="text-[#2563EB] font-medium">{order.estimatedDeliveryText}</p>
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    {hasCoords && (
                      <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        Pin: {order.deliveryAddress.lat?.toFixed(5)},{' '}
                        {order.deliveryAddress.lng?.toFixed(5)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMapOrder(order)}
                      className="px-3 py-1 rounded-lg border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 font-bold inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {hasCoords ? 'View Delivery Pin on Map' : 'View Address on Map'}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="font-bold text-[#14213D] mb-1">Items ({order.itemsCount})</p>
                  <ul className="space-y-1">
                    {order.itemsPreview.map((item, idx) => (
                      <li key={`${item.productId}_${idx}`} className="flex justify-between gap-2">
                        <span className="truncate">
                          {item.name} × {item.quantity}
                          {item.selectedSize || item.selectedColor
                            ? ` (${[item.selectedSize, item.selectedColor].filter(Boolean).join(', ')})`
                            : ''}
                        </span>
                        <span className="font-mono font-semibold shrink-0">
                          {formatINR(item.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Courier & Delivery Tracking Section */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[#14213D] flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#2563EB]" />
                    Courier &amp; Delivery Tracking
                  </p>
                  {verifiedCourier ? (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Verified Courier: {verifiedCourier.providerName}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500">
                      Milestone tracking active
                    </span>
                  )}
                </div>

                {driverAssignment ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-slate-700 bg-blue-50/70 border border-blue-200 rounded-xl p-3">
                    <div className="space-y-1">
                      <p className="font-bold text-[#14213D] flex flex-wrap items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-[#2563EB]" />
                        CARTZY Delivery Partner: {driverAssignment.driverName} (
                        <a
                          href={`tel:+91${driverAssignment.driverMobile}`}
                          className="font-mono text-[#2563EB] hover:underline inline-flex items-center gap-0.5"
                        >
                          <Phone className="w-3 h-3" />
                          {driverAssignment.driverMobile}
                        </a>
                        )
                      </p>
                      <p className="text-slate-600">
                        Assignment Status: <strong>{driverAssignment.status}</strong>
                        {!['Delivered', 'Cancelled', 'Returned'].includes(order.orderStatus) &&
                        driverAssignment.status !== 'Delivered' &&
                        typeof driverAssignment.driverLat === 'number' &&
                        typeof driverAssignment.driverLng === 'number' ? (
                          <>
                            {' '}· Live GPS: {driverAssignment.driverLat.toFixed(5)}, {driverAssignment.driverLng.toFixed(5)}
                            {hasCoords &&
                            typeof order.deliveryAddress.lat === 'number' &&
                            typeof order.deliveryAddress.lng === 'number'
                              ? (() => {
                                  const km = haversineDistanceKm(
                                    driverAssignment.driverLat!,
                                    driverAssignment.driverLng!,
                                    order.deliveryAddress.lat!,
                                    order.deliveryAddress.lng!
                                  );
                                  return (
                                    <strong className="text-emerald-700 ml-1">
                                      ({km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`} away)
                                    </strong>
                                  );
                                })()
                              : null}{' '}
                            (updated{' '}
                            {new Date(
                              driverAssignment.driverLocationUpdatedAt || driverAssignment.updatedAt
                            ).toLocaleTimeString('en-IN')}
                            )
                          </>
                        ) : order.orderStatus === 'Delivered' || driverAssignment.status === 'Delivered' ? (
                          ' · Package delivered & verified via 4-digit Handover PIN'
                        ) : (
                          ' · Live GPS activates when driver is Out for Delivery'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMapOrder(order)}
                      className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Track Live on Map
                    </button>
                  </div>
                ) : verifiedCourier ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-slate-600">
                    <div className="space-y-1">
                      <p>
                        Tracking ID:{' '}
                        <strong className="font-mono text-[#14213D]">
                          {verifiedCourier.trackingId}
                        </strong>
                      </p>
                      {verifiedCourier.liveCoordinates ? (
                        <p className="font-mono text-emerald-700">
                          Verified Courier GPS: {verifiedCourier.liveCoordinates.lat.toFixed(5)},{' '}
                          {verifiedCourier.liveCoordinates.lng.toFixed(5)} (updated{' '}
                          {new Date(verifiedCourier.liveCoordinates.updatedAt).toLocaleString('en-IN')})
                        </p>
                      ) : (
                        <p className="text-slate-500">
                          Live courier GPS coordinates are not streamed by {verifiedCourier.providerName}. Use the verified tracking portal for transit scans.
                        </p>
                      )}
                    </div>
                    {verifiedCourier.trackingUrl && (
                      <a
                        href={verifiedCourier.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-[#14213D] text-white font-semibold inline-flex items-center gap-1 hover:bg-[#2563EB]"
                      >
                        Track with {verifiedCourier.providerName}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 flex items-start gap-2 leading-relaxed">
                    <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                    <span>
                      Live courier GPS location is displayed here when an approved CARTZY delivery partner or verified logistics partner is actively delivering your order.
                    </span>
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}

      {mapOrder && (
        <OrderLocationMapModal
          isOpen={Boolean(mapOrder)}
          onClose={() => setMapOrder(null)}
          apiKey={mapsApiKey}
          orderNumber={mapOrder.orderNumber}
          recipientName={mapOrder.customerInfo.fullName}
          addressText={[
            mapOrder.deliveryAddress.houseNo,
            mapOrder.deliveryAddress.street,
            mapOrder.deliveryAddress.locality,
            mapOrder.deliveryAddress.landmark,
            mapOrder.deliveryAddress.city,
            mapOrder.deliveryAddress.district,
            `${mapOrder.deliveryAddress.state} - ${mapOrder.deliveryAddress.pincode}`,
          ]
            .filter(Boolean)
            .join(', ')}
          lat={mapOrder.deliveryAddress.lat}
          lng={mapOrder.deliveryAddress.lng}
          driverLocation={
            !['Delivered', 'Cancelled', 'Returned'].includes(mapOrder.orderStatus) &&
            assignmentsByOrder[mapOrder.id]?.status !== 'Delivered' &&
            assignmentsByOrder[mapOrder.id]?.driverLat &&
            assignmentsByOrder[mapOrder.id]?.driverLng
              ? {
                  lat: assignmentsByOrder[mapOrder.id].driverLat!,
                  lng: assignmentsByOrder[mapOrder.id].driverLng!,
                  driverName: assignmentsByOrder[mapOrder.id].driverName,
                  updatedAt: assignmentsByOrder[mapOrder.id].driverLocationUpdatedAt,
                }
              : null
          }
        />
      )}

      <OrderInvoiceModal
        order={invoiceOrder}
        onClose={() => setInvoiceOrder(null)}
      />
    </div>
  );
};

export const MyOrdersPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-3.5 sm:px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-10">
      <CustomerOrdersPanel />
    </div>
  );
};
