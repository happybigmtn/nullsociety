import type { CrapsBetStatus } from "./CrapsBetStatus.js";
import type { CrapsBetType } from "./CrapsBetType.js";
export type CrapsBet = {
    type: CrapsBetType;
    amount: number;
    target?: number;
    oddsAmount?: number;
    localOddsAmount?: number;
    progressMask?: number;
    status?: CrapsBetStatus;
    local?: boolean;
};
//# sourceMappingURL=CrapsBet.d.ts.map