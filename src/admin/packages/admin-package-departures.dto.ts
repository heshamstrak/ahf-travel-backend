import { Transform } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, Length, Matches, Min } from "class-validator";
import { toInt, toNumber, toTrimmed } from "../../catalog/common/query";

const SESSION_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;
export type SessionStatusCode = (typeof SESSION_STATUSES)[number];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreatePackageDepartureDto {
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  startsOn!: string;

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

export class UpdatePackageDepartureDto {
  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  startsOn?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  priceOverride?: number;

  @IsOptional()
  @Transform(toTrimmed)
  @Length(3, 3)
  overrideCurrency?: string;
}

export class SetPackageDepartureCapacityDto {
  @Transform(toInt)
  @IsInt()
  @Min(0)
  capacity!: number;
}

export class SetDepartureStatusDto {
  @IsIn(SESSION_STATUSES)
  status!: SessionStatusCode;
}
