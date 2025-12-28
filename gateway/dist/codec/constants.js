/**
 * Protocol constants matching the Rust backend
 * See: types/src/execution.rs
 */
// Transaction signing namespace - used for Ed25519 signatures
// CRITICAL: Must match TRANSACTION_NAMESPACE in Rust (b"_NULLSPACE_TX")
export const TRANSACTION_NAMESPACE = new TextEncoder().encode('_NULLSPACE_TX');
// Instruction tags (matching types/src/execution.rs)
export const InstructionTag = {
    CasinoRegister: 10,
    CasinoDeposit: 11,
    CasinoStartGame: 12,
    CasinoGameMove: 13,
    CasinoPlayerAction: 14,
    CasinoSetTournamentLimit: 15,
    CasinoJoinTournament: 16,
    CasinoStartTournament: 17,
};
// Submission tags (matching types/src/api.rs)
export const SubmissionTag = {
    Seed: 0,
    Transactions: 1, // CRITICAL: Use this for /submit, NOT 0
    Summary: 2,
};
// Game types (matching types/src/casino/game.rs)
export const GameType = {
    Baccarat: 0,
    Blackjack: 1,
    CasinoWar: 2,
    Craps: 3,
    VideoPoker: 4,
    HiLo: 5,
    Roulette: 6,
    SicBo: 7,
    ThreeCard: 8,
    UltimateHoldem: 9,
};
// Player actions (matching types/src/casino/game.rs)
export const PlayerAction = {
    Hit: 0,
    Stand: 1,
    Double: 2,
    Split: 3,
    ToggleShield: 10,
    ToggleDouble: 11,
    ActivateSuper: 12,
    CashOut: 20,
};
// Blackjack move types (payload for CasinoGameMove)
export const BlackjackMove = {
    Hit: 0,
    Stand: 1,
    Double: 2,
    Split: 3,
};
// Hi-Lo guess types (matching execution/src/casino/hilo.rs Move enum)
export const HiLoGuess = {
    Higher: 0,
    Lower: 1,
    // Note: 2 is reserved/unused in Rust enum
    Same: 3,
};
// Baccarat bet types (matching execution/src/casino/baccarat.rs BetType enum)
export const BaccaratBet = {
    Player: 0,
    Banker: 1,
    Tie: 2,
    PlayerPair: 3,
    BankerPair: 4,
    Lucky6: 5,
    PlayerDragon: 6,
    BankerDragon: 7,
    Panda8: 8,
    PlayerPerfectPair: 9,
    BankerPerfectPair: 10,
};
// Roulette bet types (matching execution/src/casino/roulette.rs BetType enum)
export const RouletteBetType = {
    Straight: 0, // Single number (35:1)
    Red: 1, // Red (1:1)
    Black: 2, // Black (1:1)
    Even: 3, // Even (1:1)
    Odd: 4, // Odd (1:1)
    Low: 5, // 1-18 (1:1)
    High: 6, // 19-36 (1:1)
    Dozen: 7, // 1-12, 13-24, 25-36 (2:1) - number = 0/1/2
    Column: 8, // First, second, third column (2:1) - number = 0/1/2
    SplitH: 9, // Horizontal split (17:1) - number is left cell
    SplitV: 10, // Vertical split (17:1) - number is top cell
    Street: 11, // 3-number row (11:1) - number is row start (1,4,...,34)
    Corner: 12, // 4-number corner (8:1) - number is top-left (1-32)
    SixLine: 13, // 6 numbers (5:1) - number is row start (1,4,...,31)
};
// SicBo bet types (matching execution/src/casino/sic_bo.rs BetType enum)
export const SicBoBetType = {
    Small: 0,
    Big: 1,
    Odd: 2,
    Even: 3,
    SpecificTriple: 4,
    AnyTriple: 5,
    SpecificDouble: 6,
    Total: 7, // Sum of all dice
    Single: 8, // Single die bet
    Domino: 9,
    ThreeNumberEasyHop: 10,
    ThreeNumberHardHop: 11,
    FourNumberEasyHop: 12,
};
// Craps bet types (matching execution/src/casino/craps.rs BetType enum)
export const CrapsBet = {
    Pass: 0,
    DontPass: 1,
    Come: 2,
    DontCome: 3,
    Field: 4,
    Yes: 5, // Place bet - uses target (4, 5, 6, 8, 9, 10)
    No: 6, // Lay bet - uses target
    Next: 7, // Hop bet - uses target
    Hardway4: 8,
    Hardway6: 9,
    Hardway8: 10,
    Hardway10: 11,
    Fire: 12,
    CAndE: 13,
    Horn: 14,
    AtsSmall: 15,
    AtsTall: 16,
    AtsAll: 17,
    Muggsy: 18,
    DiffDoubles: 19,
    RideLine: 20,
    Replay: 21,
    HotRoller: 22,
};
//# sourceMappingURL=constants.js.map