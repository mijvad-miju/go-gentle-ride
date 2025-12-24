import React from 'react';

interface AutoRickshawProps {
  className?: string;
  size?: number;
}

const AutoRickshaw: React.FC<AutoRickshawProps> = ({ className = '', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Body */}
      <path
        d="M12 28C12 24 15 20 20 18L32 14L48 18C52 20 54 24 54 28V42C54 44 52 46 50 46H14C12 46 10 44 10 42V28Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Roof */}
      <path
        d="M18 18L32 12L48 18V24H18V18Z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* Front */}
      <path
        d="M10 32H16V40H10V32Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Window */}
      <path
        d="M22 24H46V36C46 38 44 40 42 40H26C24 40 22 38 22 36V24Z"
        fill="white"
        opacity="0.3"
      />
      {/* Wheels */}
      <circle cx="18" cy="48" r="6" fill="currentColor" />
      <circle cx="18" cy="48" r="3" fill="white" opacity="0.3" />
      <circle cx="46" cy="48" r="6" fill="currentColor" />
      <circle cx="46" cy="48" r="3" fill="white" opacity="0.3" />
      {/* Front wheel */}
      <circle cx="8" cy="42" r="4" fill="currentColor" />
      <circle cx="8" cy="42" r="2" fill="white" opacity="0.3" />
      {/* Handlebar */}
      <path
        d="M6 32L10 28V36L6 32Z"
        fill="currentColor"
        opacity="0.8"
      />
    </svg>
  );
};

export default AutoRickshaw;
