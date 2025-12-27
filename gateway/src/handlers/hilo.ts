/**
 * Hi-Lo game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType, buildHiLoPayload } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class HiLoHandler extends GameHandler {
  constructor() {
    super(GameType.HiLo);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

    switch (msgType) {
      case 'hilo_deal':
        return this.handleDeal(ctx, msg);
      case 'hilo_higher':
        return this.handleGuess(ctx, 'higher');
      case 'hilo_lower':
        return this.handleGuess(ctx, 'lower');
      case 'hilo_same':
        return this.handleGuess(ctx, 'same');
      case 'hilo_cashout':
        return this.handleCashout(ctx);
      default:
        return {
          success: false,
          error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown hilo message: ${msgType}`),
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

  private async handleGuess(
    ctx: HandlerContext,
    guess: 'higher' | 'lower' | 'same'
  ): Promise<HandleResult> {
    const payload = buildHiLoPayload(guess);
    return this.makeMove(ctx, payload);
  }

  private async handleCashout(ctx: HandlerContext): Promise<HandleResult> {
    // Cash out is encoded as a special action
    const payload = new Uint8Array([3]);  // Cashout action
    return this.makeMove(ctx, payload);
  }
}
