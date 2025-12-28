/**
 * Three Card Poker game handler
 *
 * Multi-stage flow matching execution/src/casino/three_card.rs:
 * 1. CasinoStartGame → Betting stage
 * 2. Deal move (2) → Decision stage (player cards dealt)
 * 3. Play (0) or Fold (1) → AwaitingReveal or Complete
 * 4. Reveal move (4) → Complete
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
export declare class ThreeCardPokerHandler extends GameHandler {
    constructor();
    handleMessage(ctx: HandlerContext, msg: Record<string, unknown>): Promise<HandleResult>;
    private handleDeal;
    private handlePlay;
    private handleFold;
}
//# sourceMappingURL=threecardpoker.d.ts.map