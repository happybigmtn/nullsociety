import { GameType } from '../../types';
import { GameType as ChainGameType } from '@nullspace/types/casino';

export const GAME_TYPE_MAP: Record<GameType, ChainGameType> = {
  [GameType.BACCARAT]: ChainGameType.Baccarat,
  [GameType.BLACKJACK]: ChainGameType.Blackjack,
  [GameType.CASINO_WAR]: ChainGameType.CasinoWar,
  [GameType.CRAPS]: ChainGameType.Craps,
  [GameType.VIDEO_POKER]: ChainGameType.VideoPoker,
  [GameType.HILO]: ChainGameType.HiLo,
  [GameType.ROULETTE]: ChainGameType.Roulette,
  [GameType.SIC_BO]: ChainGameType.SicBo,
  [GameType.THREE_CARD]: ChainGameType.ThreeCard,
  [GameType.ULTIMATE_HOLDEM]: ChainGameType.UltimateHoldem,
  [GameType.NONE]: ChainGameType.Blackjack,
};

export const CHAIN_TO_FRONTEND_GAME_TYPE: Record<ChainGameType, GameType> = {
  [ChainGameType.Baccarat]: GameType.BACCARAT,
  [ChainGameType.Blackjack]: GameType.BLACKJACK,
  [ChainGameType.CasinoWar]: GameType.CASINO_WAR,
  [ChainGameType.Craps]: GameType.CRAPS,
  [ChainGameType.VideoPoker]: GameType.VIDEO_POKER,
  [ChainGameType.HiLo]: GameType.HILO,
  [ChainGameType.Roulette]: GameType.ROULETTE,
  [ChainGameType.SicBo]: GameType.SIC_BO,
  [ChainGameType.ThreeCard]: GameType.THREE_CARD,
  [ChainGameType.UltimateHoldem]: GameType.ULTIMATE_HOLDEM,
};

export const TABLE_GAMES: GameType[] = [
  GameType.BACCARAT,
  GameType.CRAPS,
  GameType.ROULETTE,
  GameType.SIC_BO,
];
