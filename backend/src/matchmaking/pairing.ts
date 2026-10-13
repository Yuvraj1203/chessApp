export interface Waiting {
  userId: string;
  joinedAt: number;
  points: number;
}

/**
 * Standings-based pairing: among all eligible pairs pick the one with the
 * closest points; ties go to whoever has waited longest (FIFO).
 */
export function findPair(
  queue: Waiting[],
  canPlay: (a: string, b: string) => boolean,
): [Waiting, Waiting] | null {
  let best: [Waiting, Waiting] | null = null;
  let bestDiff = Infinity;
  let bestWait = Infinity;
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];
      if (a.userId === b.userId || !canPlay(a.userId, b.userId)) continue;
      const diff = Math.abs(a.points - b.points);
      const wait = a.joinedAt + b.joinedAt; // smaller = waited longer
      if (diff < bestDiff || (diff === bestDiff && wait < bestWait)) {
        best = [a, b];
        bestDiff = diff;
        bestWait = wait;
      }
    }
  }
  return best;
}
