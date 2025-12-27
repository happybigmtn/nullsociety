/**
 * Ultimate Texas Hold'em game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class UltimateHoldemHandler extends GameHandler {
  constructor() {
    super(GameType.UltimateHoldem);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

    switch (msgType) {
      case 'ultimateholdem_deal':
        return this.handleDeal(ctx, msg);
      case 'ultimateholdem_bet':
        return this.handleBet(ctx, msg);
      case 'ultimateholdem_check':
        return this.handleCheck(ctx);
      case 'ultimateholdem_fold':
        return this.handleFold(ctx);
      default:
        return {
          success: false,
          error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown ultimateholdem message: ${msgType}`),
        };
    }
  }

  private async handleDeal(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const ante = msg.ante;
    const blind = msg.blind;
    const trips = msg.trips as number | undefined;

    if (typeof ante !== 'number' || ante <= 0) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid ante amount'),
      };
    }

    if (typeof blind !== 'number' || blind <= 0) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid blind amount'),
      };
    }

    // Trips is optional side bet
    const totalBet = BigInt(ante) + BigInt(blind) + BigInt(trips ?? 0);

    const gameSessionId = generateSessionId(
      ctx.session.publicKey,
      ctx.session.gameSessionCounter++
    );

    return this.startGame(ctx, totalBet, gameSessionId);
  }

  private async handleBet(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const multiplier = msg.multiplier as number | undefined;

    // Valid multipliers: 4x (pre-flop), 2x (flop), 1x (river)
    if (!multiplier || ![1, 2, 4].includes(multiplier)) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'Invalid bet multiplier (must be 1, 2, or 4)'),
      };
    }

    // Encode bet action with multiplier
    const payload = new Uint8Array([1, multiplier]);
    return this.makeMove(ctx, payload);
  }

  private async handleCheck(ctx: HandlerContext): Promise<HandleResult> {
    // Check action
    const payload = new Uint8Array([2]);
    return this.makeMove(ctx, payload);
  }

  private async handleFold(ctx: HandlerContext): Promise<HandleResult> {
    // Fold action
    const payload = new Uint8Array([0]);
    return this.makeMove(ctx, payload);
  }
}
