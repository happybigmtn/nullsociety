import React from 'react';

type GameControlBarProps = {
  children: React.ReactNode;
  className?: string;
  variant?: 'row' | 'stack';
  ariaLabel?: string;
};

export const GameControlBar: React.FC<GameControlBarProps> = ({
  children,
  className = '',
  variant = 'row',
  ariaLabel = 'Game controls',
}) => {
  const base =
    'ns-controlbar absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] left-0 right-0 bg-terminal-black/90 border-t-2 border-gray-700 z-40';
  const layout =
    variant === 'stack'
      ? 'p-2'
      : 'h-16 flex items-center justify-start md:justify-center gap-2 p-2 overflow-x-auto';

  return (
    <div role="group" aria-label={ariaLabel} className={[base, layout, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
};

