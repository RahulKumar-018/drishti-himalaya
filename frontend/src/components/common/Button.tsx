import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
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
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        className={clsx(
          'dh-button',
          `dh-button--${variant}`,
          `dh-button--${size}`,
          {
            'dh-button--loading': loading,
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="dh-button__icon-slot" aria-hidden="true">
            <Loader2 className="dh-button__spinner" />
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
      </button>
    );
  }
);

Button.displayName = 'Button';
