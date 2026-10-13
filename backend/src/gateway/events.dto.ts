import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  validateSync,
} from 'class-validator';

export class TournamentRefDto {
  @IsUUID()
  tournamentId!: string;
}

export class MatchRefDto {
  @IsUUID()
  matchId!: string;
}

export class MoveDto extends MatchRefDto {
  @IsString()
  @Length(2, 2)
  from!: string;

  @IsString()
  @Length(2, 2)
  to!: string;

  @IsOptional()
  @IsIn(['q', 'r', 'b', 'n'])
  promotion?: string;
}

export class DrawResponseDto extends MatchRefDto {
  @IsIn([true, false])
  accept!: boolean;
}

/** Validates a socket payload with class-validator; throws a readable Error. */
export function parsePayload<T extends object>(
  cls: new () => T,
  payload: unknown,
): T {
  const obj = plainToInstance(cls, payload ?? {});
  const errors = validateSync(obj, { whitelist: true });
  if (errors.length) {
    throw new Error(
      errors.flatMap((e) => Object.values(e.constraints ?? {})).join(', '),
    );
  }
  return obj;
}
