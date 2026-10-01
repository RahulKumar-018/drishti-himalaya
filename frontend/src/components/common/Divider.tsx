import React, { forwardRef } from 'react';
import clsx from 'clsx';
import './Divider.css';

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerVariant = 'subtle' | 'default' | 'strong';

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: DividerOrientation;
  variant?: DividerVariant;
  label?: React.ReactNode;
}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  (
    {
      orientation = 'horizontal',
      variant = 'subtle',
      label,
      className,
      ...props
    },
    ref
  ) => {
    const hasLabel = Boolean(label) && orientation === 'horizontal';

    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={clsx(
          'dh-divider',
          `dh-divider--${orientation}`,
          `dh-divider--${variant}`,
          {
            'dh-divider--with-label': hasLabel,
          },
          className
        )}
        {...props}
      >
        {hasLabel && <span className="dh-divider__label">{label}</span>}
      </div>
    );
  }
);

Divider.displayName = 'Divider';
