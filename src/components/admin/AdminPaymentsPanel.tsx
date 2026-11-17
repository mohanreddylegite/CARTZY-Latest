import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { PaymentMethod, PaymentRecord, PaymentStatus } from '../../types';
import { formatINR } from '../../services/indianValidation';

interface AdminPaymentsPanelProps {
  payments: PaymentRecord[];
}

const STATUS_BADGE_MAP: Record<PaymentStatus, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-800 border-amber-200',
  Initiated: 'bg-blue-50 text-[#2563EB] border-blue-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Cancelled: 'bg-slate-100 text-slate-700 border-slate-300',
  Refunded: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const AdminPaymentsPanel: React.FC<AdminPaymentsPanelProps> = ({ payments }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');

  const stats = useMemo(() => {
    const paid = payments.filter((p) => p.status === 'Paid');
    const pendingCod = payments.filter((p) => p.status === 'Pending' && p.method === 'COD');
    const failedOrCancelled = payments.filter(
      (p) => p.status === 'Failed' || p.status === 'Cancelled' || p.status === 'Initiated'
    );
    const refunded = payments.filter((p) => p.status === 'Refunded');

    return {
      paidCount: paid.length,
      paidTotal: paid.reduce((s, p) => s + Number(p.amount || 0), 0),
      pendingCodCount: pendingCod.length,
      pendingCodTotal: pendingCod.reduce((s, p) => s + Number(p.amount || 0), 0),
      failedCount: failedOrCancelled.length,
      refundedCount: refunded.length,
      refundedTotal: refunded.reduce((s, p) => s + Number(p.amount || 0), 0),
    };
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (methodFilter !== 'ALL' && p.method !== methodFilter) return false;
      if (!q) return true;
      return (
        (p.orderNumber || '').toLowerCase().includes(q) ||
        (p.orderId || '').toLowerCase().includes(q) ||
        (p.customerName || '').toLowerCase().includes(q) ||
        (p.customerEmail || '').toLowerCase().includes(q) ||
        (p.razorpayPaymentId || '').toLowerCase().includes(q) ||
        (p.razorpayOrderId || '').toLowerCase().includes(q) ||
        (p.razorpayRefundId || '').toLowerCase().includes(q)
      );
    });
  }, [payments, search, statusFilter, methodFilter]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Verified Online Paid</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">
            {formatINR(stats.paidTotal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{stats.paidCount} confirmed payment(s)</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>COD Pending Collection</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">
            {formatINR(stats.pendingCodTotal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{stats.pendingCodCount} active COD order(s)</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Failed / Cancelled / Incomplete</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">
            {stats.failedCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Logged payment attempts</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Refunds Processed</span>
            <RotateCcw className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">
            {formatINR(stats.refundedTotal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{stats.refundedCount} refunded transaction(s)</p>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#14213D] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#2563EB]" /> Payment Transactions &amp; Attempt Monitor
            </h2>
            <p className="text-xs text-slate-500">
              Monitor Paid, COD Pending, Initiated, Failed, Cancelled, and Refunded transactions with Razorpay references
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order #, payment ID, customer..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs w-56"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | PaymentStatus)}
              className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending (COD)</option>
              <option value="Initiated">Initiated</option>
              <option value="Failed">Failed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Refunded">Refunded</option>
            </select>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as 'ALL' | PaymentMethod)}
              className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white"
            >
              <option value="ALL">All Methods</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="NETBANKING">Net Banking</option>
              <option value="WALLET">Wallet</option>
              <option value="COD">COD</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500">
                <th className="py-2 pr-3">Order / Attempt</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Gateway Reference</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No payment records match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 align-top">
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <p className="font-mono font-bold text-xs text-[#14213D]">{p.orderNumber}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {p.orderId === 'ATTEMPT' ? 'Pre-order Attempt' : `Order: ${p.orderId.slice(0, 10)}…`}
                      </p>
                    </td>
                    <td className="py-3 pr-3 text-xs">
                      <p className="font-semibold text-[#1F2937]">{p.customerName || p.userId}</p>
                      {p.customerEmail && <p className="text-[11px] text-slate-500">{p.customerEmail}</p>}
                    </td>
                    <td className="py-3 pr-3 text-xs font-bold text-[#14213D] whitespace-nowrap">
                      {p.method}
                    </td>
                    <td className="py-3 pr-3 text-[11px] font-mono text-slate-600 space-y-0.5">
                      {p.razorpayOrderId && <p>Order: {p.razorpayOrderId}</p>}
                      {p.razorpayPaymentId && (
                        <p className="text-[#14213D] font-semibold">Pay: {p.razorpayPaymentId}</p>
                      )}
                      {p.razorpayRefundId && (
                        <p className="text-purple-700 font-semibold">Refund: {p.razorpayRefundId}</p>
                      )}
                      {!p.razorpayOrderId && !p.razorpayPaymentId && (
                        <span className="text-slate-400">Cash on Delivery</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono font-bold text-xs tabular-nums whitespace-nowrap">
                      {formatINR(p.amount)}
                    </td>
                    <td className="py-3 pr-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${STATUS_BADGE_MAP[p.status]}`}
                        >
                          {p.gatewayVerified && <ShieldCheck className="w-3 h-3" />}
                          {p.status}
                        </span>
                      </div>
                      {p.failureReason && (
                        <p className="text-[11px] text-red-700 flex items-start gap-1 max-w-xs">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{p.failureReason}</span>
                        </p>
                      )}
                    </td>
                    <td className="py-3 text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {new Date(p.updatedAt || p.createdAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
