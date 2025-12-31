import type { LeaderboardEntry } from '../../types';

type RawLeaderboardEntry = { player?: string; name?: string; chips: bigint | number };

type BuildLeaderboardArgs = {
  entries: RawLeaderboardEntry[];
  myPublicKeyHex: string | null;
  includeSelf: boolean;
  selfChips: number;
};

export const buildLeaderboard = ({
  entries,
  myPublicKeyHex,
  includeSelf,
  selfChips,
}: BuildLeaderboardArgs): { board: LeaderboardEntry[]; rank: number } => {
  const board: LeaderboardEntry[] = entries.map((entry) => {
    const name = entry.name || `Player_${entry.player?.substring(0, 8)}`;
    const isYou =
      !!myPublicKeyHex && !!entry.player && entry.player.toLowerCase() === myPublicKeyHex.toLowerCase();
    return { name: isYou ? `${name} (YOU)` : name, chips: Number(entry.chips), status: 'ALIVE' as const };
  });

  const hasSelf =
    !!myPublicKeyHex && entries.some((entry) => entry.player?.toLowerCase() === myPublicKeyHex.toLowerCase());
  if (includeSelf && !hasSelf && myPublicKeyHex) {
    board.push({ name: 'YOU', chips: selfChips, status: 'ALIVE' as const });
  }

  board.sort((a, b) => b.chips - a.chips);
  const rank = board.findIndex((p) => p.name.includes('YOU')) + 1;
  return { board, rank };
};
