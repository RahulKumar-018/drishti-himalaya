import React from 'react';
import clsx from 'clsx';
import './Badge.css';

export type BadgeVariant = 'default' | 'accent' | 'low' | 'moderate' | 'high' | 'severe';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  showDot?: boolean;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  showDot = false,
  children,
  className,
  ...props
}) => {
  return (
    <span
      className={clsx('dh-badge', `dh-badge--${variant}`, `dh-badge--${size}`, className)}
      {...props}
    >
      {showDot && <span className="dh-badge__dot" aria-hidden="true" />}
      <span className="dh-badge__label">{children}</span>
    </span>
  );
};
