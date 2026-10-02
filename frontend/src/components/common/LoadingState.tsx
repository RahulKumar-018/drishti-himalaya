import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import './LoadingState.css';

export interface LoadingStateProps {
  title?: string;
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'Loading Telemetry',
  message = 'Fetching real-time geospatial and weather streams...',
  size = 'md',
  className,
}) => {
  return (
    <div
      className={clsx('dh-loading-state', `dh-loading-state--${size}`, className)}
      role="status"
      aria-live="polite"
    >
      <div className="dh-loading-state__spinner-wrapper">
        <Loader2 className="dh-loading-state__spinner" />
      </div>
      <div className="dh-loading-state__content">
        <h4 className="dh-loading-state__title">{title}</h4>
        {message && <p className="dh-loading-state__message">{message}</p>}
      </div>
    </div>
  );
};
