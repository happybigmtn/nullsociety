export type PlayerStats = {
    chips: number;
    shields: number;
    doubles: number;
    auraMeter?: number;
    rank: number;
    history: Array<string>;
    pnlByGame: {
        [key in string]?: number;
    };
    pnlHistory: Array<number>;
};
//# sourceMappingURL=PlayerStats.d.ts.map