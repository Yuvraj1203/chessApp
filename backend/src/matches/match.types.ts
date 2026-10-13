import type { EndReason, MatchResult } from '../database/schema';
import type { Color } from './game.logic';

export interface PlayerInfo {
  id: string;
  name: string;
}

/** Full picture of a match, sent over Socket.IO and REST. */
export interface MatchSnapshot {
  matchId: string;
  tournamentId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  fen: string;
  /** Move list (movetext while live, full PGN with headers once finished). */
  pgn: string;
  turn: Color;
  /** Remaining time of each side as of `serverTime`. */
  whiteMs: number;
  blackMs: number;
  /** True while the side to move's clock is ticking. */
  running: boolean;
  status: 'active' | 'completed';
  result: MatchResult | null;
  endReason: EndReason | null;
  drawOffer: Color | null;
  timeControl: string;
  serverTime: number;
}
