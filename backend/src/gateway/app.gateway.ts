import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { AUTH_COOKIE, AuthService, readCookie } from '../auth/auth.service';
import type { AuthUser } from '../common/auth.types';
import { MatchesService } from '../matches/matches.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import {
  DrawResponseDto,
  MatchRefDto,
  MoveDto,
  parsePayload,
  TournamentRefDto,
} from './events.dto';
import { RealtimeService } from './realtime.service';

type SocketData = { user: AuthUser };
type Events = Record<string, unknown>;
type AuthedSocket = Socket<Events, Events, Events, SocketData>;

@WebSocketGateway()
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AppGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeService,
    private readonly matches: MatchesService,
    private readonly matchmaking: MatchmakingService,
    private readonly tournaments: TournamentsService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.server = server;
    // Authenticate the handshake: no valid JWT cookie => no connection.
    server.use((socket, next) => {
      const token = readCookie(socket.handshake.headers.cookie, AUTH_COOKIE);
      this.auth
        .userFromToken(token)
        .then((user) => {
          if (!user) return next(new Error('Unauthorized'));
          (socket.data as SocketData).user = user;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });
  }

  handleConnection(client: AuthedSocket): void {
    // Personal room: lets the server push match:found etc. to this user.
    void client.join(`user:${client.data.user.id}`);
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const user = client.data.user;
    if (!user) return;
    const remaining = await this.realtime.server
      ?.in(`user:${user.id}`)
      .fetchSockets();
    // Leave the queue only when the user's last tab/connection is gone.
    if (!remaining?.length) this.matchmaking.removeUser(user.id);
  }

  /**
   * Runs a handler; Nest sends the returned value as the Socket.IO ack, so
   * thrown errors become `{ ok:false, error }` instead of a silent failure.
   */
  private async run(
    fn: () => unknown,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    try {
      return { ok: true, data: await fn() };
    } catch (e) {
      const raw = (e as { response?: { message?: unknown } }).response?.message;
      const error = Array.isArray(raw)
        ? raw.join(', ')
        : typeof raw === 'string'
          ? raw
          : (e as Error).message;
      return { ok: false, error };
    }
  }

  // ---------- matchmaking ----------

  @SubscribeMessage('queue:join')
  onQueueJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(async () => {
      if (client.data.user.role !== 'student') {
        throw new Error('Only students can join the queue');
      }
      const { tournamentId } = parsePayload(TournamentRefDto, body);
      return this.matchmaking.join(client.data.user.id, tournamentId);
    });
  }

  @SubscribeMessage('queue:leave')
  onQueueLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(() => {
      const { tournamentId } = parsePayload(TournamentRefDto, body);
      this.matchmaking.leave(client.data.user.id, tournamentId);
      return { queued: false };
    });
  }

  // ---------- tournament live updates ----------

  @SubscribeMessage('tournament:watch')
  onTournamentWatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(async () => {
      const { tournamentId } = parsePayload(TournamentRefDto, body);
      // Throws 404 for drafts hidden from students.
      await this.tournaments.get(client.data.user, tournamentId);
      await client.join(`tournament:${tournamentId}`);
      return { watching: true, queueSize: this.matchmaking.size(tournamentId) };
    });
  }

  @SubscribeMessage('tournament:unwatch')
  onTournamentUnwatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(async () => {
      const { tournamentId } = parsePayload(TournamentRefDto, body);
      await client.leave(`tournament:${tournamentId}`);
      return { watching: false };
    });
  }

  // ---------- match room ----------

  /**
   * Join a match room and get the current snapshot back. Only the two
   * players (or a coach, as a read-only spectator) are admitted. Calling this
   * again after a refresh/reconnect restores board + clocks.
   */
  @SubscribeMessage('match:join')
  onMatchJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(async () => {
      const { matchId } = parsePayload(MatchRefDto, body);
      const snapshot = await this.matches.getForViewer(
        client.data.user,
        matchId,
      );
      await client.join(`match:${matchId}`);
      return snapshot;
    });
  }

  @SubscribeMessage('match:leave')
  onMatchLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(async () => {
      const { matchId } = parsePayload(MatchRefDto, body);
      await client.leave(`match:${matchId}`);
      return { left: true };
    });
  }

  @SubscribeMessage('match:move')
  onMove(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(() => {
      const { matchId, from, to, promotion } = parsePayload(MoveDto, body);
      return this.matches.move(client.data.user.id, matchId, {
        from,
        to,
        promotion,
      });
    });
  }

  @SubscribeMessage('match:resign')
  onResign(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(() => {
      const { matchId } = parsePayload(MatchRefDto, body);
      return this.matches.resign(client.data.user.id, matchId);
    });
  }

  @SubscribeMessage('match:draw:offer')
  onDrawOffer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(() => {
      const { matchId } = parsePayload(MatchRefDto, body);
      return this.matches.offerDraw(client.data.user.id, matchId);
    });
  }

  @SubscribeMessage('match:draw:respond')
  onDrawRespond(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    return this.run(() => {
      const { matchId, accept } = parsePayload(DrawResponseDto, body);
      return this.matches.respondDraw(client.data.user.id, matchId, accept);
    });
  }
}
