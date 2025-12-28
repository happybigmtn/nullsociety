/**
 * Baccarat game handler
 */
import { GameHandler, type HandlerContext, type HandleResult } from './base.js';
export declare class BaccaratHandler extends GameHandler {
    constructor();
    handleMessage(ctx: HandlerContext, msg: Record<string, unknown>): Promise<HandleResult>;
    private handleDeal;
}
//# sourceMappingURL=baccarat.d.ts.map