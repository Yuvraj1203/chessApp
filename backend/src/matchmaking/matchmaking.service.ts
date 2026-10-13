import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { MatchesService } from '../matches/matches.service';
import { RealtimeService } from '../gateway/realtime.service';
import { assertCanQueue } from '../tournaments/rules';
import {
  pairKey,
  TournamentsService,
} from '../tournaments/tournaments.service';
import { findPair, type Waiting } from './pairing';

/**
 * In-memory matchmaking queues, one per tournament. Pairing runs inside a
 * per-tournament critical section (promise chain), and a player can sit in at
 * most one queue and one active match, so nobody is ever double-booked.
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);
  /** tournamentId -> (userId -> joinedAt) */
  private readonly queues = new Map<string, Map<string, number>>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly tournaments: TournamentsService,
    private readonly matches: MatchesService,
    private readonly realtime: RealtimeService,
  ) {}

  queuedTournamentOf(userId: string): string | null {
    for (const [tid, q] of this.queues) if (q.has(userId)) return tid;
    return null;
  }

  size(tournamentId: string): number {
    return this.queues.get(tournamentId)?.size ?? 0;
  }

  async join(userId: string, tournamentId: string): Promise<{ queued: true }> {
    const t = await this.tournaments.require(tournamentId);
    assertCanQueue(
      t.status,
      await this.tournaments.isParticipant(tournamentId, userId),
    );
    if (this.matches.isPlayerBusy(userId)) {
      throw new BadRequestException('Finish your current game first');
    }

    this.removeUser(userId); // one queue at a time
    let q = this.queues.get(tournamentId);
    if (!q) this.queues.set(tournamentId, (q = new Map()));
    q.set(userId, Date.now());
    this.realtime.toUser(userId, 'queue:status', {
      tournamentId,
      queued: true,
    });

    void this.tryPair(tournamentId);
    return { queued: true };
  }

  leave(userId: string, tournamentId?: string): void {
    const tid = tournamentId ?? this.queuedTournamentOf(userId);
    if (!tid) return;
    if (this.queues.get(tid)?.delete(userId)) {
      this.realtime.toUser(userId, 'queue:status', {
        tournamentId: tid,
        queued: false,
      });
    }
  }

  /** Remove a user from every queue (disconnect, or joining another queue). */
  removeUser(userId: string): void {
    for (const tid of [...this.queues.keys()]) this.leave(userId, tid);
  }

  private tryPair(tournamentId: string): Promise<unknown> {
    const prev = this.locks.get(tournamentId) ?? Promise.resolve();
    const next = prev
      .then(() => this.pairAll(tournamentId))
      .catch((e) => this.logger.error(`pairing failed for ${tournamentId}`, e));
    this.locks.set(tournamentId, next);
    return next;
  }

  private async pairAll(tournamentId: string): Promise<void> {
    const queue = this.queues.get(tournamentId);
    if (!queue || queue.size < 2) return;

    const t = await this.tournaments.require(tournamentId);
    if (t.status !== 'open' && t.status !== 'ongoing') return;
    const [standings, played] = await Promise.all([
      this.tournaments.standings(tournamentId),
      this.tournaments.playedPairs(tournamentId),
    ]);
    const points = new Map<string, number>(
      standings.map((s) => [s.userId, s.points]),
    );
    const canPlay = (a: string, b: string) =>
      t.allowRematch || !played.has(pairKey(a, b));

    for (;;) {
      const waiting: Waiting[] = [...queue].map(([userId, joinedAt]) => ({
        userId,
        joinedAt,
        points: points.get(userId) ?? 0,
      }));
      const pair = findPair(waiting, canPlay);
      if (!pair) break;
      const [a, b] = pair;

      // Take both players out of the queue *before* the async DB work so a
      // concurrent join/leave can't touch them.
      queue.delete(a.userId);
      queue.delete(b.userId);
      try {
        const snap = await this.matches.createMatch(t, a.userId, b.userId);
        for (const p of [snap.white, snap.black]) {
          const opponent = p.id === snap.white.id ? snap.black : snap.white;
          this.realtime.toUser(p.id, 'match:found', {
            matchId: snap.matchId,
            tournamentId,
            color: p.id === snap.white.id ? 'white' : 'black',
            opponent,
          });
          this.realtime.toUser(p.id, 'queue:status', {
            tournamentId,
            queued: false,
          });
        }
        played.add(pairKey(a.userId, b.userId));
        this.realtime.toTournament(tournamentId, 'tournament:updated', {
          tournamentId,
        });
      } catch (e) {
        this.logger.warn(`could not create match: ${(e as Error).message}`);
        for (const p of [a, b]) {
          this.realtime.toUser(p.userId, 'queue:status', {
            tournamentId,
            queued: false,
          });
        }
      }
    }
  }
}
