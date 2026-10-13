import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { AppGateway } from './app.gateway';

@Module({
  imports: [MatchesModule, MatchmakingModule, TournamentsModule],
  providers: [AppGateway],
})
export class GatewayModule {}
