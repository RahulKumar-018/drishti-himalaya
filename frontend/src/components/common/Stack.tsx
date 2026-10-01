import React, { forwardRef } from 'react';
import clsx from 'clsx';
import './Stack.css';

export type StackDirection = 'row' | 'column';
export type StackGap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: boolean;
  inline?: boolean;
  children: React.ReactNode;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'column',
      gap = 'md',
      align,
      justify,
      wrap = false,
      inline = false,
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
          'dh-stack',
          `dh-stack--${direction}`,
          `dh-stack--gap-${gap}`,
          align && `dh-stack--align-${align}`,
          justify && `dh-stack--justify-${justify}`,
          {
            'dh-stack--wrap': wrap,
            'dh-stack--inline': inline,
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

Stack.displayName = 'Stack';
