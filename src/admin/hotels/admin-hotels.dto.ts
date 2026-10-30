import { Transform } from "class-transformer";
import { ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from "class-validator";
import { toInt, toNumber, toTrimmed } from "../../catalog/common/query";
import { toStringList } from "../../catalog/common/lists";

const PROPERTY_TYPES = ["HOTEL", "RESORT", "APARTMENT", "VILLA"] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateHotelDto {
  @Transform(toTrimmed)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "must be a lowercase slug" })
  @Length(1, 120)
  slug!: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsUUID()
  destinationId!: string;

  @IsIn(PROPERTY_TYPES)
  propertyType!: (typeof PROPERTY_TYPES)[number];

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(5)
  starRating!: number;

  @IsString()
  @Length(1, 255)
  addressLine!: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  longitude?: number;

  @IsString()
  description!: string;

  @Matches(TIME_PATTERN, { message: "must be HH:MM" })
  checkInTime!: string;

  @Matches(TIME_PATTERN, { message: "must be HH:MM" })
  checkOutTime!: string;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  amenities?: string[];
}

export class UpdateHotelDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsIn(PROPERTY_TYPES)
  propertyType?: (typeof PROPERTY_TYPES)[number];

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(5)
  starRating?: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  addressLine?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: "must be HH:MM" })
  checkInTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: "must be HH:MM" })
  checkOutTime?: string;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  amenities?: string[];
}
