/**
 * Roulette game handler
 *
 * Uses atomic batch (action 4) for placing bets and spinning in one transaction.
 *
 * Payload format from execution/src/casino/roulette.rs:
 * [4, bet_count, bets...] - Atomic batch: place all bets + spin in one transaction
 * Each bet is 10 bytes: [bet_type:u8, number:u8, amount:u64 BE]
 */
import { GameHandler } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';
/** Roulette action codes matching execution/src/casino/roulette.rs */
const RouletteAction = {
    PlaceBet: 0,
    Spin: 1,
    ClearBets: 2,
    AtomicBatch: 4,
};
export class RouletteHandler extends GameHandler {
    constructor() {
        super(GameType.Roulette);
    }
    async handleMessage(ctx, msg) {
        const msgType = msg.type;
        switch (msgType) {
            case 'roulette_spin':
                return this.handleSpin(ctx, msg);
            default:
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown roulette message: ${msgType}`),
                };
        }
    }
    async handleSpin(ctx, msg) {
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
            if (typeof bet.type !== 'number' || typeof bet.value !== 'number' || typeof bet.amount !== 'number') {
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
        // Build atomic batch payload: [4, bet_count, bets...]
        // Each bet is 10 bytes: [bet_type:u8, number:u8, amount:u64 BE]
        const payload = new Uint8Array(2 + bets.length * 10);
        const view = new DataView(payload.buffer);
        payload[0] = RouletteAction.AtomicBatch;
        payload[1] = bets.length;
        let offset = 2;
        for (const bet of bets) {
            payload[offset] = bet.type;
            payload[offset + 1] = bet.value;
            view.setBigUint64(offset + 2, BigInt(bet.amount), false); // BE
            offset += 10;
        }
        return this.makeMove(ctx, payload);
    }
}
//# sourceMappingURL=roulette.js.map