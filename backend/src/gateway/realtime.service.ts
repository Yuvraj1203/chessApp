import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Thin holder for the Socket.IO server so domain services can push events. */
@Injectable()
export class RealtimeService {
  server?: Server;

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toMatch(matchId: string, event: string, payload: unknown): void {
    this.server?.to(`match:${matchId}`).emit(event, payload);
  }

  toTournament(tournamentId: string, event: string, payload: unknown): void {
    this.server?.to(`tournament:${tournamentId}`).emit(event, payload);
  }
}
