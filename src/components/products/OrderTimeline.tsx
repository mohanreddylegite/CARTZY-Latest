import React from 'react';
import { CheckCircle2, Circle, RotateCcw, XCircle } from 'lucide-react';
import { OrderStatus } from '../../types';

const TRACKING_STEPS: OrderStatus[] = [
  'Order Placed',
  'Confirmed',
  'Preparing',
  'Ready for Pickup',
  'Shipped',
  'Out for Delivery',
  'Delivered',
];

function mapStatusToTimelineStep(status: OrderStatus): OrderStatus {
  if (status === 'Accepted') return 'Confirmed';
  if (status === 'Processing') return 'Preparing';
  if (status === 'Packed') return 'Ready for Pickup';
  return status;
}

export const OrderTimeline: React.FC<{ currentStatus: OrderStatus }> = ({ currentStatus }) => {
  if (currentStatus === 'Return Requested') {
    return (
      <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold">
        <RotateCcw className="w-5 h-5 shrink-0 text-amber-700" />
        <span>Order Status: Return Requested (Under Review)</span>
      </div>
    );
  }

  if (currentStatus === 'Cancelled' || currentStatus === 'Returned') {
    return (
      <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
        <XCircle className="w-5 h-5 shrink-0" />
        <span>Order Status: {currentStatus}</span>
      </div>
    );
  }

  const normalized = mapStatusToTimelineStep(currentStatus);
  const activeIdx = Math.max(0, TRACKING_STEPS.indexOf(normalized));

  return (
    <>
      {/* Mobile Vertical Timeline */}
      <div className="sm:hidden py-2 space-y-2">
        {TRACKING_STEPS.map((step, idx) => {
          const completed = idx <= activeIdx;
          const isCurrent = idx === activeIdx;
          return (
            <div key={step} className="flex items-center gap-2.5">
              {completed ? (
                <CheckCircle2 className="w-5 h-5 text-[#2563EB] shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-slate-300 shrink-0" />
              )}
              <span
                className={`text-xs ${
                  isCurrent
                    ? 'text-[#2563EB] font-bold'
                    : completed
                    ? 'text-[#14213D] font-semibold'
                    : 'text-slate-400'
                }`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tablet / Desktop Horizontal Timeline */}
      <div className="hidden sm:block w-full overflow-x-auto no-scrollbar py-3">
        <div className="flex items-center justify-between min-w-[580px]">
          {TRACKING_STEPS.map((step, idx) => {
            const completed = idx <= activeIdx;
            return (
              <div key={step} className="flex-1 flex flex-col items-center relative">
                {idx > 0 && (
                  <div
                    className={`absolute top-3 -left-1/2 w-full h-0.5 ${
                      idx <= activeIdx ? 'bg-[#2563EB]' : 'bg-slate-200'
                    }`}
                  />
                )}
                <div className="relative z-10 bg-white rounded-full">
                  {completed ? (
                    <CheckCircle2 className="w-6 h-6 text-[#2563EB]" />
                  ) : (
                    <Circle className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <span
                  className={`text-[11px] mt-1.5 text-center whitespace-nowrap ${
                    completed ? 'text-[#14213D] font-semibold' : 'text-slate-400'
                  }`}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
