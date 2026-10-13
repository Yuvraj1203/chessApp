import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type { AuthUser } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import {
  AddParticipantDto,
  CreateTournamentDto,
  ListTournamentsQuery,
  UpdateTournamentDto,
} from './dto';
import { TournamentsService } from './tournaments.service';

@Controller({ path: 'tournaments', version: '1' })
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListTournamentsQuery) {
    return this.tournaments.list(user, q);
  }

  @Roles('coach')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTournamentDto) {
    return this.tournaments.create(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tournaments.get(user, id);
  }

  @Roles('coach')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournaments.update(user, id, dto);
  }

  @Roles('coach')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournaments.remove(id);
  }

  @Roles('student')
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tournaments.join(user, id);
  }

  @Roles('coach')
  @Post(':id/participants')
  addParticipant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantDto,
  ) {
    return this.tournaments.addParticipant(user, id, dto.userId);
  }

  @Roles('coach')
  @Delete(':id/participants/:userId')
  removeParticipant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tournaments.removeParticipant(user, id, userId);
  }

  @Get(':id/leaderboard')
  leaderboard(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tournaments.leaderboard(user, id);
  }

  @Get(':id/matches')
  matches(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tournaments.listMatches(user, id);
  }

  @Roles('coach')
  @Get(':id/stats')
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournaments.stats(id);
  }
}
