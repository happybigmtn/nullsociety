/**
 * Sic Bo game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
import { GameType, buildSicBoPayload, type SicBoBet } from '../codec/index.js';
import { generateSessionId } from '../codec/transactions.js';
import { ErrorCodes, createError } from '../types/errors.js';

export class SicBoHandler extends GameHandler {
  constructor() {
    super(GameType.SicBo);
  }

  async handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const msgType = msg.type as string;

    switch (msgType) {
      case 'sicbo_roll':
        return this.handleRoll(ctx, msg);
      default:
        return {
          success: false,
          error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown sicbo message: ${msgType}`),
        };
    }
  }

  private async handleRoll(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult> {
    const bets = msg.bets as Array<{ type: number; amount: number }> | undefined;

    if (!bets || !Array.isArray(bets) || bets.length === 0) {
      return {
        success: false,
        error: createError(ErrorCodes.INVALID_BET, 'No bets provided'),
      };
    }

    // Validate and convert bets
    const sicBoBets: SicBoBet[] = [];
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

      sicBoBets.push({
        type: bet.type,
        amount: BigInt(bet.amount),
      });
      totalBet += BigInt(bet.amount);
    }

    const gameSessionId = generateSessionId(
      ctx.session.publicKey,
      ctx.session.gameSessionCounter++
    );

    // Start game with total bet
    const startResult = await this.startGame(ctx, totalBet, gameSessionId);
    if (!startResult.success) {
      return startResult;
    }

    // Send bets as game move
    const payload = buildSicBoPayload(sicBoBets);
    return this.makeMove(ctx, payload);
  }
}
