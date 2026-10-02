import React from 'react';
import clsx from 'clsx';
import { Inbox } from 'lucide-react';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div className={clsx('dh-empty-state', className)}>
      <div className="dh-empty-state__icon-box" aria-hidden="true">
        {icon || <Inbox size={28} />}
      </div>
      <h4 className="dh-empty-state__title">{title}</h4>
      {description && <p className="dh-empty-state__description">{description}</p>}
      {action && <div className="dh-empty-state__action">{action}</div>}
    </div>
  );
};
