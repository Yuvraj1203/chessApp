export type Role = "coach" | "student";
export type TournamentStatus = "draft" | "open" | "ongoing" | "completed";
export type Color = "white" | "black";
export type MatchResult = "white" | "black" | "draw";
export type EndReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "stalemate"
  | "agreement"
  | "repetition"
  | "fifty_moves"
  | "insufficient_material";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface MeResponse {
  user: AuthUser;
  activeMatchId: string | null;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface Tournament {
  id: string;
  name: string;
  timeControl: string;
  baseMinutes: number;
  incrementSeconds: number;
  startsAt: string;
  status: TournamentStatus;
  allowRematch: boolean;
  winner: { id: string; name: string | null } | null;
  participantCount: number;
  joined: boolean;
  createdAt: string;
}

export interface TournamentDetail extends Tournament {
  participants: Participant[];
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
  tiebreak: number;
}

export interface TournamentMatch {
  id: string;
  status: "active" | "completed";
  result: MatchResult | null;
  endReason: EndReason | null;
  startedAt: string;
  endedAt: string | null;
  white: { id: string; name: string };
  black: { id: string; name: string };
}

export interface TournamentStats {
  participants: number;
  totalMatches: number;
  activeMatches: number;
  completedMatches: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  possibleMatches: number;
  leader: StandingRow | null;
  winnerId: string | null;
}

export interface HistoryItem {
  id: string;
  tournamentId: string;
  tournamentName: string;
  status: "active" | "completed";
  color: Color;
  opponent: string;
  outcome: "win" | "loss" | "draw" | null;
  result: MatchResult | null;
  endReason: EndReason | null;
  startedAt: string;
  endedAt: string | null;
}

export interface MatchSnapshot {
  matchId: string;
  tournamentId: string;
  white: { id: string; name: string };
  black: { id: string; name: string };
  fen: string;
  pgn: string;
  turn: Color;
  whiteMs: number;
  blackMs: number;
  running: boolean;
  status: "active" | "completed";
  result: MatchResult | null;
  endReason: EndReason | null;
  drawOffer: Color | null;
  timeControl: string;
  serverTime: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
}
