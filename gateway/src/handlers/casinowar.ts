/**
 * Casino War game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class CasinoWarHandler extends GameHandler {
  constructor() {
    super(GameType.CasinoWar);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

    switch (msgType) {
      case 'casinowar_deal':
        return this.handleDeal(ctx, msg);
      case 'casinowar_war':
        return this.handleWar(ctx);
      case 'casinowar_surrender':
        return this.handleSurrender(ctx);
      default:
        return {
          success: false,
          error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown casinowar message: ${msgType}`),
        };
    }
  }

  private async handleDeal(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const amount = msg.amount;
    if (typeof amount !== 'number' || amount <= 0) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid bet amount'),
      };
    }

    const gameSessionId = generateSessionId(
      ctx.session.publicKey,
      ctx.session.gameSessionCounter++
    );

    return this.startGame(ctx, BigInt(amount), gameSessionId);
  }

  private async handleWar(ctx: HandlerContext): Promise<HandleResult> {
    // Go to war action
    const payload = new Uint8Array([1]);
    return this.makeMove(ctx, payload);
  }

  private async handleSurrender(ctx: HandlerContext): Promise<HandleResult> {
    // Surrender action
    const payload = new Uint8Array([0]);
    return this.makeMove(ctx, payload);
  }
}
