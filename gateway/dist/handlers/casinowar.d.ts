/**
 * Casino War game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
export declare class CasinoWarHandler extends GameHandler {
    constructor();
    handleMessage(ctx: HandlerContext, msg: Record<string, unknown>): Promise<HandleResult>;
    private handleDeal;
    private handleWar;
    private handleSurrender;
}
//# sourceMappingURL=casinowar.d.ts.map