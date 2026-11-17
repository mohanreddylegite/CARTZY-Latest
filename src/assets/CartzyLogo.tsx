import React from 'react';

interface LogoProps {
  darkBg?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CartzyLogo: React.FC<LogoProps> = ({ darkBg = false, size = 'md' }) => {
  const iconSize = size === 'sm' ? 30 : size === 'lg' ? 44 : 36;
  const textSize = size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl' : 'text-2xl';

  return (
    <div className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="4" y="14" width="56" height="46" rx="14" fill="#14213D" />
        <path
          d="M4 26C4 19.3726 9.37258 14 16 14H48C54.6274 14 60 19.3726 60 26V30H4V26Z"
          fill="#2563EB"
        />
        <path
          d="M22 20V13C22 7.47715 26.4772 3 32 3C37.5228 3 42 7.47715 42 13V20"
          stroke="#FCA311"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M39 36C37.2 34.2 34.8 33.2 32 33.2C26.5 33.2 22 37.7 22 43.2C22 48.7 26.5 53.2 32 53.2C35.2 53.2 38 51.7 39.8 49.4"
          stroke="#FFFFFF"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <circle cx="43" cy="43" r="3.5" fill="#FCA311" />
      </svg>
      <span
        className={`${textSize} font-extrabold tracking-tight leading-none ${
          darkBg ? 'text-white' : 'text-[#14213D]'
        }`}
      >
        CART<span className="text-[#FCA311]">ZY</span>
      </span>
    </div>
  );
};
