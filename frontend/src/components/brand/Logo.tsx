import React from 'react';
import clsx from 'clsx';
import './Logo.css';

export type LogoVariant = 'full' | 'compact' | 'icon';
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: LogoVariant;
  size?: LogoSize;
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Drishti Himalaya Brand Mark SVG
 * Visual Metaphor:
 * - Tiered Himalayan mountain crests (physical terrain)
 * - Harmonious elliptical aperture integrated into the ridge lines (the watchful "Drishti" / Vision)
 * - Summit beacon at the convergence point (early warning intelligence)
 */
export const LogoMark: React.FC<{ sizePx?: number; className?: string }> = ({
  sizePx = 32,
  className,
}) => (
  <svg
    width={sizePx}
    height={sizePx}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={clsx('dh-logo-mark', className)}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      {/* Primary Glacier Cyan Gradient */}
      <linearGradient id="dh-crest-glacier" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8ee0f7" />
        <stop offset="50%" stopColor="#4ea4c7" />
        <stop offset="100%" stopColor="#1e4e6d" />
      </linearGradient>

      {/* Deep Himalayan Shadow Gradient */}
      <linearGradient id="dh-crest-shadow" x1="24" y1="12" x2="24" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#152738" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#08101a" stopOpacity="0.95" />
      </linearGradient>

      {/* Vision Horizon Glow */}
      <radialGradient id="dh-eye-glow" cx="24" cy="22" r="10" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8ee0f7" stopOpacity="0.8" />
        <stop offset="50%" stopColor="#4ea4c7" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#4ea4c7" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Outer Hexagonal Shield Baseline / Protection Geometry */}
    <path
      d="M24 3L42 12V26C42 35 34 42 24 45C14 42 6 35 6 26V12L24 3Z"
      fill="url(#dh-crest-shadow)"
      stroke="url(#dh-crest-glacier)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />

    {/* Background High Himalayan Peak (Nanda Devi profile) */}
    <path
      d="M24 10L35 28H13L24 10Z"
      fill="#132433"
      stroke="#2e526d"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />

    {/* Left Ridge Shadow Facet */}
    <path
      d="M24 10L13 28H24V10Z"
      fill="#0c1722"
      opacity="0.85"
    />

    {/* Midground Ridge lines defining the Watchful "Eye" (Drishti) */}
    {/* Upper Eye Arc: Flowing mountain ridge */}
    <path
      d="M10 26C15 19 33 19 38 26"
      stroke="url(#dh-crest-glacier)"
      strokeWidth="2"
      strokeLinecap="round"
    />

    {/* Lower Eye Arc: Valley contour curvature */}
    <path
      d="M11 26C16 32 32 32 37 26"
      stroke="#4ea4c7"
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity="0.9"
    />

    {/* Vision Aperture Core Glow */}
    <circle cx="24" cy="25.5" r="5" fill="url(#dh-eye-glow)" />

    {/* Central Pupil / Summit Intelligence Beacon */}
    <circle
      cx="24"
      cy="25.5"
      r="2.8"
      fill="#ffffff"
      stroke="#8ee0f7"
      strokeWidth="1.2"
    />

    {/* Precision Geodetic Crosshair Reticle (Horizontal & Vertical Subtlety) */}
    <line x1="18" y1="25.5" x2="20.5" y2="25.5" stroke="#8ee0f7" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
    <line x1="27.5" y1="25.5" x2="30" y2="25.5" stroke="#8ee0f7" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
    <line x1="24" y1="19.5" x2="24" y2="22" stroke="#8ee0f7" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
    <line x1="24" y1="29" x2="24" y2="31.5" stroke="#8ee0f7" strokeWidth="1" strokeLinecap="round" opacity="0.8" />

    {/* Foothill Terraces / Drainage Contours at Bottom */}
    <path
      d="M14 36C18 34 30 34 34 36"
      stroke="#27465e"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  size = 'md',
  showSubtitle = true,
  className,
  ...props
}) => {
  const pixelSizeMap: Record<LogoSize, number> = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 52,
  };

  const markSize = pixelSizeMap[size];

  return (
    <div
      className={clsx(
        'dh-logo',
        `dh-logo--${variant}`,
        `dh-logo--${size}`,
        className
      )}
      role="img"
      aria-label="Drishti Himalaya — Road Hazard Decision Support"
      {...props}
    >
      <div className="dh-logo__mark-wrap">
        <LogoMark sizePx={markSize} />
      </div>

      {variant !== 'icon' && (
        <div className="dh-logo__text-group">
          {variant === 'compact' ? (
            <span className="dh-logo__wordmark-compact">DH</span>
          ) : (
            <>
              <div className="dh-logo__wordmark">
                <span className="dh-logo__brand-first">DRISHTI</span>
                <span className="dh-logo__brand-second">HIMALAYA</span>
              </div>
              {showSubtitle && (
                <span className="dh-logo__tagline">
                  HAZARD INTELLIGENCE
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
