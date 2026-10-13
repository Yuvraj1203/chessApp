import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { MatchmakingService } from './matchmaking.service';

@Module({
  imports: [MatchesModule, TournamentsModule],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
