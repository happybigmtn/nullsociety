import { useEffect, useRef } from 'react';
import type { TournamentPhase } from '../../types';
import { BotConfig, BotService } from '../../services/BotService';
import { logDebug } from '../../utils/logger';

type UseBotManagerArgs = {
  botConfig: BotConfig;
  playMode: 'CASH' | 'FREEROLL' | null;
  phase: TournamentPhase;
  freerollNextTournamentId: number | null;
};

export const useBotManager = ({
  botConfig,
  playMode,
  phase,
  freerollNextTournamentId,
}: UseBotManagerArgs) => {
  const botServiceRef = useRef<BotService | null>(null);

  useEffect(() => {
    const identityHex = import.meta.env.VITE_IDENTITY;
    if (identityHex && !botServiceRef.current) {
      try {
        const baseUrl = import.meta.env.VITE_URL || '/api';
        botServiceRef.current = new BotService(baseUrl, identityHex);
      } catch (e) {
        console.warn('[useBotManager] Failed to initialize bot service:', e);
      }
    }
  }, []);

  useEffect(() => {
    const botService = botServiceRef.current;
    if (!botService) return;

    botService.setConfig(botConfig);

    if (playMode !== 'FREEROLL' || !botConfig.enabled) {
      botService.stop();
      return;
    }

    if (phase === 'REGISTRATION') {
      if (freerollNextTournamentId !== null) {
        logDebug('[useBotManager] Preparing bots for tournament', freerollNextTournamentId);
        botService.prepareTournamentBots(freerollNextTournamentId).catch((e) => {
          console.warn('[useBotManager] Failed to prepare bots:', e);
        });
      }
      return;
    }

    if (phase === 'ACTIVE') {
      logDebug('[useBotManager] Starting bot play loops...');
      botService.startPlaying();
    }

    return () => {
      botService.stop();
    };
  }, [botConfig, playMode, phase, freerollNextTournamentId]);
};
