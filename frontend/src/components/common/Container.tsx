import React, { forwardRef } from 'react';
import clsx from 'clsx';
import './Container.css';

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
  centered?: boolean;
  gutter?: boolean;
  children: React.ReactNode;
}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  (
    {
      size = 'lg',
      centered = true,
      gutter = true,
      children,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'dh-container',
          `dh-container--${size}`,
          {
            'dh-container--centered': centered,
            'dh-container--gutter': gutter,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = 'Container';
