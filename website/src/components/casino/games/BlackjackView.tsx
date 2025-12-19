
import React, { useMemo } from 'react';
import { GameState } from '../../../types';
import { Hand } from '../GameComponents';
import { MobileDrawer } from '../MobileDrawer';
import { GameControlBar } from '../GameControlBar';
import { getVisibleHandValue } from '../../../utils/gameUtils';
import { cardIdToString } from '../../../utils/gameStateParser';

export const BlackjackView = React.memo<{ gameState: GameState; actions: any; lastWin?: number; playMode?: 'CASH' | 'FREEROLL' | null }>(({ gameState, actions, lastWin, playMode }) => {
    const dealerValue = useMemo(() => getVisibleHandValue(gameState.dealerCards), [gameState.dealerCards]);
    const playerValue = useMemo(() => getVisibleHandValue(gameState.playerCards), [gameState.playerCards]);
    const showInsurancePrompt = useMemo(() => {
        if (gameState.stage !== 'PLAYING') return false;
        const msg = (gameState.message ?? '').toString().toUpperCase();
        return msg.includes('INSURANCE');
    }, [gameState.message, gameState.stage]);

    const canHit = gameState.stage === 'PLAYING' && !showInsurancePrompt && playerValue < 21;
    const canStand = gameState.stage === 'PLAYING' && !showInsurancePrompt && gameState.playerCards.length > 0;
    const canDouble = gameState.stage === 'PLAYING' && !showInsurancePrompt && gameState.playerCards.length === 2;
    const canSplit =
        gameState.stage === 'PLAYING' &&
        !showInsurancePrompt &&
        gameState.playerCards.length === 2 &&
        gameState.playerCards[0]?.rank === gameState.playerCards[1]?.rank;

    const activeHandNumber = gameState.completedHands.length + 1;

    const formatCompletedTitle = (idx: number, h: any) => {
        const bet = typeof h?.bet === 'number' ? h.bet : 0;
        const res = typeof h?.result === 'number' ? h.result : null;
        const tag =
            h?.surrendered
                ? 'SURRENDER'
                : h?.message
                    ? String(h.message).toUpperCase()
                    : res === null
                        ? 'DONE'
                        : res > 0
                            ? `+${res}`
                            : res < 0
                                ? `-${Math.abs(res)}`
                                : 'PUSH';
        return `HAND ${idx + 1} · $${bet} · ${tag}`;
    };
    return (
        <>
            <div className="flex-1 w-full flex flex-col items-center justify-start sm:justify-center gap-4 sm:gap-6 md:gap-8 relative z-10 pt-8 sm:pt-10 pb-24 sm:pb-20">
                <h1 className="absolute top-0 text-xl font-bold text-gray-500 tracking-widest uppercase">BLACKJACK</h1>
                <div className="absolute top-2 left-2 z-40">
                    <MobileDrawer label="INFO" title="BLACKJACK">
                        <div className="space-y-3">
                            <div className="text-[11px] text-gray-300 leading-relaxed font-mono">
                                Get as close to 21 as possible without going over. Dealer stands on 17.
                            </div>
                            <div className="text-[10px] text-gray-600 leading-relaxed font-mono">
                                Controls: HIT (H), STAND (S), DOUBLE (D), SPLIT (P). Insurance is local-mode only.
                            </div>
                        </div>
                    </MobileDrawer>
                </div>
                {/* Dealer Area */}
                <div className="min-h-[96px] sm:min-h-[120px] flex items-center justify-center opacity-75">
                    {gameState.dealerCards.length > 0 ? (
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-sm font-bold tracking-widest text-white font-mono">DEALER <span className="text-white">({dealerValue})</span></span>
                            <Hand
                                cards={gameState.dealerCards}
                                forcedColor="text-terminal-accent"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                             <span className="text-sm font-bold tracking-widest text-white font-mono">DEALER</span>
                             <div className="w-12 h-[4.5rem] sm:w-14 sm:h-20 md:w-16 md:h-24 border-2 border-dashed border-terminal-accent rounded" />
                        </div>
                    )}
                </div>

                {/* Center Info */}
                <div className="text-center space-y-3 relative z-20">
                        <div className="text-lg sm:text-2xl font-bold text-terminal-gold tracking-widest leading-tight animate-pulse font-mono">
                            {gameState.message}
                        </div>
                </div>

                {/* Player Area - Highlighted */}
                <div className="min-h-[96px] sm:min-h-[120px] flex gap-8 items-center justify-center">
                    {/* Finished Split Hands */}
                    {gameState.completedHands.length > 0 && (
                            <div className="flex gap-2 opacity-50 scale-75 origin-right">
                            {gameState.completedHands.map((h, i) => (
                                <Hand
                                    key={i}
                                    cards={h.cards}
                                    title={formatCompletedTitle(i, h)}
                                    forcedColor={h?.result < 0 ? 'text-terminal-accent' : 'text-terminal-green'}
                                />
                            ))}
                            </div>
                    )}

                    <div className="flex flex-col items-center gap-2 scale-110 transition-transform">
                        <span className="text-sm font-bold tracking-widest text-white font-mono">
                            YOU <span className="text-white">({playerValue})</span>
                            {(gameState.completedHands.length > 0 || gameState.blackjackStack.length > 0) ? (
                                <span className="text-gray-500 text-xs"> · HAND {activeHandNumber}</span>
                            ) : null}
                        </span>
                        {gameState.playerCards.length > 0 ? (
                             <Hand
                                cards={gameState.playerCards}
                                forcedColor="text-terminal-green"
                            />
                        ) : (
                            <div className="w-12 h-[4.5rem] sm:w-14 sm:h-20 md:w-16 md:h-24 border-2 border-dashed border-terminal-green/50 rounded" />
                        )}
                    </div>

                    {/* Pending Split Hands */}
                    {gameState.blackjackStack.length > 0 && (
                            <div className="flex gap-1 sm:gap-1.5 md:gap-2 opacity-50 scale-75 origin-left">
                            {gameState.blackjackStack.map((h, i) => (
                                <div key={i} className="w-12 h-[4.5rem] sm:w-14 sm:h-20 md:w-16 md:h-24 bg-terminal-dim border-2 border-gray-700 rounded flex items-center justify-center">
                                    <span className="text-xs text-gray-500 font-mono">WAIT</span>
                                </div>
                            ))}
                            </div>
                    )}
                </div>

                {/* Super Mode Info */}
                {gameState.superMode?.isActive && (
                    <div className="w-full max-w-md mx-auto px-4">
                        <div className="bg-terminal-black/90 border-2 border-terminal-gold/50 p-2 rounded text-center">
                            <div className="text-[10px] font-bold text-terminal-gold tracking-widest mb-1 font-mono">⚡ SUPER MODE</div>
                            {Array.isArray(gameState.superMode.multipliers) && gameState.superMode.multipliers.length > 0 ? (
                                <div className="flex flex-wrap gap-1 justify-center">
                                    {gameState.superMode.multipliers.slice(0, 10).map((m, idx) => (
                                        <span
                                            key={idx}
                                            className="px-2 py-0.5 rounded border-2 border-terminal-gold/30 text-terminal-gold/90 text-[10px] font-mono"
                                        >
                                            {cardIdToString(m.id)} x{m.multiplier}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-[9px] text-gray-400 font-mono">Awaiting multipliers...</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* CONTROLS */}
            <div className="ns-controlbar fixed bottom-0 left-0 right-0 sm:sticky sm:bottom-0 bg-terminal-black/95 backdrop-blur border-t-2 border-gray-700 z-50 pb-[env(safe-area-inset-bottom)] sm:pb-0">
                <div className="h-16 sm:h-20 flex items-center justify-between sm:justify-center gap-2 p-2 sm:px-4">
                    {/* Secondary Actions - Main Actions */}
                    {(gameState.stage === 'BETTING' || gameState.stage === 'RESULT') ? (
                        <div className="flex items-center gap-2">
                            {/* Side Bets Group */}
                            {gameState.stage === 'BETTING' && (
                                <div className="hidden sm:flex items-center gap-2 border-r-2 border-gray-700 pr-3">
                                    <button
                                        type="button"
                                        onClick={actions?.bjToggle21Plus3}
                                        className={`h-12 px-4 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                            (gameState.blackjack21Plus3Bet || 0) > 0
                                                ? 'border-amber-400 bg-amber-400/20 text-amber-400'
                                                : 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                        }`}
                                    >
                                        21+3{(gameState.blackjack21Plus3Bet || 0) > 0 ? ` $${gameState.blackjack21Plus3Bet}` : ''}
                                    </button>
                                </div>
                            )}

                            {/* Modifiers Group */}
                            <div className="hidden sm:flex items-center gap-2">
                                {playMode !== 'CASH' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={actions?.toggleShield}
                                            className={`h-12 px-4 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                                gameState.activeModifiers.shield
                                                    ? 'border-terminal-green bg-terminal-green/20 text-terminal-green'
                                                    : 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                            }`}
                                        >
                                            SHIELD
                                        </button>
                                        <button
                                            type="button"
                                            onClick={actions?.toggleDouble}
                                            className={`h-12 px-4 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                                gameState.activeModifiers.double
                                                    ? 'border-terminal-green bg-terminal-green/20 text-terminal-green'
                                                    : 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                            }`}
                                        >
                                            DOUBLE
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={actions?.toggleSuper}
                                    className={`h-12 px-4 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                        gameState.activeModifiers.super
                                            ? 'border-terminal-gold bg-terminal-gold/20 text-terminal-gold'
                                            : 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                    }`}
                                >
                                    SUPER
                                </button>
                            </div>
                        </div>
                    ) : showInsurancePrompt ? (
                        <div className="hidden sm:flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => actions?.bjInsurance?.(false)}
                                className="h-12 px-6 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800"
                            >
                                NO
                            </button>
                        </div>
                    ) : (
                        <div className="hidden sm:flex items-center gap-2">
                            <button
                                type="button"
                                onClick={actions?.bjStand}
                                disabled={!canStand}
                                className={`h-12 px-6 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                    canStand
                                        ? 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                        : 'opacity-50 cursor-not-allowed border-gray-800 bg-gray-900/50 text-gray-700'
                                }`}
                            >
                                STAND
                            </button>
                            <button
                                type="button"
                                onClick={actions?.bjDouble}
                                disabled={!canDouble}
                                className={`h-12 px-6 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                    canDouble
                                        ? 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                        : 'opacity-50 cursor-not-allowed border-gray-800 bg-gray-900/50 text-gray-700'
                                }`}
                            >
                                DOUBLE
                            </button>
                            <button
                                type="button"
                                onClick={actions?.bjSplit}
                                disabled={!canSplit}
                                className={`h-12 px-6 rounded border-2 font-bold text-sm tracking-widest uppercase font-mono transition-all ${
                                    canSplit
                                        ? 'border-gray-700 bg-black/50 text-gray-300 hover:bg-gray-800'
                                        : 'opacity-50 cursor-not-allowed border-gray-800 bg-gray-900/50 text-gray-700'
                                }`}
                            >
                                SPLIT
                            </button>
                        </div>
                    )}

                    {/* Primary Action */}
                    <button
                        type="button"
                        onClick={
                            (gameState.stage === 'BETTING' || gameState.stage === 'RESULT')
                                ? actions?.deal
                                : showInsurancePrompt
                                    ? () => actions?.bjInsurance?.(true)
                                    : actions?.bjHit
                        }
                        disabled={gameState.stage === 'PLAYING' && !showInsurancePrompt && !canHit}
                        className={`h-12 sm:h-14 px-6 sm:px-8 rounded border-2 font-bold text-sm sm:text-base tracking-widest uppercase font-mono transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] ${
                            showInsurancePrompt
                                ? 'border-terminal-gold bg-terminal-gold text-black hover:bg-white hover:border-white'
                                : (gameState.stage === 'PLAYING' && !canHit)
                                    ? 'opacity-50 cursor-not-allowed border-gray-800 bg-gray-900/50 text-gray-700'
                                    : 'border-terminal-green bg-terminal-green text-black hover:bg-white hover:border-white hover:scale-105 active:scale-95'
                        }`}
                    >
                        {(gameState.stage === 'BETTING' || gameState.stage === 'RESULT')
                            ? 'DEAL'
                            : showInsurancePrompt
                                ? 'INSURE'
                                : 'HIT'
                        }
                    </button>
                </div>
            </div>
        </>
    );
});
