import type { GameState } from '../../../types';
import type { Ref } from '../refs';

export type SetGameState = (value: GameState | ((prev: GameState) => GameState)) => void;
export type GameStateRef = Ref<GameState | null>;
