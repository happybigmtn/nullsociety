import React from 'react';

interface LabelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'destructive' | 'gold';
}

export const Label: React.FC<LabelProps> = ({ 
  children, 
  className = '', 
  variant = 'primary' 
}) => {
  const variantClasses = {
    primary: 'text-titanium-400',
    secondary: 'text-titanium-300',
    success: 'text-action-success',
    destructive: 'text-action-destructive',
    gold: 'text-action-primary',
  };

  return (
    <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
};
