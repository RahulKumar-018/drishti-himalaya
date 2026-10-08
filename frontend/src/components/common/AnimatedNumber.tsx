import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

export interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ 
  value, 
  decimals = 0, 
  duration = 500,
  className
}) => {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, {
    bounce: 0,
    duration: duration,
  });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  const displayValue = useTransform(springValue, (current) => current.toFixed(decimals));

  return (
    <motion.span className={className}>
      {displayValue}
    </motion.span>
  );
};
