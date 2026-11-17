import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, MessageSquare, ShieldCheck } from 'lucide-react';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserSupportTickets, saveSupportTicket } from '../services/storeService';
import { SupportTicket } from '../types';

const FAQS = [
  {
    q: 'How can I track my CARTZY order?',
    a: 'Visit My Orders from the top bar or your Account Dashboard to view real-time status across all fulfillment stages and live delivery tracking.',
  },
  {
    q: 'Which payment methods are accepted?',
    a: 'CARTZY accepts Cash on Delivery (up to ₹50,000), UPI, Credit/Debit Cards, and Net Banking via Razorpay when payment credentials are configured.',
  },
  {
    q: 'How do cancellations and refunds work?',
    a: 'Orders in Order Placed, Confirmed, or Processing stages can be cancelled directly from My Orders. Delivered items have a 7-day return window subject to our Return Policy.',
  },
  {
    q: 'When is Express Delivery available?',
    a: 'Express delivery is available across serviceable Vijayawada zones and eligible PIN codes. Standard delivery is free on orders ₹499 and above.',
  },
];

export const SupportPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    name: profile?.fullName || '',
    email: profile?.email || '',
    orderNumber: '',
    topic: 'Order Support',
    message: '',
  });
  const [submitted, setSubmitted] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const loadTickets = async () => {
    if (!user) {
      setTickets([]);
      return;
    }
    const list = await fetchUserSupportTickets(user.uid);
    setTickets(list);
  };

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || profile?.fullName || '',
      email: prev.email || profile?.email || user?.email || '',
    }));
    loadTickets();
  }, [user?.uid, profile?.fullName, profile?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setSubmitted('Please sign in first to submit a tracked support ticket.');
      return;
    }
    setSubmitting(true);
    try {
      await saveSupportTicket({
        userId: user.uid,
        userRole: (profile?.role === 'seller' || profile?.role === 'delivery'
          ? profile.role
          : 'customer'),
        name: form.name || profile?.fullName || 'Customer',
        email: form.email || profile?.email || user.email || '',
        orderNumber: form.orderNumber,
        topic: form.topic,
        message: form.message,
      });
      setForm({ ...form, orderNumber: '', message: '' });
      setSubmitted('Your support request has been logged. Updates and replies appear below and in your notifications.');
      await loadTickets();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold text-[#14213D]">Help &amp; Customer Support</h1>
        <p className="text-sm text-slate-600 mt-1">
          Reach us at <strong>{BUSINESS_CONFIG.supportEmail}</strong> or{' '}
          <strong className="font-mono">{BUSINESS_CONFIG.supportPhone}</strong>
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-[#14213D]">Frequently Asked Questions</h2>
          {FAQS.map((item) => (
            <div key={item.q} className="bg-white rounded-2xl p-5 border border-slate-200">
              <h3 className="font-bold text-sm text-[#14213D]">{item.q}</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.a}</p>
            </div>
          ))}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-[#14213D]">Return &amp; Refund Quick Links</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link to="/legal/returns" className="text-[#2563EB] font-semibold hover:underline">Return &amp; Refund Policy</Link>
              <Link to="/legal/cancellation" className="text-[#2563EB] font-semibold hover:underline">Cancellation Policy</Link>
              <Link to="/legal/shipping" className="text-[#2563EB] font-semibold hover:underline">Shipping Policy</Link>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-slate-200 space-y-3.5 h-fit">
          <h2 className="text-lg font-bold text-[#14213D]">Submit a Support Request</h2>
          <input
            required
            placeholder="Your Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
          />
          <input
            required
            type="email"
            placeholder="Email Address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
          />
          <input
            placeholder="Order ID (Optional)"
            value={form.orderNumber}
            onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
          />
          <select
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
          >
            <option value="Order Support">Order Support</option>
            <option value="Return / Refund">Return / Refund</option>
            <option value="Payment / Billing">Payment / Billing</option>
            <option value="General Inquiry">General Inquiry</option>
          </select>
          <textarea
            required
            rows={4}
            placeholder="Tell us how we can assist you..."
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
          />
          {submitted && <p className="text-xs text-[#2563EB] font-medium">{submitted}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Submitting Ticket...' : 'Send Support Ticket'}
          </button>
        </form>
      </div>

      {user && (
        <section className="bg-white rounded-2xl p-6 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#14213D]">Your Tracked Support Tickets</h2>
              <p className="text-xs text-slate-500">
                View real-time status updates and official responses from CARTZY Support.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500 tabular-nums">
              {tickets.length} ticket(s)
            </span>
          </div>

          {tickets.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No support tickets submitted under your account yet.
            </p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#14213D]">{t.topic}</span>
                      {t.orderNumber && (
                        <span className="font-mono text-slate-500">· {t.orderNumber}</span>
                      )}
                    </div>
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
                  </div>
                  <p className="text-slate-700 leading-relaxed">{t.message}</p>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    Submitted {new Date(t.createdAt).toLocaleString('en-IN')}
                  </p>
                  {t.adminReply && (
                    <div className="mt-2 p-3 rounded-xl bg-white border border-blue-200 space-y-1">
                      <p className="font-bold text-[#14213D] inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>CARTZY Support Response</span>
                        {t.updatedAt && (
                          <span className="font-normal text-slate-400 tabular-nums">
                            · {new Date(t.updatedAt).toLocaleString('en-IN')}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-700 leading-relaxed flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{t.adminReply}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
