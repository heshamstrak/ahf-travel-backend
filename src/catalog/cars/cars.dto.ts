import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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
import { PageQueryDto, toBoolean, toCodeValue, toInt, toNumber, toTrimmed } from "../common/query";
import { toCodeList, toStringList } from "../common/lists";

export const CAR_SORTS = ["recommended", "price-asc", "price-desc"] as const;
export type CarSort = (typeof CAR_SORTS)[number];
export const CAR_CATEGORIES = ["ECONOMY", "COMPACT", "SUV", "PREMIUM_SUV", "LUXURY"] as const;
export const TRANSMISSION_FILTERS = ["ANY", "AUTOMATIC", "MANUAL"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListCarsQuery extends PageQueryDto {
  /** Rental window. Dates are validated and echoed; branch availability is applied in Milestone 4. */
  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  pickupDate?: string;

  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  dropoffDate?: string;

  /** Models whose minimum driver age is at or below this age are returned. */
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(18)
  @Max(99)
  driverAge?: number;

  @IsOptional()
  @Transform(toCodeList)
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(CAR_CATEGORIES, { each: true })
  categories?: string[];

  @IsOptional()
  @Transform(toCodeValue)
  @IsIn(TRANSMISSION_FILTERS)
  transmission?: (typeof TRANSMISSION_FILTERS)[number];

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(12)
  minPassengers?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(12)
  minBags?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  airConditioning?: boolean;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  brands?: string[];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000)
  maxPrice?: number;

  @IsOptional()
  @Transform(toTrimmed)
  @IsIn(CAR_SORTS)
  sort?: CarSort;
}
