import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import type { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { MatchesService } from './matches.service';

@Controller({ path: 'matches', version: '1' })
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /** The current user's match history (all tournaments). */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.matches.history(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.matches.getForViewer(user, id);
  }
}
