import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const STATUSES = ['draft', 'open', 'ongoing', 'completed'] as const;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTournamentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  /** "<minutes>+<increment seconds>", e.g. 5+0 or 5+3. */
  @Matches(/^\d{1,3}\+\d{1,3}$/, { message: 'timeControl must look like 5+0' })
  timeControl!: string;

  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsEnum(['draft', 'open'] as const)
  status?: 'draft' | 'open';

  @IsOptional()
  @IsBoolean()
  allowRematch?: boolean;
}

export class UpdateTournamentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Matches(/^\d{1,3}\+\d{1,3}$/, { message: 'timeControl must look like 5+0' })
  timeControl?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsEnum(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  allowRematch?: boolean;
}

export class AddParticipantDto {
  @IsUUID()
  userId!: string;
}

export class ListTournamentsQuery {
  @IsOptional()
  @IsEnum(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}
