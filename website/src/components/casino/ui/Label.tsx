import React from 'react';

interface LabelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'destructive' | 'gold';
  size?: 'micro' | 'normal';
}

export const Label: React.FC<LabelProps> = ({ 
  children, 
  className = '', 
  variant = 'primary',
  size = 'normal'
}) => {
  const variantClasses = {
    primary: 'text-titanium-500 dark:text-titanium-300', // Improved contrast (WCAG AA)
    secondary: 'text-titanium-400 dark:text-titanium-400',
    success: 'text-action-success',
    destructive: 'text-action-destructive',
    gold: 'text-action-primary',
  };

  const sizeClasses = {
    micro: 'text-micro uppercase',
    normal: 'text-label uppercase',
  };

  return (
    <span className={`${sizeClasses[size]} font-bold tracking-[0.15em] ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
};
