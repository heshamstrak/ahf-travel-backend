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
import { toCodeList, toIntList, toStringList } from "../common/lists";

export const HOTEL_SORTS = ["recommended", "price-asc", "price-desc", "rating", "stars"] as const;
export type HotelSort = (typeof HOTEL_SORTS)[number];

export const PROPERTY_TYPES = ["HOTEL", "RESORT", "APARTMENT", "VILLA"] as const;
export type PropertyTypeCode = (typeof PROPERTY_TYPES)[number];

/** Query names and sort values follow the frontend's search contract. */
export class ListHotelsQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "must be a lowercase slug" })
  @Length(1, 80)
  destination?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "must be a date (YYYY-MM-DD)" })
  checkIn?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "must be a date (YYYY-MM-DD)" })
  checkOut?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(12)
  guests?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(6)
  rooms?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000)
  maxPrice?: number;

  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  stars?: number[];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10)
  minGuestRating?: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  amenities?: string[];

  @IsOptional()
  @Transform(toCodeList)
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(PROPERTY_TYPES, { each: true })
  propertyTypes?: PropertyTypeCode[];

  @IsOptional()
  @IsIn(HOTEL_SORTS)
  sort?: HotelSort;
}

