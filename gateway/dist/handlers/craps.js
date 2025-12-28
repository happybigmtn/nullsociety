/**
 * Craps game handler
 *
 * Uses atomic batch (action 4) for placing bets and rolling in one transaction.
 * This is more efficient than chaining separate bet + roll moves.
 *
 * Payload format from execution/src/casino/craps.rs:
 * [4, bet_count, bets...] - Atomic batch: place all bets + roll in one transaction
 * Each bet is 10 bytes: [bet_type:u8, target:u8, amount:u64 BE]
 */
import { GameHandler } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';
/** Craps action codes matching execution/src/casino/craps.rs */
const CrapsAction = {
    PlaceBet: 0,
    AddOdds: 1,
    Roll: 2,
    ClearBets: 3,
    AtomicBatch: 4,
};
export class CrapsHandler extends GameHandler {
    constructor() {
        super(GameType.Craps);
    }
    async handleMessage(ctx, msg) {
        const msgType = msg.type;
        switch (msgType) {
            case 'craps_bet':
                return this.handleBet(ctx, msg);
            case 'craps_roll':
                return this.handleRoll(ctx);
            default:
                return {
                    success: false,
                    error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown craps message: ${msgType}`),
                };
        }
    }
    async handleBet(ctx, msg) {
        const betType = msg.betType;
        const amount = msg.amount;
        const target = msg.target ?? 0;
        if (typeof betType !== 'number' || typeof amount !== 'number') {
            return {
                success: false,
                error: createError(ErrorCodes.INVALID_BET, 'Invalid bet format'),
            };
        }
        if (amount <= 0) {
            return {
                success: false,
                error: createError(ErrorCodes.INVALID_BET, 'Bet amount must be positive'),
            };
        }
        const gameSessionId = generateSessionId(ctx.session.publicKey, ctx.session.gameSessionCounter++);
        // Start game with bet=0 (Craps requires bet as first move, not at start)
        const startResult = await this.startGame(ctx, 0n, gameSessionId);
        if (!startResult.success) {
            return startResult;
        }
        // Use atomic batch: place bet + roll in one transaction
        // Format: [4, bet_count=1, bet_type, target, amount_u64_BE]
        const payload = new Uint8Array(12); // 1 + 1 + 10 bytes per bet
        const view = new DataView(payload.buffer);
        payload[0] = CrapsAction.AtomicBatch;
        payload[1] = 1; // bet_count
        payload[2] = betType;
        payload[3] = target;
        view.setBigUint64(4, BigInt(amount), false); // BE
        return this.makeMove(ctx, payload);
    }
    async handleRoll(ctx) {
        // Roll the dice (action 2)
        const payload = new Uint8Array([CrapsAction.Roll]);
        return this.makeMove(ctx, payload);
    }
}
//# sourceMappingURL=craps.js.map