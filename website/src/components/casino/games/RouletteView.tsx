import React, { useMemo, useCallback } from 'react';
import { GameState, RouletteBet } from '../../../types';
import { getRouletteColor, calculateRouletteExposure, formatRouletteNumber } from '../../../utils/gameUtils';
import { MobileDrawer } from '../MobileDrawer';
import { Pseudo3DWheel } from '../pseudo3d/Pseudo3DWheel';
import { Label } from '../ui/Label';

export const RouletteView = React.memo<{
    gameState: GameState;
    numberInput?: string;
    actions: any;
    lastWin?: number;
    playMode?: 'CASH' | 'FREEROLL' | null;
}>(({ gameState, numberInput = "", actions, lastWin, playMode }) => {
    const lastNum = useMemo(() =>
        gameState.rouletteHistory.length > 0 ? gameState.rouletteHistory[gameState.rouletteHistory.length - 1] : null,
        [gameState.rouletteHistory]
    );
    const isSpinning = gameState.message === 'SPINNING ON CHAIN...';
    const totalBet = useMemo(() => gameState.rouletteBets.reduce((acc, b) => acc + b.amount, 0), [gameState.rouletteBets]);

    const renderExposureRow = useCallback((num: number) => {
        const pnl = calculateRouletteExposure(num, gameState.rouletteBets);
        const maxScale = Math.max(100, totalBet * 36); 
        const barPercent = Math.min(Math.abs(pnl) / maxScale * 50, 50);
        const color = getRouletteColor(num);
        const colorClass = color === 'RED' ? 'text-action-destructive' : color === 'BLACK' ? 'text-titanium-900' : 'text-action-success';

        return (
            <div key={num} className="flex items-center h-6 text-xs px-2">
                <div className="flex-1 flex justify-end items-center pr-2 gap-1">
                    {pnl < 0 && <span className="text-[9px] font-bold text-titanium-400 tabular-nums">{Math.abs(pnl)}</span>}
                    {pnl < 0 && (
                        <div className="bg-action-destructive/40 h-2 rounded-full" style={{ width: `${barPercent}%` }} />
                    )}
                </div>
                <div className={`w-6 text-center font-black ${colorClass} tabular-nums`}>{formatRouletteNumber(num)}</div>
                <div className="flex-1 flex justify-start items-center pl-2 gap-1">
                    {pnl > 0 && (
                        <div className="bg-action-success/40 h-2 rounded-full" style={{ width: `${barPercent}%` }} />
                    )}
                    {pnl > 0 && <span className="text-[9px] font-bold text-titanium-400 tabular-nums">{pnl}</span>}
                </div>
            </div>
        );
    }, [gameState.rouletteBets, totalBet]);

    return (
        <div className="flex-1 w-full flex flex-col items-center justify-start sm:justify-center gap-8 relative py-8 animate-scale-in">
            {/* Main Wheel Area */}
            <div className="w-full flex-1 flex flex-col items-center justify-center gap-12">
                 <div className="relative group">
                    <Pseudo3DWheel 
                        lastNumber={lastNum} 
                        isSpinning={isSpinning}
                        style={{ width: 300, height: 320 }}
                    />
                    {/* Floating current number display */}
                    {!isSpinning && lastNum !== null && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full w-16 h-16 flex items-center justify-center shadow-float border border-titanium-100 animate-scale-in">
                            <span className={`text-2xl font-black ${getRouletteColor(lastNum) === 'RED' ? 'text-action-destructive' : getRouletteColor(lastNum) === 'BLACK' ? 'text-titanium-900' : 'text-action-success'}`}>
                                {formatRouletteNumber(lastNum)}
                            </span>
                        </div>
                    )}
                 </div>
                 
                 <div className="flex flex-col items-center gap-4">
                    <div className="text-center">
                        <Label variant={isSpinning ? 'gold' : 'primary'}>{isSpinning ? 'Wheel spinning...' : 'Ready to play'}</Label>
                        <h2 className="text-2xl font-bold text-titanium-900 tracking-tight mt-1">{gameState.message || 'Place your bets'}</h2>
                    </div>

                    {/* Compact History */}
                    {gameState.rouletteHistory.length > 0 && (
                        <div className="flex gap-1.5 p-1.5 bg-titanium-100 rounded-full border border-titanium-200">
                            {gameState.rouletteHistory.slice(-6).reverse().map((num, i) => (
                                <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border transition-all ${
                                    getRouletteColor(num) === 'RED' ? 'bg-white border-action-destructive text-action-destructive' : 
                                    getRouletteColor(num) === 'BLACK' ? 'bg-white border-titanium-900 text-titanium-900' : 
                                    'bg-white border-action-success text-action-success'
                                } shadow-soft`}>
                                    {formatRouletteNumber(num)}
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
            </div>

            {/* Desktop Sidebars - Themed Light */}
            <div className="hidden xl:flex absolute top-8 left-4 bottom-24 w-56 bg-white/60 backdrop-blur-md rounded-[32px] border border-titanium-200 p-4 flex-col shadow-soft">
                <Label className="mb-4 text-center">Exposure</Label>
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {Array.from({ length: 37 }, (_, i) => i).map(num => renderExposureRow(num))}
                </div>
            </div>

            <div className="hidden xl:flex absolute top-8 right-4 bottom-24 w-56 bg-white/60 backdrop-blur-md rounded-[32px] border border-titanium-200 p-4 flex-col shadow-soft">
                <Label className="mb-4 text-center">Active Bets</Label>
                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2">
                    {gameState.rouletteBets.length === 0 ? (
                        <div className="text-center py-12">
                            <Label variant="secondary">No bets placed</Label>
                        </div>
                    ) : (
                        gameState.rouletteBets.map((b, i) => (
                            <div key={i} className={`flex justify-between items-center p-3 rounded-2xl border transition-all ${b.local ? 'bg-titanium-50 border-dashed border-titanium-300' : 'bg-white border-titanium-100 shadow-soft'}`}>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-titanium-900 uppercase tracking-tight">{b.type} {b.target ?? ''}</span>
                                    <span className="text-[9px] font-bold text-titanium-400 uppercase">{b.local ? 'Pending' : 'Confirmed'}</span>
                                </div>
                                <span className="text-xs font-bold text-action-success">${b.amount}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
});
