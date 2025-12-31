/**
 * Casino War game handler
 *
 * Uses shared CasinoWarMove constants to align with execution enum values.
 */
import { GameHandler } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';
import { CasinoWarMove as SharedCasinoWarMove } from '@nullspace/constants';
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
        const tieBet = typeof msg.tieBet === 'number'
            ? msg.tieBet
            : typeof msg.tieBetAmount === 'number'
                ? msg.tieBetAmount
                : 0;
        if (typeof amount !== 'number' || amount <= 0) {
            return {
                success: false,
                error: createError(ErrorCodes.INVALID_BET, 'Invalid bet amount'),
            };
        }
        if (typeof tieBet !== 'number' || tieBet < 0) {
            return {
                success: false,
                error: createError(ErrorCodes.INVALID_BET, 'Invalid tie bet amount'),
            };
        }
        const gameSessionId = generateSessionId(ctx.session.publicKey, ctx.session.gameSessionCounter++);
        const startResult = await this.startGame(ctx, BigInt(amount), gameSessionId);
        if (!startResult.success) {
            return startResult;
        }
        // Deal immediately (atomic deal if tie bet is set)
        let dealPayload = new Uint8Array([SharedCasinoWarMove.Play]);
        if (tieBet > 0) {
            dealPayload = new Uint8Array(9);
            dealPayload[0] = 4; // atomic deal opcode for tie bet
            new DataView(dealPayload.buffer).setBigUint64(1, BigInt(tieBet), false);
        }
        const dealResult = await this.makeMove(ctx, dealPayload);
        if (!dealResult.success) {
            return dealResult;
        }
        return {
            success: true,
            response: {
                ...(dealResult.response || {}),
                type: 'game_started',
                gameType: GameType.CasinoWar,
                sessionId: ctx.session.activeGameId?.toString(),
                bet: amount.toString(),
            },
        };
    }
    async handleWar(ctx) {
        // Go to war action
        const payload = new Uint8Array([SharedCasinoWarMove.War]);
        return this.makeMove(ctx, payload);
    }
    async handleSurrender(ctx) {
        const payload = new Uint8Array([SharedCasinoWarMove.Surrender]);
        return this.makeMove(ctx, payload);
    }
}
//# sourceMappingURL=casinowar.js.map