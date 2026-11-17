import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [reconnectedBanner, setReconnectedBanner] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setReconnectedBanner(false);
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setReconnectedBanner(true);
      const timer = setTimeout(() => setReconnectedBanner(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="fixed bottom-20 md:bottom-5 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#14213D] border border-amber-400/50 px-3.5 py-2 text-xs font-semibold text-white shadow-xl"
      >
        <WifiOff className="w-3.5 h-3.5 text-[#FCA311] shrink-0" />
        <span>Offline Mode — Cached storefront shell active</span>
      </div>
    );
  }

  if (reconnectedBanner) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 md:bottom-5 left-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xl"
      >
        <Wifi className="w-3.5 h-3.5 shrink-0" />
        <span>Back online — Live CARTZY data synced</span>
      </div>
    );
  }

  return null;
};
