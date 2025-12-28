/**
 * Baccarat game handler
 */
import { GameHandler } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';
export class BaccaratHandler extends GameHandler {
    constructor() {
        super(GameType.Baccarat);
    }
    async handleMessage(ctx, msg) {
        const msgType = msg.type;
        switch (msgType) {
            case 'baccarat_deal':
                return this.handleDeal(ctx, msg);
            default:
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown baccarat message: ${msgType}`),
                };
        }
    }
    async handleDeal(ctx, msg) {
        // Support both formats:
        // 1. Mobile format: { bets: { PLAYER: 25, BANKER: 0, TIE: 0 } }
        // 2. Legacy format: { amount: 25, betType: 'player' }
        let totalBet = 0;
        const bets = msg.bets;
        if (bets && typeof bets === 'object') {
            // Mobile format with multiple bets
            const playerBet = bets.PLAYER ?? 0;
            const bankerBet = bets.BANKER ?? 0;
            const tieBet = bets.TIE ?? 0;
            totalBet = playerBet + bankerBet + tieBet;
            if (totalBet <= 0) {
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_BET, 'No bets placed'),
                };
            }
        }
        else {
            // Legacy format with single bet
            const amount = msg.amount;
            const betType = msg.betType;
            if (typeof amount !== 'number' || amount <= 0) {
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_BET, 'Invalid bet amount'),
                };
            }
            if (!betType || !['player', 'banker', 'tie'].includes(betType)) {
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_BET, 'Invalid bet type (must be player, banker, or tie)'),
                };
            }
            totalBet = amount;
        }
        const gameSessionId = generateSessionId(ctx.session.publicKey, ctx.session.gameSessionCounter++);
        return this.startGame(ctx, BigInt(totalBet), gameSessionId);
    }
}
//# sourceMappingURL=baccarat.js.map