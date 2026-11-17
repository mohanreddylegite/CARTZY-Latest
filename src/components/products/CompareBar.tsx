import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Scale, X, ArrowRight } from 'lucide-react';
import { MAX_COMPARE_PRODUCTS, useCompare } from '../../contexts/CompareContext';
import { SafeImage } from '../common/SafeImage';

export const CompareBar: React.FC = () => {
  const { compareProducts, removeFromCompare, clearCompare } = useCompare();
  const location = useLocation();

  if (compareProducts.length === 0 || location.pathname === '/compare') {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Product Comparison Tray"
      className="fixed bottom-[64px] md:bottom-5 left-3 right-3 md:left-6 md:right-auto md:max-w-2xl z-30 bg-[#14213D] text-white rounded-2xl shadow-2xl border border-slate-700 p-2.5 sm:p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold leading-tight">
              Compare ({compareProducts.length}/{MAX_COMPARE_PRODUCTS})
            </p>
            <p className="text-[11px] text-slate-300 truncate max-w-[180px] sm:max-w-none">
              {compareProducts.length < 2
                ? 'Add 1 more product'
                : 'Ready to compare specs'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {compareProducts.map((p) => (
            <div
              key={p.id}
              className="relative group w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white overflow-hidden border border-slate-600 shrink-0"
              title={p.name}
            >
              <SafeImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeFromCompare(p.id)}
                aria-label={`Remove ${p.name} from compare`}
                className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-black/75 sm:inset-0 sm:w-auto sm:h-auto sm:rounded-none sm:bg-black/60 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              >
                <X className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          <button
            type="button"
            onClick={clearCompare}
            className="text-[11px] font-semibold text-slate-300 hover:text-white px-2 py-1.5 cursor-pointer"
          >
            Clear
          </button>
          <Link
            to="/compare"
            className="px-3 sm:px-3.5 py-2 rounded-xl bg-[#FCA311] hover:bg-amber-400 text-[#14213D] text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            Compare Now <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
