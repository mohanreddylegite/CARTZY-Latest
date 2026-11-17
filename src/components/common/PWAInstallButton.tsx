import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header-utility' | 'mobile-icon' | 'footer';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header-utility',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const buttonClasses =
    variant === 'footer'
      ? 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FCA311] hover:bg-amber-400 text-[#14213D] text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap'
      : variant === 'mobile-icon'
      ? 'inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-[#2563EB] shrink-0 cursor-pointer'
      : 'inline-flex items-center gap-1.5 text-amber-300 hover:text-white font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        aria-label="Install CARTZY App"
        title="Install CARTZY App"
        className={buttonClasses}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        {variant !== 'mobile-icon' && <span>Install App</span>}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install CARTZY on iOS"
          title="Install CARTZY on iPhone / iPad"
          className={buttonClasses}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          {variant !== 'mobile-icon' && <span>Install App</span>}
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-[#1F2937]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/apple-touch-icon.png"
                    alt="CARTZY App Icon"
                    className="w-10 h-10 rounded-xl shadow-sm shrink-0"
                  />
                  <div>
                    <h3 id="ios-install-title" className="text-base font-extrabold text-[#14213D]">
                      Install CARTZY App
                    </h3>
                    <p className="text-xs text-slate-500">Add to your iPhone or iPad Home Screen</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ol className="mt-4 space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-[#14213D] font-bold shrink-0">
                    1
                  </span>
                  <span>
                    Tap the <strong className="inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 inline text-[#2563EB]" /> Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-[#14213D] font-bold shrink-0">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-[#14213D] font-bold shrink-0">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> to launch CARTZY full-screen like a native app.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#14213D] py-2.5 text-xs font-bold text-white hover:bg-[#1B2B4B] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
