import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Lock,
  MapPin,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Store,
  Truck,
} from 'lucide-react';
import {
  adminAssignOrderToDriver,
  adminMarkSettlementPaid,
  adminProcessOrderRefund,
  adminReviewReturn,
  adminUpdateDeliveryPartnerStatus,
  adminUpdateSellerStatus,
  saveStoreSettings,
} from '../../services/marketplaceService';
import { formatINR } from '../../services/indianValidation';
import {
  AuditLog,
  DeliveryAssignment,
  DeliveryPartner,
  Order,
  Product,
  RefundStatus,
  SellerApprovalStatus,
  SellerProfile,
  SellerSettlement,
  StoreSettings,
} from '../../types';
import { getServerConfigStatus } from '../../services/storeService';
import { getBrowserMapsApiKey } from '../../services/mapsAddressParser';
import { OrderLocationMapModal } from '../maps/OrderLocationMapModal';

interface ReturnsPanelProps {
  orders: Order[];
  adminUid: string;
  adminEmail: string;
  razorpayConfigured: boolean;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export const AdminReturnsPanel: React.FC<ReturnsPanelProps> = ({
  orders,
  adminUid,
  adminEmail,
  razorpayConfigured,
  onFeedback,
  onRefresh,
}) => {
  const [noteByOrder, setNoteByOrder] = useState<Record<string, string>>({});
  const [restockByOrder, setRestockByOrder] = useState<Record<string, boolean>>({});
  const [refundAmountByOrder, setRefundAmountByOrder] = useState<Record<string, string>>({});
  const [refundNoteByOrder, setRefundNoteByOrder] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const relevantOrders = orders.filter(
    (o) =>
      o.orderStatus === 'Return Requested' ||
      o.orderStatus === 'Returned' ||
      (o.orderStatus === 'Cancelled' && (o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded')) ||
      (o.refundStatus && o.refundStatus !== 'None')
  );

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-[#14213D] flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#FCA311]" />
            Returns, Cancellations &amp; Refund Queue ({relevantOrders.length})
          </h2>
          <p className="text-xs text-slate-500">
            Approve or reject customer return requests, restock inventory, and record or trigger Razorpay refunds.
          </p>
        </div>
      </div>

      {relevantOrders.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          No active return requests or paid cancellations in the queue.
        </p>
      ) : (
        <div className="space-y-4">
          {relevantOrders.map((o) => {
            const defaultRefundAmt = String(o.refundAmount ?? o.pricing.finalAmount);
            const refundAmtVal = Number(refundAmountByOrder[o.id] ?? defaultRefundAmt);
            const refundNoteVal = refundNoteByOrder[o.id] ?? (o.refundNotes || '');

            return (
              <div
                key={o.id}
                className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <span className="font-mono font-extrabold text-[#14213D] text-sm">
                      {o.orderNumber}
                    </span>{' '}
                    · {o.customerInfo.fullName} ({o.customerInfo.mobile})
                    <p className="text-slate-500 mt-0.5">
                      Order Status: <strong>{o.orderStatus}</strong> · Payment:{' '}
                      <strong>
                        {o.paymentMethod} ({o.paymentStatus})
                      </strong>{' '}
                      · Refund: <strong>{o.refundStatus || 'None'}</strong>
                    </p>
                  </div>
                  <span className="font-mono font-extrabold text-sm text-[#14213D]">
                    {formatINR(o.pricing.finalAmount)}
                  </span>
                </div>

                {o.returnRequest && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1.5">
                    <p className="font-bold">
                      Return Request ({o.returnRequest.status}): {o.returnRequest.reason}
                    </p>
                    {o.returnRequest.comments && <p>{o.returnRequest.comments}</p>}

                    {o.orderStatus === 'Return Requested' && (
                      <div className="pt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            placeholder="Optional admin review note for customer"
                            value={noteByOrder[o.id] || ''}
                            onChange={(e) =>
                              setNoteByOrder({ ...noteByOrder, [o.id]: e.target.value })
                            }
                            className="flex-1 min-w-[220px] border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white text-xs"
                          />
                          <label className="inline-flex items-center gap-1.5 font-semibold">
                            <input
                              type="checkbox"
                              checked={restockByOrder[o.id] ?? true}
                              onChange={(e) =>
                                setRestockByOrder({ ...restockByOrder, [o.id]: e.target.checked })
                              }
                            />
                            Restock Items on Approve
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === o.id}
                            onClick={async () => {
                              setBusyId(o.id);
                              try {
                                await adminReviewReturn({
                                  orderId: o.id,
                                  decision: 'Approved',
                                  adminNote: noteByOrder[o.id],
                                  restockItems: restockByOrder[o.id] ?? true,
                                  adminUid,
                                  adminEmail,
                                });
                                onFeedback(`Return approved for ${o.orderNumber}.`);
                                await onRefresh();
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          >
                            Approve Return
                          </button>
                          <button
                            type="button"
                            disabled={busyId === o.id}
                            onClick={async () => {
                              setBusyId(o.id);
                              try {
                                await adminReviewReturn({
                                  orderId: o.id,
                                  decision: 'Rejected',
                                  adminNote: noteByOrder[o.id],
                                  restockItems: false,
                                  adminUid,
                                  adminEmail,
                                });
                                onFeedback(`Return rejected for ${o.orderNumber}.`);
                                await onRefresh();
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
                          >
                            Reject Return
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Refund ₹
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={o.pricing.finalAmount}
                      value={refundAmountByOrder[o.id] ?? defaultRefundAmt}
                      onChange={(e) =>
                        setRefundAmountByOrder({ ...refundAmountByOrder, [o.id]: e.target.value })
                      }
                      className="w-28 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Refund Notes / UTR
                    </label>
                    <input
                      placeholder="e.g. Refunded via Razorpay / NEFT ref"
                      value={refundNoteVal}
                      onChange={(e) =>
                        setRefundNoteByOrder({ ...refundNoteByOrder, [o.id]: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>

                  {(o.paymentMethod === 'COD' || !o.razorpayPaymentId
                    ? (['Initiated', 'Processed', 'Failed'] as RefundStatus[])
                    : (['Initiated', 'Failed'] as RefundStatus[])
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={busyId === o.id}
                      onClick={async () => {
                        setBusyId(o.id);
                        try {
                          await adminProcessOrderRefund({
                            order: o,
                            refundStatus: st,
                            refundAmount: refundAmtVal,
                            refundNotes: refundNoteVal,
                            attemptRazorpayGateway: false,
                            adminUid,
                            adminEmail,
                          });
                          onFeedback(`Refund marked ${st} for ${o.orderNumber}.`);
                          await onRefresh();
                        } catch (err: any) {
                          onFeedback(err?.message || 'Unable to update refund.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-[#14213D] hover:bg-slate-100 font-bold"
                    >
                      Mark {st}
                    </button>
                  ))}

                  {o.razorpayPaymentId && (
                    <button
                      type="button"
                      disabled={busyId === o.id || !razorpayConfigured}
                      title={
                        razorpayConfigured
                          ? 'Issue live refund via Razorpay API'
                          : 'Configure RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to trigger automated refunds'
                      }
                      onClick={async () => {
                        setBusyId(o.id);
                        try {
                          const res = await adminProcessOrderRefund({
                            order: o,
                            refundStatus: 'Processed',
                            refundAmount: refundAmtVal,
                            refundNotes: refundNoteVal,
                            attemptRazorpayGateway: true,
                            adminUid,
                            adminEmail,
                          });
                          onFeedback(
                            `Razorpay refund processed (${res.gatewayRefundId || 'OK'}) for ${o.orderNumber}.`
                          );
                          await onRefresh();
                        } catch (err: any) {
                          onFeedback(err?.message || 'Razorpay refund failed.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white font-bold disabled:opacity-50"
                    >
                      {razorpayConfigured ? 'Trigger Razorpay Refund' : 'Razorpay Key Required'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface SellersPanelProps {
  sellers: SellerProfile[];
  settlements: SellerSettlement[];
  products?: Product[];
  orders?: Order[];
  adminUid: string;
  adminEmail: string;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

const SELLER_STATUSES: SellerApprovalStatus[] = [
  'Pending',
  'Under Review',
  'Approved',
  'Rejected',
  'Suspended',
];

export const AdminSellersPanel: React.FC<SellersPanelProps> = ({
  sellers,
  settlements,
  products = [],
  orders = [],
  adminUid,
  adminEmail,
  onFeedback,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | SellerApprovalStatus>('ALL');
  const [commBySeller, setCommBySeller] = useState<Record<string, number>>({});
  const [reasonBySeller, setReasonBySeller] = useState<Record<string, string>>({});
  const [nameEditBySeller, setNameEditBySeller] = useState<Record<string, string>>({});
  const [catEditBySeller, setCatEditBySeller] = useState<Record<string, string>>({});
  const [inspectedSellerId, setInspectedSellerId] = useState<string | null>(null);
  const [payoutRefBySettlement, setPayoutRefBySettlement] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredSellers = sellers.filter(
    (s) => statusFilter === 'ALL' || s.approvalStatus === statusFilter
  );

  const handleStatusUpdate = async (
    s: SellerProfile,
    nextStatus: SellerApprovalStatus
  ) => {
    const commVal = commBySeller[s.sellerId] ?? s.commissionPercent;
    const reasonVal = (reasonBySeller[s.sellerId] ?? s.rejectionReason ?? '').trim();
    if (nextStatus === 'Rejected' && !reasonVal) {
      onFeedback('Enter a rejection reason before marking a seller Rejected.');
      return;
    }
    setBusyId(s.sellerId);
    try {
      await adminUpdateSellerStatus({
        sellerId: s.sellerId,
        approvalStatus: nextStatus,
        commissionPercent: commVal,
        rejectionReason: reasonVal,
        businessName: nameEditBySeller[s.sellerId] ?? s.businessName,
        shopCategory: catEditBySeller[s.sellerId] ?? s.shopCategory,
        adminUid,
        adminEmail,
      });
      onFeedback(`Seller ${s.businessName} updated to ${nextStatus}.`);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#14213D] flex items-center gap-2">
              <Store className="w-4 h-4 text-[#2563EB]" />
              Seller Verification &amp; Marketplace Shops ({filteredSellers.length})
            </h2>
            <p className="text-xs text-slate-500">
              Inspect private KYC documents, approve/reject applications, manage shop details, and configure commission %.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', ...SELLER_STATUSES] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#14213D] text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredSellers.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No seller applications match this filter.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2">Shop &amp; Owner</th>
                <th>Location, Zones &amp; Payout</th>
                <th>Catalog &amp; Sales</th>
                <th>Commission %</th>
                <th>Verification Status</th>
                <th>Admin Controls</th>
              </tr>
            </thead>
            <tbody>
              {filteredSellers.map((s) => {
                const commVal = commBySeller[s.sellerId] ?? s.commissionPercent;
                const sellerProducts = products.filter((p) => p.sellerId === s.sellerId);
                const sellerOrders = orders.filter((o) =>
                  (o.sellerIds || []).includes(s.sellerId)
                );
                const sellerGross = sellerOrders
                  .filter((o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Returned')
                  .reduce(
                    (sum, o) =>
                      sum +
                      (o.itemsPreview || [])
                        .filter((it) => it.sellerId === s.sellerId)
                        .reduce((iSum, it) => iSum + (it.lineTotal || 0), 0),
                    0
                  );
                const isExpanded = inspectedSellerId === s.sellerId;

                return (
                  <React.Fragment key={s.sellerId}>
                    <tr className="border-b last:border-b-0 align-top">
                      <td className="py-3 pr-3">
                        <div className="flex items-start gap-2.5">
                          {s.logoUrl && (
                            <img
                              src={s.logoUrl}
                              alt={s.businessName}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <div>
                            <p className="font-bold text-[#14213D]">{s.businessName}</p>
                            <p className="text-xs text-slate-500">
                              {s.ownerName} · {s.mobile} · {s.email}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Category: <strong>{s.shopCategory || 'General'}</strong>
                              {s.gstin ? ` · GSTIN: ${s.gstin}` : ' · GST Exempt / Not Provided'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <p>
                          {s.pickupAddress.locality}, {s.pickupAddress.city} - {s.pickupAddress.pincode}
                        </p>
                        <p className="text-slate-500">{s.payoutUpiOrBank || 'No payout info'}</p>
                        {s.verificationDocs && s.verificationDocs.length > 0 && (
                          <p className="text-[11px] text-[#2563EB] font-semibold mt-0.5">
                            {s.verificationDocs.length} private KYC doc(s)
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs font-mono tabular-nums">
                        <p>{sellerProducts.length} products</p>
                        <p className="text-slate-500">
                          {sellerOrders.length} orders · {formatINR(sellerGross)}
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={commVal}
                          onChange={(e) =>
                            setCommBySeller({
                              ...commBySeller,
                              [s.sellerId]: Number(e.target.value),
                            })
                          }
                          className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono"
                        />
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <span
                          className={`font-bold ${
                            s.approvalStatus === 'Approved'
                              ? 'text-emerald-700'
                              : s.approvalStatus === 'Rejected' || s.approvalStatus === 'Suspended'
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {s.approvalStatus}
                        </span>
                        {s.rejectionReason && (
                          <p className="text-[11px] text-red-600 max-w-[160px] mt-0.5">
                            {s.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 space-y-1.5 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectedSellerId(isExpanded ? null : s.sellerId)
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1 hover:bg-slate-50 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isExpanded ? 'Hide Details' : 'Inspect & KYC'}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === s.sellerId}
                            onClick={() => handleStatusUpdate(s, 'Under Review')}
                            className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 text-xs font-bold hover:bg-amber-50 cursor-pointer"
                          >
                            Under Review
                          </button>
                          <button
                            type="button"
                            disabled={busyId === s.sellerId}
                            onClick={() => handleStatusUpdate(s, 'Approved')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                          >
                            Approve
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-[#F8FAFC] border-b">
                        <td colSpan={6} className="p-4">
                          <div className="grid md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-2.5">
                              <p className="font-bold text-[#14213D]">Shop Details &amp; Inline Edit</p>
                              {s.coverImageUrl && (
                                <img
                                  src={s.coverImageUrl}
                                  alt={`${s.businessName} cover`}
                                  className="w-full h-24 object-cover rounded-xl border border-slate-200"
                                />
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  placeholder="Business Name"
                                  value={nameEditBySeller[s.sellerId] ?? s.businessName}
                                  onChange={(e) =>
                                    setNameEditBySeller({
                                      ...nameEditBySeller,
                                      [s.sellerId]: e.target.value,
                                    })
                                  }
                                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                                />
                                <input
                                  placeholder="Shop Category"
                                  value={catEditBySeller[s.sellerId] ?? (s.shopCategory || '')}
                                  onChange={(e) =>
                                    setCatEditBySeller({
                                      ...catEditBySeller,
                                      [s.sellerId]: e.target.value,
                                    })
                                  }
                                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                                />
                              </div>
                              <p className="text-slate-600">
                                <strong>Full Address:</strong> {s.pickupAddress.houseNo},{' '}
                                {s.pickupAddress.street}, {s.pickupAddress.locality},{' '}
                                {s.pickupAddress.city}, {s.pickupAddress.state} -{' '}
                                {s.pickupAddress.pincode}
                              </p>
                              {typeof s.pickupAddress.lat === 'number' &&
                                typeof s.pickupAddress.lng === 'number' && (
                                  <p className="font-mono text-emerald-700 inline-flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" />
                                    GPS: {s.pickupAddress.lat.toFixed(5)},{' '}
                                    {s.pickupAddress.lng.toFixed(5)}
                                  </p>
                                )}
                              {s.description && (
                                <p className="text-slate-600">{s.description}</p>
                              )}
                            </div>

                            <div className="space-y-3">
                              <div>
                                <p className="font-bold text-[#14213D] flex items-center gap-1.5 mb-1.5">
                                  <Lock className="w-3.5 h-3.5 text-[#2563EB]" />
                                  Private Business Verification Documents
                                </p>
                                {s.verificationDocs && s.verificationDocs.length > 0 ? (
                                  <ul className="space-y-1">
                                    {s.verificationDocs.map((docItem, idx) => (
                                      <li
                                        key={`${docItem.docType}_${idx}`}
                                        className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                                        <strong>{docItem.docType}:</strong>
                                        <a
                                          href={docItem.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[#2563EB] hover:underline truncate"
                                        >
                                          {docItem.label}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-slate-500">
                                    No verification documents uploaded by this seller yet.
                                  </p>
                                )}
                              </div>

                              <div className="space-y-2 pt-2 border-t border-slate-200">
                                <label className="block font-bold text-[#14213D]">
                                  Rejection / Suspension Reason (visible to seller)
                                </label>
                                <input
                                  placeholder="Reason if rejecting or suspending application..."
                                  value={reasonBySeller[s.sellerId] ?? s.rejectionReason ?? ''}
                                  onChange={(e) =>
                                    setReasonBySeller({
                                      ...reasonBySeller,
                                      [s.sellerId]: e.target.value,
                                    })
                                  }
                                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busyId === s.sellerId}
                                    onClick={() => handleStatusUpdate(s, 'Approved')}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                                  >
                                    Save Edits &amp; Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === s.sellerId}
                                    onClick={() => handleStatusUpdate(s, 'Rejected')}
                                    className="px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 font-bold cursor-pointer"
                                  >
                                    Reject Application
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === s.sellerId}
                                    onClick={() => handleStatusUpdate(s, 'Suspended')}
                                    className="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 font-bold cursor-pointer"
                                  >
                                    Suspend Seller
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === s.sellerId}
                                    onClick={() => handleStatusUpdate(s, 'Pending')}
                                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                                  >
                                    Reset to Pending
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 overflow-x-auto">
        <h3 className="font-bold text-[#14213D]">Seller Settlements ({settlements.length})</h3>
        {settlements.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No marketplace vendor settlements recorded yet.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2">Order</th>
                <th>Seller</th>
                <th>Gross</th>
                <th>Commission</th>
                <th>Net Payout</th>
                <th>Status &amp; Action</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((st) => (
                <tr key={st.id} className="border-b last:border-b-0">
                  <td className="py-2.5 font-mono font-bold text-xs">{st.orderNumber}</td>
                  <td className="text-xs font-semibold">{st.sellerName}</td>
                  <td className="font-mono text-xs">{formatINR(st.grossAmount)}</td>
                  <td className="font-mono text-xs text-slate-500">
                    -{formatINR(st.commissionAmount)} ({st.commissionPercent}%)
                  </td>
                  <td className="font-mono text-xs font-bold text-emerald-700">
                    {st.status === 'Cancelled' ? formatINR(0) : formatINR(st.netPayoutAmount)}
                  </td>
                  <td className="py-2.5 text-xs">
                    {st.status === 'Paid' ? (
                      <span className="text-emerald-700 font-bold">
                        Paid · <span className="font-mono">{st.payoutReference}</span>
                      </span>
                    ) : st.status === 'Cancelled' ? (
                      <span className="text-red-600 font-bold">
                        Cancelled {st.deductionReason ? `· ${st.deductionReason}` : ''}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          placeholder="UTR / Ref"
                          value={payoutRefBySettlement[st.id] || ''}
                          onChange={(e) =>
                            setPayoutRefBySettlement({
                              ...payoutRefBySettlement,
                              [st.id]: e.target.value,
                            })
                          }
                          className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono w-32"
                        />
                        <button
                          type="button"
                          disabled={busyId === st.id}
                          onClick={async () => {
                            setBusyId(st.id);
                            try {
                              await adminMarkSettlementPaid({
                                settlement: st,
                                payoutReference: payoutRefBySettlement[st.id] || '',
                                adminUid,
                                adminEmail,
                              });
                              onFeedback(`Marked ${st.orderNumber} payout as Paid.`);
                              await onRefresh();
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#14213D] text-white font-bold cursor-pointer"
                        >
                          Mark Paid
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

interface DeliveryPanelProps {
  partners: DeliveryPartner[];
  assignments: DeliveryAssignment[];
  orders: Order[];
  adminUid: string;
  adminEmail: string;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export const AdminDeliveryPanel: React.FC<DeliveryPanelProps> = ({
  partners,
  assignments,
  orders,
  adminUid,
  adminEmail,
  onFeedback,
  onRefresh,
}) => {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(45);
  const [pickupSummary, setPickupSummary] = useState('CARTZY Bhavanipuram Operations Hub, Vijayawada');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState('');
  const [mapAssignment, setMapAssignment] = useState<DeliveryAssignment | null>(null);
  const [mapsKey, setMapsKey] = useState('');

  React.useEffect(() => {
    getServerConfigStatus().then((cfg) => setMapsKey(getBrowserMapsApiKey(cfg.googleMapsApiKey)));
  }, []);

  const assignmentByOrderId: Record<string, DeliveryAssignment> = {};
  for (const a of assignments) {
    assignmentByOrderId[a.orderId] = a;
  }

  const approvedDrivers = [...partners]
    .filter((p) => p.verificationStatus === 'Approved')
    .sort((a, b) => Number(b.isOnline) - Number(a.isOnline));

  const assignableOrders = orders.filter((o) => {
    if (
      !['Confirmed', 'Accepted', 'Processing', 'Preparing', 'Packed', 'Ready for Pickup', 'Shipped'].includes(
        o.orderStatus
      )
    ) {
      return false;
    }
    const existingAssign = assignmentByOrderId[o.id];
    return !o.assignedDriverId || existingAssign?.status === 'Rejected';
  });

  const selectedOrderObj = orders.find((o) => o.id === selectedOrderId);
  const selectedOrderZoneId = selectedOrderObj?.serviceAreaMeta?.zoneId;

  return (
    <div className="space-y-6">
      {/* Dispatch Order to Driver */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
        <div>
          <h2 className="font-bold text-[#14213D] flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#2563EB]" />
            Dispatch Order to Delivery Partner
          </h2>
          <p className="text-xs text-slate-500">
            Assigning generates an encrypted 4-digit customer Delivery Handover PIN (SHA-256 verified at doorstep). Rejected tasks automatically reappear here for reassignment.
          </p>
        </div>

        {dispatchError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {dispatchError}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          <select
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
          >
            <option value="">Select Order to Dispatch ({assignableOrders.length})</option>
            {assignableOrders.map((o) => {
              const isRejected = assignmentByOrderId[o.id]?.status === 'Rejected';
              return (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} · {o.deliveryAddress.locality}, {o.deliveryAddress.city} ({o.orderStatus})
                  {isRejected ? ' [Driver Rejected — Reassign]' : ''}
                </option>
              );
            })}
          </select>

          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
          >
            <option value="">Select Approved Driver ({approvedDrivers.length})</option>
            {approvedDrivers.map((d) => {
              const zoneMatch =
                selectedOrderZoneId &&
                Array.isArray(d.assignedZones) &&
                d.assignedZones.includes(selectedOrderZoneId);
              return (
                <option key={d.partnerId} value={d.partnerId}>
                  {d.fullName} ({d.city}) {d.isOnline ? '· ONLINE' : '· Offline'}
                  {zoneMatch ? ' ★ Zone Match' : ''}
                </option>
              );
            })}
          </select>

          <input
            placeholder="Pickup Hub"
            value={pickupSummary}
            onChange={(e) => setPickupSummary(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2"
          />

          <input
            type="number"
            min={20}
            max={500}
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(Number(e.target.value))}
            placeholder="Driver Fee ₹"
            className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
          />

          <button
            type="button"
            disabled={!selectedOrderId || !selectedDriverId || busyId === 'dispatch'}
            onClick={async () => {
              const ord = orders.find((o) => o.id === selectedOrderId);
              const drv = approvedDrivers.find((d) => d.partnerId === selectedDriverId);
              if (!ord || !drv) return;
              setDispatchError('');
              setBusyId('dispatch');
              try {
                const res = await adminAssignOrderToDriver({
                  order: ord,
                  driver: drv,
                  deliveryFeeEarning: deliveryFee,
                  pickupSummary,
                  adminUid,
                  adminEmail,
                });
                onFeedback(
                  `Dispatched ${ord.orderNumber} to ${drv.fullName}. Customer Handover PIN (${res.otp}) is stored securely in orderSecrets.`
                );
                setSelectedOrderId('');
                setSelectedDriverId('');
                await onRefresh();
              } catch (err: any) {
                setDispatchError(err?.message || 'Unable to assign delivery partner.');
              } finally {
                setBusyId(null);
              }
            }}
            className="rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white font-bold px-4 py-2 disabled:opacity-50 cursor-pointer"
          >
            Assign &amp; Generate PIN
          </button>
        </div>
      </div>

      {/* Fleet Approval Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 overflow-x-auto">
        <h3 className="font-bold text-[#14213D]">Delivery Partner Fleet ({partners.length})</h3>
        {partners.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No delivery partner applications yet.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2">Partner</th>
                <th>Vehicle &amp; License</th>
                <th>Availability</th>
                <th>Deliveries</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.partnerId} className="border-b last:border-b-0">
                  <td className="py-3 pr-3">
                    <p className="font-bold text-[#14213D]">{p.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {p.mobile} · {p.city}, {p.state}
                    </p>
                    {p.assignedZones && p.assignedZones.length > 0 && (
                      <p className="text-[11px] font-mono text-[#2563EB] mt-0.5">
                        Zones: {p.assignedZones.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-xs font-mono">
                    {p.vehicleType} · {p.vehicleNumber}
                    <p className="text-[11px] text-slate-500">DL: {p.licenseNumber}</p>
                  </td>
                  <td className="py-3 pr-3 text-xs font-bold">
                    <span className={p.isOnline ? 'text-emerald-700' : 'text-slate-400'}>
                      {p.isOnline ? 'ONLINE' : 'Offline'}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-xs font-mono tabular-nums">
                    {p.totalDeliveries} ({formatINR(p.totalEarnings)})
                  </td>
                  <td className="py-3 pr-3 text-xs font-bold">{p.verificationStatus}</td>
                  <td className="py-3 space-x-2 whitespace-nowrap">
                    {(['Approved', 'Suspended'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={busyId === p.partnerId}
                        onClick={async () => {
                          setBusyId(p.partnerId);
                          try {
                            await adminUpdateDeliveryPartnerStatus({
                              partnerId: p.partnerId,
                              verificationStatus: st,
                              adminUid,
                              adminEmail,
                            });
                            onFeedback(`Partner ${p.fullName} marked ${st}.`);
                            await onRefresh();
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          st === 'Approved'
                            ? 'bg-emerald-600 text-white'
                            : 'border border-red-300 text-red-600'
                        }`}
                      >
                        {st === 'Approved' ? 'Approve' : 'Suspend'}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Active & Recent Assignments */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 overflow-x-auto">
        <h3 className="font-bold text-[#14213D]">Delivery Assignments ({assignments.length})</h3>
        {assignments.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No delivery assignments dispatched yet.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2">Order</th>
                <th>Driver</th>
                <th>Customer</th>
                <th>COD</th>
                <th>Status</th>
                <th>Tracking</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0">
                  <td className="py-2.5 font-mono font-bold text-xs">{a.orderNumber}</td>
                  <td className="text-xs">
                    {a.driverName} (<span className="font-mono">{a.driverMobile}</span>)
                  </td>
                  <td className="text-xs">
                    {a.customerName} · {a.deliverySummary}
                  </td>
                  <td className="font-mono text-xs">{formatINR(a.codAmountToCollect)}</td>
                  <td className="text-xs font-bold">
                    <span
                      className={
                        a.status === 'Delivered'
                          ? 'text-emerald-700'
                          : a.status === 'Rejected'
                          ? 'text-red-600'
                          : 'text-[#2563EB]'
                      }
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setMapAssignment(a)}
                      className="px-2.5 py-1 rounded-lg border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" /> Map
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mapAssignment && (
        <OrderLocationMapModal
          isOpen={Boolean(mapAssignment)}
          onClose={() => setMapAssignment(null)}
          apiKey={mapsKey}
          orderNumber={mapAssignment.orderNumber}
          recipientName={mapAssignment.customerName}
          addressText={mapAssignment.deliverySummary}
          lat={mapAssignment.deliveryLat}
          lng={mapAssignment.deliveryLng}
          driverLocation={
            typeof mapAssignment.driverLat === 'number' && typeof mapAssignment.driverLng === 'number'
              ? {
                  lat: mapAssignment.driverLat,
                  lng: mapAssignment.driverLng,
                  driverName: mapAssignment.driverName,
                  updatedAt: mapAssignment.driverLocationUpdatedAt,
                }
              : null
          }
        />
      )}
    </div>
  );
};

interface SettingsAndAuditProps {
  settings: StoreSettings;
  auditLogs: AuditLog[];
  adminUid: string;
  adminEmail: string;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export const AdminSettingsPanel: React.FC<SettingsAndAuditProps> = ({
  settings,
  adminUid,
  adminEmail,
  onFeedback,
  onRefresh,
}) => {
  const [form, setForm] = useState({
    earnPointsPer100: settings.earnPointsPer100,
    rupeePerPoint: settings.rupeePerPoint,
    maxRedeemPercent: settings.maxRedeemPercent,
    referralBonusPoints: settings.referralBonusPoints,
    defaultSellerCommissionPercent: settings.defaultSellerCommissionPercent,
    promoBannerText: settings.promoBannerText || '',
    promoBannerActive: Boolean(settings.promoBannerActive),
  });
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await saveStoreSettings(form, adminUid, adminEmail);
          onFeedback('Store settings & promotional banner updated.');
          await onRefresh();
        } finally {
          setSaving(false);
        }
      }}
      className="bg-white p-6 rounded-2xl border border-slate-200 max-w-3xl space-y-5"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Settings className="w-5 h-5 text-[#2563EB]" />
        <div>
          <h2 className="font-bold text-[#14213D]">Loyalty, Commission &amp; Homepage Banner Settings</h2>
          <p className="text-xs text-slate-500">
            Synced live via Firestore <code>settings/store</code> across Homepage, Checkout, and Seller onboarding.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 text-xs">
        <div>
          <label className="block font-bold text-[#14213D] mb-1">Reward Pts per ₹100 Spend</label>
          <input
            type="number"
            min={0}
            max={50}
            value={form.earnPointsPer100}
            onChange={(e) => setForm({ ...form, earnPointsPer100: Number(e.target.value) })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block font-bold text-[#14213D] mb-1">Rupee Value per Point (₹)</label>
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.5}
            value={form.rupeePerPoint}
            onChange={(e) => setForm({ ...form, rupeePerPoint: Number(e.target.value) })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block font-bold text-[#14213D] mb-1">Max Checkout Redeem (%)</label>
          <input
            type="number"
            min={0}
            max={50}
            value={form.maxRedeemPercent}
            onChange={(e) => setForm({ ...form, maxRedeemPercent: Number(e.target.value) })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block font-bold text-[#14213D] mb-1">Referral Bonus Points</label>
          <input
            type="number"
            min={0}
            max={5000}
            value={form.referralBonusPoints}
            onChange={(e) => setForm({ ...form, referralBonusPoints: Number(e.target.value) })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block font-bold text-[#14213D] mb-1">Default Seller Commission (%)</label>
          <input
            type="number"
            min={0}
            max={50}
            value={form.defaultSellerCommissionPercent}
            onChange={(e) =>
              setForm({ ...form, defaultSellerCommissionPercent: Number(e.target.value) })
            }
            className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-slate-100">
        <label className="block text-xs font-bold text-[#14213D]">
          Storefront Top Promotional Announcement Bar
        </label>
        <input
          maxLength={240}
          placeholder="e.g. Festive Deal: Use code CARTZY10 for 10% OFF orders above ₹499!"
          value={form.promoBannerText}
          onChange={(e) => setForm({ ...form, promoBannerText: e.target.value })}
          className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
        />
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#14213D]">
          <input
            type="checkbox"
            checked={form.promoBannerActive}
            onChange={(e) => setForm({ ...form, promoBannerActive: e.target.checked })}
          />
          Display Promotional Banner on Storefront
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving Settings...' : 'Save Store Settings'}
      </button>
    </form>
  );
};

export const AdminAuditLogsPanel: React.FC<{ auditLogs: AuditLog[] }> = ({ auditLogs }) => {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 overflow-x-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[#14213D] flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[#2563EB]" />
          Immutable Admin Audit Logs ({auditLogs.length})
        </h2>
        <span className="text-[11px] text-slate-500">Append-only compliance ledger</span>
      </div>
      {auditLogs.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No admin audit actions recorded yet.</p>
      ) : (
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2">Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} className="border-b last:border-b-0">
                <td className="py-2.5 pr-3 font-mono whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('en-IN')}
                </td>
                <td className="py-2.5 pr-3">{log.actorEmail}</td>
                <td className="py-2.5 pr-3 font-mono font-bold text-[#14213D]">{log.action}</td>
                <td className="py-2.5 pr-3 font-mono text-slate-500">
                  {log.targetType}/{log.targetId.slice(0, 10)}
                </td>
                <td className="py-2.5">{log.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
