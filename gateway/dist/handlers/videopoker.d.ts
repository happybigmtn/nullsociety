/**
 * Video Poker game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
export declare class VideoPokerHandler extends GameHandler {
    constructor();
    handleMessage(ctx: HandlerContext, msg: Record<string, unknown>): Promise<HandleResult>;
    private handleDeal;
    private handleHold;
}
//# sourceMappingURL=videopoker.d.ts.map