/**
 * Three Card Poker game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class ThreeCardPokerHandler extends GameHandler {
  constructor() {
    super(GameType.ThreeCard);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

    switch (msgType) {
      case 'threecardpoker_deal':
        return this.handleDeal(ctx, msg);
      case 'threecardpoker_play':
        return this.handlePlay(ctx);
      case 'threecardpoker_fold':
        return this.handleFold(ctx);
      default:
        return {
          success: false,
          error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown threecardpoker message: ${msgType}`),
        };
    }
  }

  private async handleDeal(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const ante = msg.ante;
    const pairPlus = msg.pairPlus as number | undefined;

    if (typeof ante !== 'number' || ante <= 0) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid ante amount'),
      };
    }

    // Pair plus is optional side bet
    const totalBet = BigInt(ante) + BigInt(pairPlus ?? 0);

    const gameSessionId = generateSessionId(
      ctx.session.publicKey,
      ctx.session.gameSessionCounter++
    );

    return this.startGame(ctx, totalBet, gameSessionId);
  }

  private async handlePlay(ctx: HandlerContext): Promise<HandleResult> {
    // Play (continue with hand) action
    const payload = new Uint8Array([1]);
    return this.makeMove(ctx, payload);
  }

  private async handleFold(ctx: HandlerContext): Promise<HandleResult> {
    // Fold action
    const payload = new Uint8Array([0]);
    return this.makeMove(ctx, payload);
  }
}
