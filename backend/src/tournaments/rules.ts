import { BadRequestException, ConflictException } from '@nestjs/common';

import type { TournamentStatus } from '../database/schema';

const TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['open'],
  open: ['ongoing', 'completed'],
  ongoing: ['completed'],
  completed: [],
};

export function canTransition(
  from: TournamentStatus,
  to: TournamentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Students may self-join only while the tournament is open, and only once. */
export function assertCanJoin(
  status: TournamentStatus,
  alreadyJoined: boolean,
): void {
  if (status !== 'open') {
    throw new BadRequestException('Only open tournaments can be joined');
  }
  if (alreadyJoined) {
    throw new ConflictException('You have already joined this tournament');
  }
}

/** Matchmaking is available to participants while open or ongoing. */
export function assertCanQueue(
  status: TournamentStatus,
  isParticipant: boolean,
): void {
  if (status !== 'open' && status !== 'ongoing') {
    throw new BadRequestException('This tournament is not accepting games');
  }
  if (!isParticipant) {
    throw new BadRequestException('Join the tournament before queueing');
  }
}

export function parseTimeControl(tc: string): {
  baseMinutes: number;
  incrementSeconds: number;
} {
  const m = /^(\d{1,3})\+(\d{1,3})$/.exec(tc);
  if (!m) throw new BadRequestException('Time control must look like 5+0');
  const baseMinutes = Number(m[1]);
  if (baseMinutes < 1) {
    throw new BadRequestException('Base time must be at least 1 minute');
  }
  return { baseMinutes, incrementSeconds: Number(m[2]) };
}
