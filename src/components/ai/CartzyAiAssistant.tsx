import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  X,
  Send,
  ShoppingBag,
  Scale,
  Star,
  Trash2,
  ShieldCheck,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useCompare } from '../../contexts/CompareContext';
import { fetchProductById } from '../../services/storeService';
import { formatINR } from '../../services/indianValidation';
import { AiAssistantMessage, AiAssistantProductCard } from '../../types';
import { SafeImage } from '../common/SafeImage';

const SUGGESTED_QUESTIONS = [
  'Suggest a laptop under ₹50,000',
  'Best wireless headphones',
  'Where is my order?',
  'Delivery charges & return policy',
  'Top smartwatch deals right now',
];

const INITIAL_MESSAGE: AiAssistantMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi! I am CARTZY AI. Ask me to find products by budget, compare specs, check active Flash Deals, explain delivery/returns, or check your order status.',
  timestamp: new Date().toISOString(),
};

export const CartzyAiAssistant: React.FC = () => {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const { compareProducts, toggleCompare, isInCompare } = useCompare();
  const location = useLocation();
  const compareVisible = compareProducts.length > 0 && location.pathname !== '/compare';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiAssistantMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  const sendMessage = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean || loading) return;

    const userMsg: AiAssistantMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: clean,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const token = user ? await user.getIdToken() : undefined;
      const historyPayload = nextMessages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: clean,
          history: historyPayload.slice(0, -1),
        }),
      });

      const data = await res.json();
      const replyText =
        data.reply ||
        data.error ||
        'I could not process that request right now. Please try again.';

      const assistantMsg: AiAssistantMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: replyText,
        products: Array.isArray(data.recommendedProducts) ? data.recommendedProducts : [],
        hasOrdersContext: Boolean(data.hasOrdersContext),
        fallbackMode: Boolean(data.fallbackMode),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: 'Network error reaching CARTZY AI. Please try again in a moment.',
          fallbackMode: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (card: AiAssistantProductCard) => {
    setAddingId(card.id);
    try {
      const prod = await fetchProductById(card.id);
      if (prod) {
        await addToCart(
          prod,
          1,
          typeof card.flashSalePrice === 'number'
            ? { sellingPriceOverride: card.flashSalePrice }
            : undefined
        );
      }
    } catch {
      // handled by toast
    } finally {
      setAddingId(null);
    }
  };

  const handleQuickCompare = async (card: AiAssistantProductCard) => {
    const prod = await fetchProductById(card.id);
    if (prod) toggleCompare(prod);
  };

  return (
    <>
      {/* Floating Launcher Button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open CARTZY AI Shopping Assistant"
          className={`fixed ${
            compareVisible ? 'bottom-[142px] sm:bottom-[132px]' : 'bottom-[68px]'
          } md:bottom-6 right-3 md:right-6 z-40 inline-flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full bg-[#14213D] hover:bg-[#2563EB] text-white shadow-xl border border-slate-700/60 transition-all hover:scale-[1.03] cursor-pointer`}
        >
          <span className="w-7 h-7 rounded-full bg-[#FCA311] text-[#14213D] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="text-xs font-extrabold tracking-wide whitespace-nowrap">CARTZY AI</span>
        </button>
      )}

      {/* Assistant Chat Panel */}
      {open && (
        <aside
          aria-label="CARTZY AI Shopping Assistant"
          className="fixed bottom-[64px] md:bottom-6 right-3 left-3 sm:left-auto sm:w-[405px] h-[min(72dvh,560px)] max-h-[calc(100dvh-136px)] md:max-h-[calc(100dvh-6rem)] z-50 bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-[#14213D] text-white px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#FCA311] text-[#14213D] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold leading-tight truncate">CARTZY AI</h2>
                <p className="text-[11px] text-slate-300 flex items-center gap-1 truncate">
                  <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                  Live catalog &amp; {user ? 'authenticated orders' : 'guest mode'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([INITIAL_MESSAGE])}
                title="Reset conversation"
                aria-label="Clear chat"
                className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close CARTZY AI"
                className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8FAFC]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-xs whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-[#2563EB] text-white rounded-br-sm'
                      : 'bg-white text-[#1F2937] border border-slate-200 rounded-bl-sm'
                  }`}
                >
                  {msg.fallbackMode && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 mb-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Catalog Fallback Mode
                    </div>
                  )}
                  {msg.text}
                </div>

                {/* Grounded Product Recommendation Cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-2.5 w-full space-y-2">
                    {msg.products.map((card) => {
                      const effectivePrice = card.flashSalePrice ?? card.sellingPrice;
                      const compared = isInCompare(card.id);
                      return (
                        <div
                          key={card.id}
                          className="bg-white border border-slate-200 rounded-2xl p-2.5 flex gap-3 items-center shadow-xs"
                        >
                          <Link
                            to={`/product/${card.id}`}
                            onClick={() => setOpen(false)}
                            className="w-16 h-16 rounded-xl bg-[#F8FAFC] overflow-hidden shrink-0 border border-slate-100"
                          >
                            <SafeImage
                              src={card.image}
                              alt={card.name}
                              className="w-full h-full object-cover"
                            />
                          </Link>

                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase text-[#2563EB] truncate">
                              {card.brand} · {card.categoryName}
                            </p>
                            <Link
                              to={`/product/${card.id}`}
                              onClick={() => setOpen(false)}
                              className="text-xs font-bold text-[#14213D] hover:underline line-clamp-1"
                            >
                              {card.name}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-extrabold font-mono text-[#14213D]">
                                {formatINR(effectivePrice)}
                              </span>
                              {card.originalPrice > effectivePrice && (
                                <span className="text-[10px] text-slate-400 line-through font-mono">
                                  {formatINR(card.originalPrice)}
                                </span>
                              )}
                              {typeof card.flashSalePrice === 'number' && (
                                <span className="text-[10px] font-extrabold bg-[#FCA311] text-[#14213D] px-1.5 py-0.5 rounded">
                                  FLASH
                                </span>
                              )}
                              <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-600">
                                <Star className="w-3 h-3 fill-[#FCA311] text-[#FCA311]" />
                                {card.ratingAvg.toFixed(1)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-2">
                              <button
                                type="button"
                                disabled={card.stock <= 0 || addingId === card.id}
                                onClick={() => handleQuickAdd(card)}
                                className="px-2.5 py-1 rounded-lg bg-[#14213D] hover:bg-[#2563EB] text-white text-[11px] font-bold inline-flex items-center gap-1 disabled:bg-slate-200 disabled:text-slate-400"
                              >
                                <ShoppingBag className="w-3 h-3" />
                                {card.stock <= 0 ? 'Out of Stock' : addingId === card.id ? 'Adding...' : 'Add'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickCompare(card)}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${
                                  compared
                                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Scale className="w-3 h-3" />
                                {compared ? 'Compared' : 'Compare'}
                              </button>
                              <Link
                                to={`/product/${card.id}`}
                                onClick={() => setOpen(false)}
                                className="ml-auto text-[11px] font-semibold text-[#2563EB] inline-flex items-center gap-0.5 hover:underline"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Animated Typing Indicator */}
            {loading && (
              <div className="flex items-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Suggested Prompts */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => sendMessage(q)}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-[#2563EB] text-slate-700 whitespace-nowrap transition-colors shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products, budget, specs, or orders..."
              className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] border border-slate-300 rounded-xl outline-none focus:border-[#2563EB]"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="p-2.5 rounded-xl bg-[#FCA311] hover:bg-amber-400 text-[#14213D] disabled:opacity-40 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
