/**
 * Sic Bo game handler
 *
 * Uses atomic batch (action 3) for placing bets and rolling in one transaction.
 *
 * Payload format from execution/src/casino/sic_bo.rs:
 * [3, bet_count, bets...] - Atomic batch: place all bets + roll in one transaction
 * Each bet is 10 bytes: [bet_type:u8, number:u8, amount:u64 BE]
 */
import { GameHandler } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';
/** Sic Bo action codes matching execution/src/casino/sic_bo.rs */
const SicBoAction = {
    PlaceBet: 0,
    Roll: 1,
    ClearBets: 2,
    AtomicBatch: 3,
    SetRules: 4,
};
export class SicBoHandler extends GameHandler {
    constructor() {
        super(GameType.SicBo);
    }
    async handleMessage(ctx, msg) {
        const msgType = msg.type;
        switch (msgType) {
            case 'sicbo_roll':
            case 'sic_bo_roll':
                return this.handleRoll(ctx, msg);
            default:
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown sicbo message: ${msgType}`),
                };
        }
    }
    async handleRoll(ctx, msg) {
        const bets = msg.bets;
        if (!bets || !Array.isArray(bets) || bets.length === 0) {
            return {
                success: false,
                error: createError(ErrorCodes.INVALID_BET, 'No bets provided'),
            };
        }
        // Validate bets and calculate total
        let totalBet = 0n;
        for (const bet of bets) {
            if (typeof bet.type !== 'number' || typeof bet.amount !== 'number') {
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_BET, 'Invalid bet format'),
                };
            }
            if (bet.amount <= 0) {
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_BET, 'Bet amount must be positive'),
                };
            }
            totalBet += BigInt(bet.amount);
        }
        const gameSessionId = generateSessionId(ctx.session.publicKey, ctx.session.gameSessionCounter++);
        // Start game with total bet
        const startResult = await this.startGame(ctx, totalBet, gameSessionId);
        if (!startResult.success) {
            return startResult;
        }
        // Build atomic batch payload: [3, bet_count, bets...]
        // Each bet is 10 bytes: [bet_type:u8, number:u8, amount:u64 BE]
        const payload = new Uint8Array(2 + bets.length * 10);
        const view = new DataView(payload.buffer);
        payload[0] = SicBoAction.AtomicBatch;
        payload[1] = bets.length;
        let offset = 2;
        for (const bet of bets) {
            payload[offset] = bet.type;
            payload[offset + 1] = bet.number ?? 0; // number is 0 for simple bets like Small/Big
            view.setBigUint64(offset + 2, BigInt(bet.amount), false); // BE
            offset += 10;
        }
        return this.makeMove(ctx, payload);
    }
}
//# sourceMappingURL=sicbo.js.map