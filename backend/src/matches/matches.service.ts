import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Chess } from 'chess.js';
import { aliasedTable, and, desc, eq, or } from 'drizzle-orm';

import type { AuthUser } from '../common/auth.types';
import { isUniqueViolation } from '../common/pg-errors';
import { DB, type Database } from '../database/database.module';
import {
  matches,
  matchPlayers,
  tournaments,
  users,
  type Match,
  type Tournament,
} from '../database/schema';
import { RealtimeService } from '../gateway/realtime.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import {
  applyMove,
  colorToMove,
  currentClocks,
  flagged,
  initialState,
  START_FEN,
  type Color,
  type GameOutcome,
  type GameState,
  type MoveInput,
} from './game.logic';
import type { MatchSnapshot, PlayerInfo } from './match.types';

interface LiveGame {
  matchId: string;
  tournamentId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  baseMinutes: number;
  incrementSeconds: number;
  state: GameState;
  drawOffer: Color | null;
  ending: boolean;
  timer?: NodeJS.Timeout;
  /** Serialises DB writes for this game so they land in order. */
  writes: Promise<unknown>;
}

const oppositeOf = (c: Color): Color => (c === 'white' ? 'black' : 'white');

/**
 * Server-authoritative game manager. Active games live in memory (and are
 * persisted after every move so they survive restarts); clients only send
 * move *intents* which are validated here with chess.js.
 */
@Injectable()
export class MatchesService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MatchesService.name);
  private readonly games = new Map<string, LiveGame>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeService,
    private readonly tournaments: TournamentsService,
  ) {}

  // ---------- lifecycle ----------

  /** Restore unfinished games after a restart (clocks keep running). */
  async onModuleInit(): Promise<void> {
    const white = aliasedTable(users, 'white_user');
    const black = aliasedTable(users, 'black_user');
    const rows = await this.db
      .select({
        m: matches,
        t: tournaments,
        whiteName: white.name,
        blackName: black.name,
      })
      .from(matches)
      .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
      .innerJoin(white, eq(white.id, matches.whiteId))
      .innerJoin(black, eq(black.id, matches.blackId))
      .where(eq(matches.status, 'active'));

    for (const r of rows) {
      const live: LiveGame = {
        matchId: r.m.id,
        tournamentId: r.m.tournamentId,
        white: { id: r.m.whiteId, name: r.whiteName },
        black: { id: r.m.blackId, name: r.blackName },
        baseMinutes: r.t.baseMinutes,
        incrementSeconds: r.t.incrementSeconds,
        state: {
          pgn: r.m.pgn,
          fen: r.m.fen,
          whiteMs: r.m.whiteTimeMs,
          blackMs: r.m.blackTimeMs,
          turnStartedAt: (r.m.turnStartedAt ?? new Date()).getTime(),
          incrementMs: r.t.incrementSeconds * 1000,
        },
        drawOffer: null,
        ending: false,
        writes: Promise.resolve(),
      };
      this.games.set(live.matchId, live);
      this.scheduleTimer(live);
    }
    if (rows.length) this.logger.log(`Restored ${rows.length} active game(s)`);
  }

  onApplicationShutdown(): void {
    for (const g of this.games.values()) clearTimeout(g.timer);
  }

  // ---------- queries ----------

  activeMatchIdFor(userId: string): string | null {
    for (const g of this.games.values()) {
      if (g.white.id === userId || g.black.id === userId) return g.matchId;
    }
    return null;
  }

  isPlayerBusy(userId: string): boolean {
    return this.activeMatchIdFor(userId) !== null;
  }

  private snapshot(g: LiveGame, now = Date.now()): MatchSnapshot {
    const clocks = currentClocks(g.state, now);
    return {
      matchId: g.matchId,
      tournamentId: g.tournamentId,
      white: g.white,
      black: g.black,
      fen: g.state.fen,
      pgn: g.state.pgn,
      turn: colorToMove(g.state.fen),
      whiteMs: clocks.whiteMs,
      blackMs: clocks.blackMs,
      running: g.state.turnStartedAt !== null,
      status: 'active',
      result: null,
      endReason: null,
      drawOffer: g.drawOffer,
      timeControl: `${g.baseMinutes}+${g.incrementSeconds}`,
      serverTime: now,
    };
  }

  private async snapshotFromDb(id: string): Promise<MatchSnapshot> {
    const white = aliasedTable(users, 'white_user');
    const black = aliasedTable(users, 'black_user');
    const [r] = await this.db
      .select({
        m: matches,
        t: tournaments,
        whiteName: white.name,
        blackName: black.name,
      })
      .from(matches)
      .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
      .innerJoin(white, eq(white.id, matches.whiteId))
      .innerJoin(black, eq(black.id, matches.blackId))
      .where(eq(matches.id, id));
    if (!r) throw new NotFoundException('Match not found');
    return this.dbSnapshot(r.m, r.t, r.whiteName, r.blackName);
  }

  private dbSnapshot(
    m: Match,
    t: Tournament,
    whiteName: string,
    blackName: string,
  ): MatchSnapshot {
    return {
      matchId: m.id,
      tournamentId: m.tournamentId,
      white: { id: m.whiteId, name: whiteName },
      black: { id: m.blackId, name: blackName },
      fen: m.fen,
      pgn: m.pgn,
      turn: colorToMove(m.fen),
      whiteMs: m.whiteTimeMs,
      blackMs: m.blackTimeMs,
      running: false,
      status: m.status,
      result: m.result,
      endReason: m.endReason,
      drawOffer: null,
      timeControl: `${t.baseMinutes}+${t.incrementSeconds}`,
      serverTime: Date.now(),
    };
  }

  /**
   * Snapshot for a viewer. Players may always view; coaches may spectate.
   * Anyone else is refused (this is also the Socket.IO room-join check).
   */
  async getForViewer(user: AuthUser, matchId: string): Promise<MatchSnapshot> {
    const live = this.games.get(matchId);
    const snap = live
      ? this.snapshot(live)
      : await this.snapshotFromDb(matchId);
    const isPlayer = snap.white.id === user.id || snap.black.id === user.id;
    if (!isPlayer && user.role !== 'coach') {
      throw new ForbiddenException('You are not a participant of this match');
    }
    return snap;
  }

  async history(user: AuthUser) {
    const white = aliasedTable(users, 'white_user');
    const black = aliasedTable(users, 'black_user');
    const rows = await this.db
      .select({
        m: matches,
        tournamentName: tournaments.name,
        whiteName: white.name,
        blackName: black.name,
      })
      .from(matches)
      .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
      .innerJoin(white, eq(white.id, matches.whiteId))
      .innerJoin(black, eq(black.id, matches.blackId))
      .where(or(eq(matches.whiteId, user.id), eq(matches.blackId, user.id)))
      .orderBy(desc(matches.startedAt));

    return rows.map(({ m, tournamentName, whiteName, blackName }) => {
      const color: Color = m.whiteId === user.id ? 'white' : 'black';
      let outcome: 'win' | 'loss' | 'draw' | null = null;
      if (m.result) {
        outcome =
          m.result === 'draw' ? 'draw' : m.result === color ? 'win' : 'loss';
      }
      return {
        id: m.id,
        tournamentId: m.tournamentId,
        tournamentName,
        status: m.status,
        color,
        opponent: color === 'white' ? blackName : whiteName,
        outcome,
        result: m.result,
        endReason: m.endReason,
        startedAt: m.startedAt.toISOString(),
        endedAt: m.endedAt?.toISOString() ?? null,
      };
    });
  }

  // ---------- creating a match (called by matchmaking) ----------

  async createMatch(
    t: Tournament,
    playerA: string,
    playerB: string,
  ): Promise<MatchSnapshot> {
    const [whiteId, blackId] =
      Math.random() < 0.5 ? [playerA, playerB] : [playerB, playerA];
    const now = Date.now();
    const state = initialState(t.baseMinutes, t.incrementSeconds, now);

    let matchId: string;
    try {
      matchId = await this.db.transaction(async (tx) => {
        const [m] = await tx
          .insert(matches)
          .values({
            tournamentId: t.id,
            whiteId,
            blackId,
            fen: START_FEN,
            pgn: '',
            whiteTimeMs: state.whiteMs,
            blackTimeMs: state.blackMs,
            turnStartedAt: new Date(now),
          })
          .returning({ id: matches.id });
        // The partial unique index rejects this if either player is already
        // in an active match: the DB is the last line of defence.
        await tx.insert(matchPlayers).values([
          { matchId: m.id, userId: whiteId },
          { matchId: m.id, userId: blackId },
        ]);
        return m.id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('A player is already in an active match');
      }
      throw e;
    }

    const rows = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(or(eq(users.id, whiteId), eq(users.id, blackId)));
    const name = (id: string) =>
      rows.find((r) => r.id === id)?.name ?? 'Player';

    const live: LiveGame = {
      matchId,
      tournamentId: t.id,
      white: { id: whiteId, name: name(whiteId) },
      black: { id: blackId, name: name(blackId) },
      baseMinutes: t.baseMinutes,
      incrementSeconds: t.incrementSeconds,
      state,
      drawOffer: null,
      ending: false,
      writes: Promise.resolve(),
    };
    this.games.set(matchId, live);
    this.scheduleTimer(live);
    return this.snapshot(live);
  }

  // ---------- player actions ----------

  private requireLive(matchId: string): LiveGame {
    const g = this.games.get(matchId);
    if (!g || g.ending) throw new BadRequestException('Match is not active');
    return g;
  }

  private colorOf(g: LiveGame, userId: string): Color {
    if (g.white.id === userId) return 'white';
    if (g.black.id === userId) return 'black';
    throw new ForbiddenException('You are not a player in this match');
  }

  async move(userId: string, matchId: string, input: MoveInput) {
    const g = this.requireLive(matchId);
    const color = this.colorOf(g, userId);
    const now = Date.now();

    // The clock may have expired just before this move arrived.
    const loser = flagged(g.state, now);
    if (loser) {
      await this.finish(g, {
        result: oppositeOf(loser),
        reason: 'timeout',
      });
      throw new BadRequestException('Time is up');
    }

    const r = applyMove(g.state, color, input, now);
    if (!r.ok) throw new BadRequestException(r.error);

    g.state = r.state;
    g.drawOffer = null;
    if (r.outcome) {
      await this.finish(g, r.outcome);
    } else {
      this.scheduleTimer(g);
      this.persistProgress(g);
      this.realtime.toMatch(matchId, 'match:state', this.snapshot(g));
    }
    return { ok: true };
  }

  async resign(userId: string, matchId: string) {
    const g = this.requireLive(matchId);
    const color = this.colorOf(g, userId);
    await this.finish(g, { result: oppositeOf(color), reason: 'resignation' });
    return { ok: true };
  }

  offerDraw(userId: string, matchId: string) {
    const g = this.requireLive(matchId);
    const color = this.colorOf(g, userId);
    if (g.drawOffer === color) {
      throw new BadRequestException('You already offered a draw');
    }
    if (g.drawOffer === oppositeOf(color)) {
      // Both sides want it: treat as acceptance.
      return this.respondDraw(userId, matchId, true);
    }
    g.drawOffer = color;
    this.realtime.toMatch(matchId, 'match:state', this.snapshot(g));
    return Promise.resolve({ ok: true });
  }

  async respondDraw(userId: string, matchId: string, accept: boolean) {
    const g = this.requireLive(matchId);
    const color = this.colorOf(g, userId);
    if (g.drawOffer !== oppositeOf(color)) {
      throw new BadRequestException('There is no draw offer to answer');
    }
    if (accept) {
      await this.finish(g, { result: 'draw', reason: 'agreement' });
    } else {
      g.drawOffer = null;
      this.realtime.toMatch(matchId, 'match:state', this.snapshot(g));
    }
    return { ok: true };
  }

  // ---------- clock & persistence ----------

  private scheduleTimer(g: LiveGame): void {
    clearTimeout(g.timer);
    if (g.state.turnStartedAt === null || g.ending) return;
    const now = Date.now();
    const clocks = currentClocks(g.state, now);
    const left =
      colorToMove(g.state.fen) === 'white' ? clocks.whiteMs : clocks.blackMs;
    g.timer = setTimeout(() => void this.onTimer(g), left + 25);
  }

  private async onTimer(g: LiveGame): Promise<void> {
    if (g.ending) return;
    const loser = flagged(g.state, Date.now());
    if (!loser) return this.scheduleTimer(g);
    await this.finish(g, { result: oppositeOf(loser), reason: 'timeout' });
  }

  private persistProgress(g: LiveGame): void {
    const s = g.state;
    const values = {
      pgn: s.pgn,
      fen: s.fen,
      whiteTimeMs: s.whiteMs,
      blackTimeMs: s.blackMs,
      turnStartedAt: s.turnStartedAt ? new Date(s.turnStartedAt) : null,
    };
    g.writes = g.writes
      .then(() =>
        this.db.update(matches).set(values).where(eq(matches.id, g.matchId)),
      )
      .catch((e) => this.logger.error(`persist failed for ${g.matchId}`, e));
  }

  private fullPgn(g: LiveGame, o: GameOutcome): string {
    const chess = new Chess();
    if (g.state.pgn) chess.loadPgn(g.state.pgn);
    const resultTag =
      o.result === 'white' ? '1-0' : o.result === 'black' ? '0-1' : '1/2-1/2';
    chess.setHeader('Event', 'Kingdom of Chess Tournament');
    chess.setHeader('Site', 'Kingdom of Chess');
    chess.setHeader(
      'Date',
      new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    );
    chess.setHeader('White', g.white.name);
    chess.setHeader('Black', g.black.name);
    chess.setHeader('Result', resultTag);
    chess.setHeader('Termination', o.reason);
    return chess.pgn();
  }

  /** Ends a game exactly once: persist, free the players, notify everyone. */
  private async finish(g: LiveGame, outcome: GameOutcome): Promise<void> {
    if (g.ending) return;
    g.ending = true;
    clearTimeout(g.timer);

    // Freeze the clocks at the moment of ending.
    const now = Date.now();
    const clocks = currentClocks(g.state, now);
    g.state = {
      ...g.state,
      whiteMs: clocks.whiteMs,
      blackMs: clocks.blackMs,
      turnStartedAt: null,
    };
    g.drawOffer = null;
    const pgn = this.fullPgn(g, outcome);

    await g.writes;
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(matches)
          .set({
            status: 'completed',
            result: outcome.result,
            endReason: outcome.reason,
            pgn,
            fen: g.state.fen,
            whiteTimeMs: g.state.whiteMs,
            blackTimeMs: g.state.blackMs,
            turnStartedAt: null,
            endedAt: new Date(now),
          })
          .where(eq(matches.id, g.matchId));
        await tx
          .update(matchPlayers)
          .set({ active: false })
          .where(
            and(
              eq(matchPlayers.matchId, g.matchId),
              eq(matchPlayers.active, true),
            ),
          );
      });
    } catch (e) {
      // Allow a retry (e.g. the timer) rather than leaving players stuck.
      g.ending = false;
      this.logger.error(`failed to finish ${g.matchId}`, e);
      throw e;
    }

    this.games.delete(g.matchId);
    const snap: MatchSnapshot = {
      ...this.snapshot(g, now),
      pgn,
      status: 'completed',
      running: false,
      result: outcome.result,
      endReason: outcome.reason,
    };
    this.realtime.toMatch(g.matchId, 'match:ended', snap);
    // Players who haven't opened the board yet still learn the game is over.
    this.realtime.toUser(g.white.id, 'match:ended', snap);
    this.realtime.toUser(g.black.id, 'match:ended', snap);
    await this.tournaments
      .afterMatchEnded(g.tournamentId)
      .catch((e) => this.logger.error('afterMatchEnded failed', e));
  }
}
