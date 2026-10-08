import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: React.ReactNode;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      leadingIcon,
      trailingIcon,
      disabled = false,
      type = 'button',
      children,
      className,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        whileHover={!isDisabled ? { y: -1, scale: 1.01 } : undefined}
        whileTap={!isDisabled ? { scale: 0.98 } : undefined}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={clsx(
          'dh-button',
          `dh-button--${variant}`,
          `dh-button--${size}`,
          {
            'dh-button--loading': loading,
          },
          className
        )}
        {...(props as any)}
      >
        {loading ? (
          <span className="dh-button__icon-slot" aria-hidden="true">
            <Loader2 className="dh-button__spinner dh-button__spinner-animated" />
          </span>
        ) : leadingIcon ? (
          <span className="dh-button__icon-slot" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}

        <span className="dh-button__label">
          {loading && loadingText ? loadingText : children}
        </span>

        {!loading && trailingIcon && (
          <span className="dh-button__icon-slot" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
