import { Transform, Type } from "class-transformer";
import { ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Min, ValidateNested } from "class-validator";
import { toInt, toNumber, toTrimmed } from "../../catalog/common/query";
import { toStringList } from "../../catalog/common/lists";

const TOUR_CATEGORIES = ["HISTORY_CULTURE", "DINING_ENTERTAINMENT", "WATER_ACTIVITIES", "SIGHTSEEING"] as const;

export class ItineraryStepDto {
  @Transform(toInt)
  @IsInt()
  @Min(0)
  offsetMinutes!: number;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  description!: string;
}

export class CreateTourDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 120)
  slug!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsIn(TOUR_CATEGORIES)
  category!: (typeof TOUR_CATEGORIES)[number];

  @IsUUID()
  destinationId!: string;

  @IsString()
  @Length(1, 255)
  meetingPoint!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  maxGroupSize!: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  languages?: string[];

  @Transform(toTrimmed)
  @Length(3, 3)
  currency!: string;

  @Transform(toNumber)
  @IsNumber()
  pricePerPerson!: number;

  @IsString()
  overview!: string;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  highlights?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  included?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  excluded?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  importantInfo?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItineraryStepDto)
  itinerary?: ItineraryStepDto[];

  @IsUUID()
  cancellationPolicyId!: string;
}

export class UpdateTourDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsIn(TOUR_CATEGORIES)
  category?: (typeof TOUR_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 255)
  meetingPoint?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  maxGroupSize?: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  languages?: string[];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  pricePerPerson?: number;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  highlights?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  included?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  excluded?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  importantInfo?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItineraryStepDto)
  itinerary?: ItineraryStepDto[];

  @IsOptional()
  @IsUUID()
  cancellationPolicyId?: string;
}
