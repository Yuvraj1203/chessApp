import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['coach', 'student']);
export const tournamentStatusEnum = pgEnum('tournament_status', [
  'draft',
  'open',
  'ongoing',
  'completed',
]);
export const matchStatusEnum = pgEnum('match_status', ['active', 'completed']);
export const matchResultEnum = pgEnum('match_result', [
  'white',
  'black',
  'draw',
]);
export const endReasonEnum = pgEnum('end_reason', [
  'checkmate',
  'resignation',
  'timeout',
  'stalemate',
  'agreement',
  'repetition',
  'fifty_moves',
  'insufficient_material',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Time control: base minutes per side + increment seconds per move ("5+0", "5+3").
  baseMinutes: integer('base_minutes').notNull(),
  incrementSeconds: integer('increment_seconds').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  status: tournamentStatusEnum('status').notNull().default('draft'),
  // When false (default) the tournament is a round robin: every pair meets once.
  allowRematch: boolean('allow_rematch').notNull().default(false),
  winnerId: uuid('winner_id').references(() => users.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tournamentParticipants = pgTable(
  'tournament_participants',
  {
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.userId] })],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    whiteId: uuid('white_id')
      .notNull()
      .references(() => users.id),
    blackId: uuid('black_id')
      .notNull()
      .references(() => users.id),
    status: matchStatusEnum('status').notNull().default('active'),
    result: matchResultEnum('result'),
    endReason: endReasonEnum('end_reason'),
    pgn: text('pgn').notNull().default(''),
    fen: text('fen').notNull(),
    whiteTimeMs: integer('white_time_ms').notNull(),
    blackTimeMs: integer('black_time_ms').notNull(),
    // Moment the side to move's clock started running (null once finished).
    turnStartedAt: timestamp('turn_started_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('matches_tournament_idx').on(t.tournamentId),
    index('matches_white_idx').on(t.whiteId),
    index('matches_black_idx').on(t.blackId),
  ],
);

/**
 * One row per player per match. The partial unique index guarantees at the DB
 * level that a player can never be in two active matches at once, even if the
 * application layer has a race.
 */
export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.userId] }),
    uniqueIndex('one_active_match_per_user')
      .on(t.userId)
      .where(sql`${t.active} = true`),
  ],
);

export type User = typeof users.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type TournamentStatus = (typeof tournamentStatusEnum.enumValues)[number];
export type MatchResult = (typeof matchResultEnum.enumValues)[number];
export type EndReason = (typeof endReasonEnum.enumValues)[number];
