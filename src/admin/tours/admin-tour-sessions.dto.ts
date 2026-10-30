import { Transform } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsUUID, Length, Min } from "class-validator";
import { PageQueryDto, toInt, toNumber, toTrimmed } from "../../catalog/common/query";

const SESSION_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;
export type SessionStatusCode = (typeof SESSION_STATUSES)[number];

/** The cross-tour "Tour Sessions" admin table. */
export class ListAllTourSessionsQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @Length(1, 160)
  q?: string;

  @IsOptional()
  @IsUUID()
  tourId?: string;

  @IsOptional()
  @IsIn(SESSION_STATUSES)
  status?: SessionStatusCode;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class CreateTourSessionDto {
  @IsISO8601()
  startsAt!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  priceOverride?: number;

  @IsOptional()
  @Transform(toTrimmed)
  @Length(3, 3)
  overrideCurrency?: string;
}

export class UpdateTourSessionDto {
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  priceOverride?: number;

  @IsOptional()
  @Transform(toTrimmed)
  @Length(3, 3)
  overrideCurrency?: string;
}

export class SetTourSessionCapacityDto {
  @Transform(toInt)
  @IsInt()
  @Min(0)
  capacity!: number;
}

export class SetSessionStatusDto {
  @IsIn(SESSION_STATUSES)
  status!: SessionStatusCode;
}
