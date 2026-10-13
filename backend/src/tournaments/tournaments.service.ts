import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { aliasedTable, and, asc, count, desc, eq, ne, sql } from 'drizzle-orm';

import type { AuthUser } from '../common/auth.types';
import { DB, type Database } from '../database/database.module';
import {
  matches,
  tournamentParticipants,
  tournaments,
  users,
  type Tournament,
} from '../database/schema';
import { RealtimeService } from '../gateway/realtime.service';
import type {
  CreateTournamentDto,
  ListTournamentsQuery,
  UpdateTournamentDto,
} from './dto';
import { assertCanJoin, canTransition, parseTimeControl } from './rules';
import { computeStandings, type StandingRow } from './standings';

@Injectable()
export class TournamentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------- helpers ----------

  async require(id: string): Promise<Tournament> {
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, id));
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  /** Students must not see (or guess) draft tournaments. */
  private assertVisible(user: AuthUser, t: Tournament): void {
    if (user.role === 'student' && t.status === 'draft') {
      throw new NotFoundException('Tournament not found');
    }
  }

  async isParticipant(tournamentId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ n: count() })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId),
        ),
      );
    return row.n > 0;
  }

  private toView(
    t: Tournament,
    extra: {
      participantCount: number;
      joined: boolean;
      winnerName: string | null;
    },
  ) {
    return {
      id: t.id,
      name: t.name,
      timeControl: `${t.baseMinutes}+${t.incrementSeconds}`,
      baseMinutes: t.baseMinutes,
      incrementSeconds: t.incrementSeconds,
      startsAt: t.startsAt.toISOString(),
      status: t.status,
      allowRematch: t.allowRematch,
      winner: t.winnerId ? { id: t.winnerId, name: extra.winnerName } : null,
      participantCount: extra.participantCount,
      joined: extra.joined,
      createdAt: t.createdAt.toISOString(),
    };
  }

  private notify(tournamentId: string): void {
    this.realtime.toTournament(tournamentId, 'tournament:updated', {
      tournamentId,
    });
  }

  // ---------- CRUD ----------

  async list(user: AuthUser, q: ListTournamentsQuery) {
    const rows = await this.db
      .select({
        t: tournaments,
        winnerName: users.name,
      })
      .from(tournaments)
      .leftJoin(users, eq(users.id, tournaments.winnerId))
      .where(
        and(
          q.status ? eq(tournaments.status, q.status) : undefined,
          user.role === 'student' ? ne(tournaments.status, 'draft') : undefined,
        ),
      )
      .orderBy(desc(tournaments.startsAt));

    const counts = await this.db
      .select({ id: tournamentParticipants.tournamentId, n: count() })
      .from(tournamentParticipants)
      .groupBy(tournamentParticipants.tournamentId);
    const mineRows = await this.db
      .select({ id: tournamentParticipants.tournamentId })
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.userId, user.id));
    const countMap = new Map(counts.map((c) => [c.id, c.n]));
    const mine = new Set(mineRows.map((r) => r.id));

    return rows
      .filter((r) => !q.mine || mine.has(r.t.id))
      .map((r) =>
        this.toView(r.t, {
          participantCount: countMap.get(r.t.id) ?? 0,
          joined: mine.has(r.t.id),
          winnerName: r.winnerName,
        }),
      );
  }

  async get(user: AuthUser, id: string) {
    const t = await this.require(id);
    this.assertVisible(user, t);
    const participants = await this.participants(id);
    let winnerName: string | null = null;
    if (t.winnerId) {
      winnerName = participants.find((p) => p.id === t.winnerId)?.name ?? null;
    }
    return {
      ...this.toView(t, {
        participantCount: participants.length,
        joined: participants.some((p) => p.id === user.id),
        winnerName,
      }),
      participants,
    };
  }

  async create(user: AuthUser, dto: CreateTournamentDto) {
    const tc = parseTimeControl(dto.timeControl);
    const [t] = await this.db
      .insert(tournaments)
      .values({
        name: dto.name,
        ...tc,
        startsAt: new Date(dto.startsAt),
        status: dto.status ?? 'draft',
        allowRematch: dto.allowRematch ?? false,
        createdBy: user.id,
      })
      .returning();
    return this.get(user, t.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateTournamentDto) {
    const t = await this.require(id);
    const patch: Partial<typeof tournaments.$inferInsert> = {};

    const settingsChange =
      dto.timeControl !== undefined || dto.allowRematch !== undefined;
    if (
      settingsChange &&
      (t.status === 'ongoing' || t.status === 'completed')
    ) {
      throw new BadRequestException(
        'Time control and rematch rules cannot change once play has started',
      );
    }
    if (t.status === 'completed' && Object.keys(dto).length > 0) {
      throw new BadRequestException('A completed tournament cannot be edited');
    }
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.startsAt !== undefined) patch.startsAt = new Date(dto.startsAt);
    if (dto.allowRematch !== undefined) patch.allowRematch = dto.allowRematch;
    if (dto.timeControl !== undefined) {
      Object.assign(patch, parseTimeControl(dto.timeControl));
    }

    if (dto.status !== undefined && dto.status !== t.status) {
      if (!canTransition(t.status, dto.status)) {
        throw new BadRequestException(
          `Cannot change status from ${t.status} to ${dto.status}`,
        );
      }
      patch.status = dto.status;
      if (dto.status === 'completed') {
        await this.assertNoActiveMatches(id);
        patch.winnerId = await this.pickWinner(id);
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.db
        .update(tournaments)
        .set(patch)
        .where(eq(tournaments.id, id));
      this.notify(id);
    }
    return this.get(user, id);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.require(id);
    const [active] = await this.db
      .select({ n: count() })
      .from(matches)
      .where(and(eq(matches.tournamentId, id), eq(matches.status, 'active')));
    if (active.n > 0) {
      throw new ConflictException('Matches are in progress in this tournament');
    }
    await this.db.delete(tournaments).where(eq(tournaments.id, id));
    return { deleted: true };
  }

  // ---------- participants ----------

  private async participants(id: string) {
    return this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        joinedAt: tournamentParticipants.joinedAt,
      })
      .from(tournamentParticipants)
      .innerJoin(users, eq(users.id, tournamentParticipants.userId))
      .where(eq(tournamentParticipants.tournamentId, id))
      .orderBy(asc(tournamentParticipants.joinedAt));
  }

  async join(user: AuthUser, id: string) {
    const t = await this.require(id);
    this.assertVisible(user, t);
    assertCanJoin(t.status, await this.isParticipant(id, user.id));
    await this.db
      .insert(tournamentParticipants)
      .values({ tournamentId: id, userId: user.id })
      .onConflictDoNothing();
    this.notify(id);
    return this.get(user, id);
  }

  async addParticipant(user: AuthUser, id: string, userId: string) {
    const t = await this.require(id);
    if (t.status === 'completed') {
      throw new BadRequestException('Tournament is completed');
    }
    const [student] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, 'student')));
    if (!student) throw new NotFoundException('Student not found');
    if (await this.isParticipant(id, userId)) {
      throw new ConflictException('Student is already a participant');
    }
    await this.db
      .insert(tournamentParticipants)
      .values({ tournamentId: id, userId })
      .onConflictDoNothing();
    this.notify(id);
    return this.get(user, id);
  }

  async removeParticipant(user: AuthUser, id: string, userId: string) {
    await this.require(id);
    const [played] = await this.db
      .select({ n: count() })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, id),
          sql`(${matches.whiteId} = ${userId} or ${matches.blackId} = ${userId})`,
        ),
      );
    if (played.n > 0) {
      throw new ConflictException(
        'Player already has games in this tournament',
      );
    }
    await this.db
      .delete(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, id),
          eq(tournamentParticipants.userId, userId),
        ),
      );
    this.notify(id);
    return this.get(user, id);
  }

  // ---------- results ----------

  async leaderboard(user: AuthUser, id: string): Promise<StandingRow[]> {
    const t = await this.require(id);
    this.assertVisible(user, t);
    return this.standings(id);
  }

  async standings(id: string): Promise<StandingRow[]> {
    const parts = await this.participants(id);
    const finished = await this.db
      .select({
        whiteId: matches.whiteId,
        blackId: matches.blackId,
        result: matches.result,
      })
      .from(matches)
      .where(
        and(eq(matches.tournamentId, id), eq(matches.status, 'completed')),
      );
    return computeStandings(
      parts.map((p) => ({ userId: p.id, name: p.name })),
      finished.flatMap((m) => (m.result ? [{ ...m, result: m.result }] : [])),
    );
  }

  async listMatches(user: AuthUser, id: string) {
    const t = await this.require(id);
    this.assertVisible(user, t);
    const white = aliasedTable(users, 'white_user');
    const black = aliasedTable(users, 'black_user');
    const rows = await this.db
      .select({
        id: matches.id,
        status: matches.status,
        result: matches.result,
        endReason: matches.endReason,
        startedAt: matches.startedAt,
        endedAt: matches.endedAt,
        whiteId: matches.whiteId,
        whiteName: white.name,
        blackId: matches.blackId,
        blackName: black.name,
      })
      .from(matches)
      .innerJoin(white, eq(white.id, matches.whiteId))
      .innerJoin(black, eq(black.id, matches.blackId))
      .where(eq(matches.tournamentId, id))
      .orderBy(desc(matches.startedAt));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      result: r.result,
      endReason: r.endReason,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      white: { id: r.whiteId, name: r.whiteName },
      black: { id: r.blackId, name: r.blackName },
    }));
  }

  async stats(id: string) {
    await this.require(id);
    const rows = await this.db
      .select({ status: matches.status, result: matches.result, n: count() })
      .from(matches)
      .where(eq(matches.tournamentId, id))
      .groupBy(matches.status, matches.result);
    const sum = (f: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(f).reduce((a, r) => a + r.n, 0);
    const parts = await this.participants(id);
    const standings = await this.standings(id);
    const t = await this.require(id);
    return {
      participants: parts.length,
      totalMatches: sum(() => true),
      activeMatches: sum((r) => r.status === 'active'),
      completedMatches: sum((r) => r.status === 'completed'),
      whiteWins: sum((r) => r.result === 'white'),
      blackWins: sum((r) => r.result === 'black'),
      draws: sum((r) => r.result === 'draw'),
      possibleMatches: (parts.length * (parts.length - 1)) / 2,
      leader: standings[0] && standings[0].played > 0 ? standings[0] : null,
      winnerId: t.winnerId,
    };
  }

  // ---------- completion ----------

  private async assertNoActiveMatches(id: string): Promise<void> {
    const [active] = await this.db
      .select({ n: count() })
      .from(matches)
      .where(and(eq(matches.tournamentId, id), eq(matches.status, 'active')));
    if (active.n > 0) {
      throw new ConflictException(
        `${active.n} match(es) still in progress — wait for them to finish`,
      );
    }
  }

  /** Winner = rank 1 on the leaderboard (null if nobody has played). */
  private async pickWinner(id: string): Promise<string | null> {
    const top = (await this.standings(id))[0];
    return top && top.played > 0 ? top.userId : null;
  }

  /** Pairs (a,b) that already have a match in this tournament (any status). */
  async playedPairs(id: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ w: matches.whiteId, b: matches.blackId })
      .from(matches)
      .where(eq(matches.tournamentId, id));
    return new Set(rows.map((r) => pairKey(r.w, r.b)));
  }

  /**
   * Called after every finished game. In a round-robin tournament (no
   * rematches) that is ongoing, once everyone has met everyone and nothing is
   * in progress, the tournament completes and the winner is declared.
   */
  async afterMatchEnded(id: string): Promise<void> {
    this.notify(id);
    const t = await this.require(id);
    if (t.status !== 'ongoing' || t.allowRematch) return;
    const parts = await this.participants(id);
    const needed = (parts.length * (parts.length - 1)) / 2;
    if (parts.length < 2) return;
    const [stat] = await this.db
      .select({
        total: count(),
        active: count(sql`case when ${matches.status} = 'active' then 1 end`),
      })
      .from(matches)
      .where(eq(matches.tournamentId, id));
    if (stat.active === 0 && stat.total >= needed) {
      await this.db
        .update(tournaments)
        .set({ status: 'completed', winnerId: await this.pickWinner(id) })
        .where(and(eq(tournaments.id, id), eq(tournaments.status, 'ongoing')));
      this.notify(id);
    }
  }
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
