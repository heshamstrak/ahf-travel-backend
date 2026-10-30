import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";
import { PageQueryDto, toInt } from "../common/query";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Transfer rates between two published locations. Ids come from GET /locations. */
export class TransferRatesQuery extends PageQueryDto {
  @IsUUID()
  originLocationId!: string;

  @IsUUID()
  destinationLocationId!: string;

  /** Rate validity date (YYYY-MM-DD). Defaults to today (UTC). */
  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  date?: string;

  /** Accepted and echoed. Time-slot capacity arrives in V1.1. */
  @IsOptional()
  @Matches(TIME, { message: "must be a time (HH:MM, 24-hour)" })
  time?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(12)
  passengers?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(12)
  luggage?: number;
}
