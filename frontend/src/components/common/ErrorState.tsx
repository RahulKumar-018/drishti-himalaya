import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import './ErrorState.css';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Service Unavailable',
  message = 'Failed to load telemetry data. Please check connection and try again.',
  onRetry,
  isRetrying = false,
  className,
}) => {
  return (
    <div className={clsx('dh-error-state', className)} role="alert">
      <div className="dh-error-state__icon-box" aria-hidden="true">
        <AlertTriangle size={24} />
      </div>
      <h4 className="dh-error-state__title">{title}</h4>
      <p className="dh-error-state__message">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={isRetrying}
          leadingIcon={<RefreshCw size={12} />}
          className="dh-error-state__retry-btn"
        >
          {isRetrying ? 'Retrying...' : 'Retry Connection'}
        </Button>
      )}
    </div>
  );
};
