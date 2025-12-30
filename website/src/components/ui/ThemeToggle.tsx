import React from 'react';
import { useTheme } from '../../hooks/useTheme';

type ThemeToggleProps = {
  className?: string;
  variant?: 'pill' | 'menu';
};

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className, variant = 'pill' }) => {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark' ? 'Dark' : 'Light';

  if (variant === 'menu') {
    const badgeClass =
      theme === 'dark'
        ? 'bg-action-primary/15 text-action-primary'
        : 'bg-titanium-100 text-titanium-800 dark:bg-titanium-800 dark:text-titanium-100';
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={['flex justify-between items-center group', className ?? ''].join(' ').trim()}
        aria-label={`Switch to ${nextTheme} mode`}
        aria-pressed={theme === 'dark'}
      >
        <span className="text-sm font-semibold text-titanium-800 dark:text-titanium-100">Theme</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === 'dark'}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors shadow-soft',
        'border-titanium-200 bg-white text-titanium-800 hover:border-titanium-400',
        'dark:border-titanium-800 dark:bg-titanium-900/70 dark:text-titanium-200 dark:hover:border-titanium-600',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span className="text-titanium-400 dark:text-titanium-400">Theme</span>
      <span className="text-titanium-900 dark:text-titanium-100">{label}</span>
    </button>
  );
};
