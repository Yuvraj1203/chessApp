import { Chess } from 'chess.js';

import type { EndReason, MatchResult } from '../database/schema';

export type Color = 'white' | 'black';

export interface GameState {
  pgn: string;
  fen: string;
  whiteMs: number;
  blackMs: number;
  /** Epoch ms at which the side-to-move's clock started; null when finished. */
  turnStartedAt: number | null;
  incrementMs: number;
}

export interface GameOutcome {
  result: MatchResult;
  reason: EndReason;
}

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export type MoveResult =
  | { ok: true; state: GameState; san: string; outcome: GameOutcome | null }
  | { ok: false; error: string };

export const START_FEN = new Chess().fen();

/** Move list only ("1. e4 e5 2. Nf3"), without PGN header tags. */
export function movetext(chess: Chess): string {
  return chess
    .pgn()
    .split('\n')
    .filter((line) => !line.startsWith('['))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)$/, '')
    .trim();
}

export function colorToMove(fen: string): Color {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black';
}

export function initialState(
  baseMinutes: number,
  incrementSeconds: number,
  now: number,
): GameState {
  const ms = baseMinutes * 60_000;
  return {
    pgn: '',
    fen: START_FEN,
    whiteMs: ms,
    blackMs: ms,
    turnStartedAt: now,
    incrementMs: incrementSeconds * 1000,
  };
}

/** Clocks as they read right now: the running side has elapsed time deducted. */
export function currentClocks(
  state: GameState,
  now: number,
): { whiteMs: number; blackMs: number } {
  if (state.turnStartedAt === null) {
    return { whiteMs: state.whiteMs, blackMs: state.blackMs };
  }
  const elapsed = Math.max(0, now - state.turnStartedAt);
  return colorToMove(state.fen) === 'white'
    ? { whiteMs: Math.max(0, state.whiteMs - elapsed), blackMs: state.blackMs }
    : { whiteMs: state.whiteMs, blackMs: Math.max(0, state.blackMs - elapsed) };
}

/** Which side (if any) has run out of time at `now`. */
export function flagged(state: GameState, now: number): Color | null {
  if (state.turnStartedAt === null) return null;
  const clocks = currentClocks(state, now);
  const turn = colorToMove(state.fen);
  const left = turn === 'white' ? clocks.whiteMs : clocks.blackMs;
  return left <= 0 ? turn : null;
}

export function outcomeFromPosition(chess: Chess): GameOutcome | null {
  if (chess.isCheckmate()) {
    // The side to move is mated, so the other side wins.
    return {
      result: chess.turn() === 'w' ? 'black' : 'white',
      reason: 'checkmate',
    };
  }
  if (chess.isStalemate()) return { result: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) {
    return { result: 'draw', reason: 'insufficient_material' };
  }
  if (chess.isThreefoldRepetition()) {
    return { result: 'draw', reason: 'repetition' };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { result: 'draw', reason: 'fifty_moves' };
  }
  return null;
}

/**
 * Validates and applies a move. Pure: the caller supplies `now`, so the same
 * input always gives the same output (important for testing the clock).
 */
export function applyMove(
  state: GameState,
  player: Color,
  move: MoveInput,
  now: number,
): MoveResult {
  if (state.turnStartedAt === null) {
    return { ok: false, error: 'Game is already finished' };
  }
  if (colorToMove(state.fen) !== player) {
    return { ok: false, error: 'Not your turn' };
  }
  if (flagged(state, now) === player) {
    return { ok: false, error: 'Your time has run out' };
  }

  const chess = new Chess();
  if (state.pgn) chess.loadPgn(state.pgn);

  let san: string;
  try {
    san = chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    }).san;
  } catch {
    return { ok: false, error: 'Illegal move' };
  }

  const clocks = currentClocks(state, now);
  const whiteMs =
    player === 'white' ? clocks.whiteMs + state.incrementMs : clocks.whiteMs;
  const blackMs =
    player === 'black' ? clocks.blackMs + state.incrementMs : clocks.blackMs;
  const outcome = outcomeFromPosition(chess);

  return {
    ok: true,
    san,
    outcome,
    state: {
      ...state,
      pgn: movetext(chess),
      fen: chess.fen(),
      whiteMs,
      blackMs,
      turnStartedAt: outcome ? null : now,
    },
  };
}
