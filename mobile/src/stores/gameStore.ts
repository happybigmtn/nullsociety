import { create } from 'zustand';
import type { ChipValue } from '../types';

interface GameState {
  balance: number;
  selectedChip: ChipValue;

  // Actions
  setBalance: (balance: number) => void;
  updateBalance: (delta: number) => void;
  setSelectedChip: (chip: ChipValue) => void;
}

export const useGameStore = create<GameState>((set) => ({
  balance: 10000, // Starting balance
  selectedChip: 25,

  setBalance: (balance) => set({ balance }),
  updateBalance: (delta) => set((state) => ({ balance: state.balance + delta })),
  setSelectedChip: (chip) => set({ selectedChip: chip }),
}));
