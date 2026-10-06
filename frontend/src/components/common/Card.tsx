import React from 'react';
import clsx from 'clsx';
import { motion, HTMLMotionProps } from 'motion/react';
import './Card.css';

export type CardVariant = 'default' | 'elevated' | 'muted';

export interface CardProps extends Omit<HTMLMotionProps<"div">, 'title'> {
  variant?: CardVariant;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  title,
  subtitle,
  headerAction,
  children,
  className,
  ...props
}) => {
  const hasHeader = Boolean(title || subtitle || headerAction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={clsx('dh-card', `dh-card--${variant}`, className)}
      {...props}
    >
      {hasHeader && (
        <div className="dh-card__header">
          <div className="dh-card__header-text">
            {title && <h3 className="dh-card__title">{title}</h3>}
            {subtitle && <p className="dh-card__subtitle">{subtitle}</p>}
          </div>
          {headerAction && <div className="dh-card__header-action">{headerAction}</div>}
        </div>
      )}
      <div className="dh-card__content">{children}</div>
    </motion.div>
  );
};
