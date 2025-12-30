import React, { useState } from 'react';
import { Grid, X, ChevronUp, Layers } from 'lucide-react';
import { Label } from './ui/Label';

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
    variant?: 'row' | 'stack';
    ariaLabel?: string;
    mobileMenuLabel?: string;
    balance?: string;
}

export const GameControlBar: React.FC<GameControlBarProps> = ({
    children,
    primaryAction,
    secondaryActions = [],
    className = '',
    ariaLabel = 'Game controls',
    mobileMenuLabel = 'BETTING',
    balance = '$1,000.00',
}) => {
    const [menuOpen, setMenuOpen] = useState(false);

    const baseContainer = "fixed bottom-8 left-1/2 -translate-x-1/2 h-16 bg-white/80 backdrop-blur-2xl rounded-full border border-titanium-200 shadow-float flex items-center justify-between px-2 z-50 min-w-[320px] max-w-[95vw] transition-all motion-state animate-scale-in";

    if (!primaryAction && secondaryActions.length === 0 && children) {
        return (
             <div className={baseContainer}>
                {children}
            </div>
        );
    }

    return (
        <>
            {/* Main Floating Island */}
            <div role="group" aria-label={ariaLabel} className={`${baseContainer} ${className}`}>
                {/* Left: Balance Info */}
                <div className="flex flex-col pl-6 pr-4 border-r border-titanium-100">
                    <Label className="mb-0.5">Balance</Label>
                    <span className="text-titanium-900 font-bold text-sm tabular-nums tracking-tight">{balance}</span>
                </div>

                {/* Center: Primary Action (Elevated FAB) */}
                {primaryAction && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                        <button
                            type="button"
                            onClick={primaryAction.onClick}
                            disabled={primaryAction.disabled}
                            className={`w-20 h-20 rounded-full shadow-float flex items-center justify-center text-white font-bold tracking-[0.1em] text-xs transition-all motion-interaction transform
                            ${primaryAction.disabled 
                                ? 'bg-titanium-200 text-titanium-400 cursor-not-allowed grayscale' 
                                : 'bg-titanium-900 hover:scale-110 active:scale-90 hover:shadow-2xl'
                            } ${primaryAction.className || ''}`}
                        >
                            {primaryAction.label}
                        </button>
                        {/* Shadow accent for FAB */}
                        {!primaryAction.disabled && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-4 bg-black/10 blur-xl rounded-full -z-10" />}
                    </div>
                )}

                {/* Right: Menu Toggle */}
                <div className="flex items-center gap-1 pr-2">
                    {children && <div className="hidden sm:flex">{children}</div>}
                    <button 
                        onClick={() => setMenuOpen(true)}
                        className="p-3 rounded-full hover:bg-titanium-100 active:scale-95 transition-all motion-interaction group"
                    >
                        <Grid className="text-titanium-400 group-hover:text-titanium-900 w-5 h-5" strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Bottom Sheet / Menu Overlay */}
            <div 
                className={`fixed inset-0 z-[60] bg-titanium-900/20 backdrop-blur-sm transition-opacity motion-state ${
                    menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={() => setMenuOpen(false)}
            >
                <div 
                    className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-[40px] p-8 pb-12 shadow-float border-t border-titanium-200 transition-transform motion-state ${
                        menuOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Sheet Handle */}
                    <div className="w-12 h-1 bg-titanium-200 rounded-full mx-auto mb-8" />

                    {/* Header */}
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex flex-col">
                            <Label>{mobileMenuLabel}</Label>
                            <h3 className="text-2xl font-bold text-titanium-900 tracking-tight mt-1">Actions</h3>
                        </div>
                        <button onClick={() => setMenuOpen(false)} className="w-10 h-10 bg-titanium-100 rounded-full flex items-center justify-center text-titanium-400 hover:text-titanium-900 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
                         {children && <div className="col-span-2 mb-2 p-4 bg-titanium-50 rounded-3xl border border-titanium-100">{children}</div>}

                        {secondaryActions.map((action, i) => 
                            action.type === 'divider' ? (
                                <div key={i} className="col-span-2 mt-4">
                                    <Label>{action.label}</Label>
                                    <div className="h-px bg-titanium-100 w-full mt-2" />
                                </div>
                            ) : (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        action.onClick?.();
                                    }}
                                    disabled={action.disabled}
                                    className={`h-16 rounded-[24px] flex flex-col items-center justify-center gap-1 transition-all motion-interaction shadow-soft border ${
                                        action.active
                                            ? 'bg-titanium-900 text-white border-titanium-900 shadow-lg'
                                            : 'bg-white text-titanium-800 border-titanium-200 hover:border-titanium-400'
                                    } ${action.disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
                                >
                                    <span className="font-bold text-sm tracking-tight">{action.label}</span>
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
