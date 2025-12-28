import React, { useState } from 'react';
import { Menu, X, ChevronUp } from 'lucide-react';

interface Action {
    type?: 'button' | 'divider';
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    active?: boolean;
    className?: string;
}

interface GameControlBarProps {
    children?: React.ReactNode;
    primaryAction?: Action;
    secondaryActions?: Action[];
    className?: string;
    variant?: 'row' | 'stack'; // kept for interface compatibility
    ariaLabel?: string;
    mobileMenuLabel?: string;
    balance?: string; // New prop for displaying balance
}

export const GameControlBar: React.FC<GameControlBarProps> = ({
    children,
    primaryAction,
    secondaryActions = [],
    className = '',
    ariaLabel = 'Game controls',
    mobileMenuLabel = 'BETS',
    balance = '$1,000.00', // Default placeholder
}) => {
    const [menuOpen, setMenuOpen] = useState(false);

    // If no primary/secondary actions are passed, render children in the new island container
    if (!primaryAction && secondaryActions.length === 0 && children) {
        return (
             <div className="fixed bottom-6 left-4 right-4 h-16 bg-glass-dark backdrop-blur-xl rounded-full border border-glass-border shadow-float flex items-center justify-between px-4 z-50">
                {children}
            </div>
        );
    }

    return (
        <>
            {/* Main Floating Island */}
            <div 
                role="group" 
                aria-label={ariaLabel}
                className={`fixed bottom-6 left-4 right-4 h-16 bg-black/80 backdrop-blur-xl rounded-full border border-white/10 shadow-float flex items-center justify-between px-2 z-50 transition-all duration-300 ${className}`}
            >
                {/* Left: Balance Info */}
                <div className="flex flex-col pl-4">
                    <span className="text-[10px] text-gray-400 tracking-widest font-medium">BALANCE</span>
                    <span className="text-white font-medium text-sm tabular-nums tracking-wide">{balance}</span>
                </div>

                {/* Center: Primary Action (Floating FAB) */}
                {primaryAction && (
                    <button
                        type="button"
                        onClick={primaryAction.onClick}
                        disabled={primaryAction.disabled}
                        className={`absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full shadow-lg flex items-center justify-center text-white font-bold tracking-widest text-sm transition-all duration-200 
                        ${primaryAction.disabled 
                            ? 'bg-gray-700 cursor-not-allowed grayscale' 
                            : 'bg-action-primary hover:scale-105 active:scale-95 hover:shadow-xl'
                        } ${primaryAction.className || ''}`}
                    >
                        {primaryAction.label}
                    </button>
                )}

                {/* Right: Menu Toggle */}
                <button 
                    onClick={() => setMenuOpen(true)}
                    className="p-3 rounded-full hover:bg-white/10 active:scale-95 transition-colors"
                >
                    <Menu className="text-white w-6 h-6" />
                </button>
            </div>

            {/* Bottom Sheet / Menu Overlay */}
            <div 
                className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
                    menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={() => setMenuOpen(false)}
            >
                <div 
                    className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-3xl p-6 pb-10 transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1) ${
                        menuOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Sheet Handle */}
                    <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-6" />

                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{mobileMenuLabel}</h3>
                        <button onClick={() => setMenuOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        </button>
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                         {children && <div className="col-span-2 mb-4">{children}</div>}

                        {secondaryActions.map((action, i) => 
                            action.type === 'divider' ? (
                                <div key={i} className="col-span-2 text-gray-400 text-xs font-medium tracking-widest text-center py-2 uppercase">
                                    {action.label}
                                </div>
                            ) : (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        action.onClick?.();
                                        // Optional: Close menu on action?
                                        // setMenuOpen(false); 
                                    }}
                                    disabled={action.disabled}
                                    className={`h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                                        action.active
                                            ? 'bg-action-primary text-white shadow-lg shadow-blue-500/20'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    } ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span className="font-semibold text-sm">{action.label}</span>
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};