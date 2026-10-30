import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { PageQueryDto, toInt, toNumber, toTrimmed } from "../common/query";
import { toCodeList } from "../common/lists";

export const TOUR_SORTS = ["recommended", "price-asc", "price-desc", "rating"] as const;
export type TourSort = (typeof TOUR_SORTS)[number];

export const TOUR_CATEGORIES = ["HISTORY_CULTURE", "DINING_ENTERTAINMENT", "WATER_ACTIVITIES", "SIGHTSEEING"] as const;
export const TOUR_DURATION_BANDS = ["short", "half", "full"] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListToursQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "must be a lowercase slug" })
  @Length(1, 80)
  destination?: string;

  /** Departures on this calendar day (UTC date). Schedule-based; capacity is checked in Milestone 4. */
  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  date?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(40)
  guests?: number;

  /** Category codes, e.g. HISTORY_CULTURE,SIGHTSEEING. Labels are not accepted. */
  @IsOptional()
  @Transform(toCodeList)
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(TOUR_CATEGORIES, { each: true })
  categories?: string[];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000)
  maxPrice?: number;

  /** short: up to 3 hours. half: over 3 up to 6 hours. full: over 6 hours. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.split(",").map((v) => v.trim()).filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(TOUR_DURATION_BANDS, { each: true })
  durations?: (typeof TOUR_DURATION_BANDS)[number][];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsIn(TOUR_SORTS)
  sort?: TourSort;
}

export class TourSessionsQuery {
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  from!: string;

  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  to!: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(40)
  participants?: number;
}
