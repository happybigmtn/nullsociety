/**
 * Craps game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType, buildCrapsPayload } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class CrapsHandler extends GameHandler {
  constructor() {
    super(GameType.Craps);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

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

  private async handleBet(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const betType = msg.betType;
    const amount = msg.amount;

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

    const gameSessionId = generateSessionId(
      ctx.session.publicKey,
      ctx.session.gameSessionCounter++
    );

    // Start game with bet amount
    const startResult = await this.startGame(ctx, BigInt(amount), gameSessionId);
    if (!startResult.success) {
      return startResult;
    }

    // Send bet as game move
    const payload = buildCrapsPayload(betType, BigInt(amount));
    return this.makeMove(ctx, payload);
  }

  private async handleRoll(ctx: HandlerContext): Promise<HandleResult> {
    // Roll the dice (no payload needed after initial bet)
    const payload = new Uint8Array([0]);  // Roll action
    return this.makeMove(ctx, payload);
  }
}
