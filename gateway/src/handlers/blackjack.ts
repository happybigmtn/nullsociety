/**
 * Blackjack game handler
 * Translates mobile JSON messages to backend transactions
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType, buildBlackjackPayload } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class BlackjackHandler extends GameHandler {
  constructor() {
    super(GameType.Blackjack);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

    switch (msgType) {
      case 'blackjack_deal':
        return this.handleDeal(ctx, msg);
      case 'blackjack_hit':
        return this.handleHit(ctx);
      case 'blackjack_stand':
        return this.handleStand(ctx);
      case 'blackjack_double':
        return this.handleDouble(ctx);
      case 'blackjack_split':
        return this.handleSplit(ctx);
      default:
        return {
          success: false,
          error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown blackjack message: ${msgType}`),
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

  private async handleHit(ctx: HandlerContext): Promise<HandleResult> {
    const payload = buildBlackjackPayload('hit');
    return this.makeMove(ctx, payload);
  }

  private async handleStand(ctx: HandlerContext): Promise<HandleResult> {
    const payload = buildBlackjackPayload('stand');
    return this.makeMove(ctx, payload);
  }

  private async handleDouble(ctx: HandlerContext): Promise<HandleResult> {
    const payload = buildBlackjackPayload('double');
    return this.makeMove(ctx, payload);
  }

  private async handleSplit(ctx: HandlerContext): Promise<HandleResult> {
    const payload = buildBlackjackPayload('split');
    return this.makeMove(ctx, payload);
  }
}
