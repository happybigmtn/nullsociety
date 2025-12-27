/**
 * Baccarat game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class BaccaratHandler extends GameHandler {
  constructor() {
    super(GameType.Baccarat);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

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

  private async handleDeal(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const amount = msg.amount;
    const betType = msg.betType as string | undefined;

    if (typeof amount !== 'number' || amount <= 0) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid bet amount'),
      };
    }

    // Validate bet type: player, banker, or tie
    if (!betType || !['player', 'banker', 'tie'].includes(betType)) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid bet type (must be player, banker, or tie)'),
      };
    }

    const gameSessionId = generateSessionId(
      ctx.session.publicKey,
      ctx.session.gameSessionCounter++
    );

    return this.startGame(ctx, BigInt(amount), gameSessionId);
  }
}
