import type { MatchResult } from '../database/schema';

export interface StandingsParticipant {
  userId: string;
  name: string;
}

export interface FinishedMatch {
  whiteId: string;
  blackId: string;
  result: MatchResult;
}

export interface StandingRow {
  rank: number;
  userId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  /** Sonneborn-Berger tiebreak: sum of (opponent points x score against them). */
  tiebreak: number;
}

/** Points a player scores in a game: win 1, draw 0.5, loss 0. */
export function pointsFor(
  result: MatchResult,
  color: 'white' | 'black',
): number {
  if (result === 'draw') return 0.5;
  return result === color ? 1 : 0;
}

/**
 * Turns finished matches into a ranked leaderboard.
 * Order: points desc, wins desc, Sonneborn-Berger desc, name asc.
 * Players equal on points, wins and tiebreak share a rank.
 */
export function computeStandings(
  participants: StandingsParticipant[],
  matches: FinishedMatch[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    participants.map((p) => [
      p.userId,
      {
        rank: 0,
        userId: p.userId,
        name: p.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        tiebreak: 0,
      },
    ]),
  );

  const credit = (
    id: string,
    result: MatchResult,
    color: 'white' | 'black',
  ): void => {
    const row = rows.get(id);
    if (!row) return;
    const pts = pointsFor(result, color);
    row.played += 1;
    row.points += pts;
    if (pts === 1) row.wins += 1;
    else if (pts === 0.5) row.draws += 1;
    else row.losses += 1;
  };

  for (const m of matches) {
    credit(m.whiteId, m.result, 'white');
    credit(m.blackId, m.result, 'black');
  }

  for (const m of matches) {
    const white = rows.get(m.whiteId);
    const black = rows.get(m.blackId);
    if (white && black) {
      white.tiebreak += black.points * pointsFor(m.result, 'white');
      black.tiebreak += white.points * pointsFor(m.result, 'black');
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.tiebreak - a.tiebreak ||
      a.name.localeCompare(b.name),
  );

  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    const tied =
      prev &&
      prev.points === row.points &&
      prev.wins === row.wins &&
      prev.tiebreak === row.tiebreak;
    row.rank = tied ? prev.rank : i + 1;
  });
  return sorted;
}
