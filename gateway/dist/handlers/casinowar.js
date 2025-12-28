/**
 * Casino War game handler
 */
import { GameHandler } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';
export class CasinoWarHandler extends GameHandler {
    constructor() {
        super(GameType.CasinoWar);
    }
    async handleMessage(ctx, msg) {
        const msgType = msg.type;
        switch (msgType) {
            case 'casinowar_deal':
            case 'casino_war_deal':
                return this.handleDeal(ctx, msg);
            case 'casinowar_war':
            case 'casino_war_war':
                return this.handleWar(ctx);
            case 'casinowar_surrender':
            case 'casino_war_surrender':
                return this.handleSurrender(ctx);
            default:
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown casinowar message: ${msgType}`),
                };
        }
    }
    async handleDeal(ctx, msg) {
        const amount = msg.amount;
        if (typeof amount !== 'number' || amount <= 0) {
            return {
                success: false,
                error: createError(ErrorCodes.INVALID_BET, 'Invalid bet amount'),
            };
        }
        const gameSessionId = generateSessionId(ctx.session.publicKey, ctx.session.gameSessionCounter++);
        return this.startGame(ctx, BigInt(amount), gameSessionId);
    }
    async handleWar(ctx) {
        // Go to war action
        const payload = new Uint8Array([1]);
        return this.makeMove(ctx, payload);
    }
    async handleSurrender(ctx) {
        // Surrender action (Move::Surrender = 2 in casino_war.rs)
        const payload = new Uint8Array([2]);
        return this.makeMove(ctx, payload);
    }
}
//# sourceMappingURL=casinowar.js.map