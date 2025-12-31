import { GameType, Card } from '../types';

const authBase =
  (import.meta.env.VITE_AUTH_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const authPath = (path: string) => `${authBase}${path}`;

const OFFLINE_MESSAGE = 'AI Strategy Offline (Using On-Chain Randomness)';
const UNAVAILABLE_MESSAGE = 'AI Strategy Unavailable';
const RATE_LIMIT_MESSAGE = 'AI Strategy Rate Limited - Try Again Soon.';

type AiResponse = {
  advice?: string;
  error?: string;
};

const readAiError = async (res: Response): Promise<string | null> => {
  try {
    const data = (await res.json()) as AiResponse;
    if (data?.error) return data.error;
  } catch {
    // ignore parse errors
  }
  return null;
};

export const getStrategicAdvice = async (
  gameType: GameType,
  playerCards: Card[],
  dealerUpCard: Card | null,
  history: string[]
): Promise<string> => {
  try {
    const res = await fetch(authPath('/ai/strategy'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameType,
        playerCards,
        dealerUpCard,
        history,
      }),
    });

    if (res.status === 429) return RATE_LIMIT_MESSAGE;

    if (!res.ok) {
      const error = await readAiError(res);
      if (error === 'ai_disabled') return OFFLINE_MESSAGE;
      return UNAVAILABLE_MESSAGE;
    }

    const data = (await res.json()) as AiResponse;
    if (data?.advice) return String(data.advice).trim();
    return UNAVAILABLE_MESSAGE;
  } catch {
    return OFFLINE_MESSAGE;
  }
};
