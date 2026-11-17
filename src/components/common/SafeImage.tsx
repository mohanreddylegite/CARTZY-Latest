import React, { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';

interface SafeImageProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
}) => {
  const [failed, setFailed] = useState(false);

  const resolvedSrc = src?.startsWith('/src/assets/images/')
    ? src.replace('/src/assets/images/', '/assets/images/')
    : src;

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 p-3 text-center select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <ShoppingBag className="w-6 h-6 sm:w-7 sm:h-7 mb-1 text-slate-400 shrink-0" />
        <span className="text-[11px] font-medium line-clamp-2 text-slate-500">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
