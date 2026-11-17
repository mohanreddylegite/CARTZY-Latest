import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  MessageSquare,
  Search,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import {
  adminDeleteReviewAndRecalculate,
  adminUpdateSupportTicket,
} from '../../services/marketplaceService';
import { Product, Review, SupportTicket } from '../../types';

interface SupportPanelProps {
  tickets: SupportTicket[];
  adminUid: string;
  adminEmail: string;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export const AdminSupportPanel: React.FC<SupportPanelProps> = ({
  tickets,
  adminUid,
  adminEmail,
  onFeedback,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | SupportTicket['status']>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusById, setStatusById] = useState<Record<string, SupportTicket['status']>>({});
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      open: tickets.filter((t) => t.status === 'Open').length,
      inProgress: tickets.filter((t) => t.status === 'In Progress').length,
      resolved: tickets.filter((t) => t.status === 'Resolved').length,
    }),
    [tickets]
  );

  const filteredTickets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (t.name || '').toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        (t.topic || '').toLowerCase().includes(q) ||
        (t.orderNumber || '').toLowerCase().includes(q) ||
        (t.message || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, searchTerm]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Open Tickets', val: counts.open, tone: 'text-amber-700' },
          { label: 'In Progress', val: counts.inProgress, tone: 'text-[#2563EB]' },
          { label: 'Resolved', val: counts.resolved, tone: 'text-emerald-700' },
          { label: 'Total Tickets', val: tickets.length, tone: 'text-[#14213D]' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500">{kpi.label}</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums mt-1 ${kpi.tone}`}>
              {kpi.val}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#14213D] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#2563EB]" />
              Two-Way Customer &amp; Seller Support Desk ({filteredTickets.length})
            </h2>
            <p className="text-xs text-slate-500">
              Respond directly to support requests. Updates dispatch real-time notifications to the requester.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search user, topic, order #..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs w-56"
              />
            </div>
            {(['ALL', 'Open', 'In Progress', 'Resolved'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#14213D] border-[#14213D] text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No support tickets match the active filter.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((t) => {
              const selectedStatus = statusById[t.id] ?? t.status;
              const draftReply = replyById[t.id] ?? t.adminReply ?? '';
              return (
                <div
                  key={t.id}
                  className="p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm text-[#14213D]">
                        {t.topic}
                        {t.orderNumber ? ` · ${t.orderNumber}` : ''}
                      </p>
                      <p className="text-slate-600">
                        <strong className="text-[#14213D]">{t.name}</strong> · {t.email} ·{' '}
                        <span className="uppercase font-semibold text-[#2563EB]">
                          {t.userRole || 'customer'}
                        </span>
                      </p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          t.status === 'Resolved'
                            ? 'text-emerald-700'
                            : t.status === 'In Progress'
                            ? 'text-[#2563EB]'
                            : 'text-amber-700'
                        }`}
                      >
                        {t.status === 'Resolved' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {t.status}
                      </span>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {new Date(t.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  <p className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 leading-relaxed">
                    {t.message}
                  </p>

                  <div className="grid md:grid-cols-4 gap-2.5 items-start">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Ticket Status
                      </label>
                      <select
                        value={selectedStatus}
                        onChange={(e) =>
                          setStatusById((prev) => ({
                            ...prev,
                            [t.id]: e.target.value as SupportTicket['status'],
                          }))
                        }
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-semibold"
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Official Support Reply (Sent as in-app notification)
                      </label>
                      <textarea
                        rows={2}
                        value={draftReply}
                        onChange={(e) =>
                          setReplyById((prev) => ({
                            ...prev,
                            [t.id]: e.target.value,
                          }))
                        }
                        placeholder="Write clear resolution instructions or update for the requester..."
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                    <div className="md:pt-5">
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={async () => {
                          setBusyId(t.id);
                          try {
                            await adminUpdateSupportTicket({
                              ticket: t,
                              status: selectedStatus,
                              adminReply: draftReply,
                              adminUid,
                              adminEmail,
                            });
                            onFeedback(
                              `Support ticket "${t.topic}" updated to ${selectedStatus} and requester notified.`
                            );
                            await onRefresh();
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="w-full py-2.5 px-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] disabled:opacity-50 text-white font-bold cursor-pointer"
                      >
                        {busyId === t.id ? 'Saving...' : 'Save & Notify User'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface ReviewsPanelProps {
  reviews: Review[];
  products: Product[];
  adminUid: string;
  adminEmail: string;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export const AdminReviewsPanel: React.FC<ReviewsPanelProps> = ({
  reviews,
  products,
  adminUid,
  adminEmail,
  onFeedback,
  onRefresh,
}) => {
  const [starFilter, setStarFilter] = useState<number | 'ALL'>('ALL');
  const [replyFilter, setReplyFilter] = useState<'ALL' | 'REPLIED' | 'UNREPLIED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const stats = useMemo(() => {
    const avg =
      reviews.length > 0
        ? (reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length).toFixed(1)
        : '0.0';
    return {
      total: reviews.length,
      avg,
      low: reviews.filter((r) => r.rating <= 2).length,
      replied: reviews.filter((r) => Boolean(r.sellerReply)).length,
    };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return reviews.filter((r) => {
      if (starFilter !== 'ALL' && Math.round(r.rating) !== starFilter) return false;
      if (replyFilter === 'REPLIED' && !r.sellerReply) return false;
      if (replyFilter === 'UNREPLIED' && r.sellerReply) return false;
      if (!q) return true;
      const prod = productMap.get(r.productId);
      return (
        (r.userName || '').toLowerCase().includes(q) ||
        (r.title || '').toLowerCase().includes(q) ||
        (r.comment || '').toLowerCase().includes(q) ||
        (prod?.name || '').toLowerCase().includes(q)
      );
    });
  }, [reviews, starFilter, replyFilter, searchTerm, productMap]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Verified Reviews', val: stats.total, tone: 'text-[#14213D]' },
          { label: 'Marketplace Avg', val: `${stats.avg} ★`, tone: 'text-amber-700' },
          { label: 'Low Ratings (≤ 2★)', val: stats.low, tone: 'text-red-700' },
          { label: 'Seller Replied', val: stats.replied, tone: 'text-emerald-700' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500">{kpi.label}</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums mt-1 ${kpi.tone}`}>
              {kpi.val}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#14213D] flex items-center gap-2">
              <Star className="w-4 h-4 fill-[#FCA311] text-[#FCA311]" />
              Verified Product Reviews Moderation ({filteredReviews.length})
            </h2>
            <p className="text-xs text-slate-500">
              Audit buyer reviews and seller replies. Deleting a review automatically recalculates product ratings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search product, user, review..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs w-56"
              />
            </div>
            <select
              value={starFilter}
              onChange={(e) =>
                setStarFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white font-semibold"
            >
              <option value="ALL">All Stars</option>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={s}>
                  {s} Stars
                </option>
              ))}
            </select>
            <select
              value={replyFilter}
              onChange={(e) => setReplyFilter(e.target.value as 'ALL' | 'REPLIED' | 'UNREPLIED')}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white font-semibold"
            >
              <option value="ALL">All Replies</option>
              <option value="REPLIED">Seller Replied</option>
              <option value="UNREPLIED">No Seller Reply</option>
            </select>
          </div>
        </div>

        {filteredReviews.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            No product reviews match your current filters.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredReviews.map((rev) => {
              const prod = productMap.get(rev.productId);
              return (
                <div
                  key={rev.id}
                  className="p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-bold text-[#2563EB]">
                        {prod?.name || `Product #${rev.productId}`}
                        {prod?.sellerName ? ` · Shop: ${prod.sellerName}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[#FCA311] font-bold">{'★'.repeat(rev.rating)}</span>
                        <span className="font-bold text-sm text-[#14213D]">{rev.title}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {new Date(rev.createdAt).toLocaleDateString('en-IN')}
                      </span>
                      {confirmDeleteId === rev.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === rev.id}
                            onClick={async () => {
                              setBusyId(rev.id);
                              try {
                                await adminDeleteReviewAndRecalculate({
                                  review: rev,
                                  adminUid,
                                  adminEmail,
                                });
                                setConfirmDeleteId(null);
                                onFeedback(
                                  `Removed review "${rev.title}" and recalculated rating for ${prod?.name || rev.productId}.`
                                );
                                await onRefresh();
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold cursor-pointer disabled:opacity-50"
                          >
                            {busyId === rev.id ? 'Removing...' : 'Confirm Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(rev.id)}
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-bold cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-700 leading-relaxed">{rev.comment}</p>
                  <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {rev.userName} · Verified Purchase
                  </p>

                  {rev.sellerReply && (
                    <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-0.5">
                      <p className="font-bold text-[#14213D] inline-flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Shop Reply · {rev.sellerReplyBy || 'Seller'}</span>
                      </p>
                      <p className="text-slate-700">{rev.sellerReply}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
