import { Transform, Type } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Min, ValidateNested } from "class-validator";
import { toInt, toNumber, toTrimmed } from "../../catalog/common/query";
import { toStringList } from "../../catalog/common/lists";

const BUDGET_TIERS = ["BUDGET", "MID", "LUXURY"] as const;
const PRICING_BASES = ["PER_PERSON", "PER_ROOM", "PER_PACKAGE"] as const;

export class ItineraryDayDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  day!: number;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  description!: string;
}

export class CreatePackageDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 120)
  slug!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  overview!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationNights!: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationDays!: number;

  @IsIn(BUDGET_TIERS)
  budgetTier!: (typeof BUDGET_TIERS)[number];

  @IsIn(PRICING_BASES)
  pricingBasis!: (typeof PRICING_BASES)[number];

  @Transform(toTrimmed)
  @Length(3, 3)
  currency!: string;

  @Transform(toNumber)
  @IsNumber()
  basePrice!: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  singleSupplement?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  childPrice?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  extraPersonPrice?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  minTravellers?: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  maxTravellers!: number;

  @IsUUID()
  cancellationPolicyId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItineraryDayDto)
  itinerary!: ItineraryDayDto[];

  /** Detailed hotel/tour/transfer-style descriptions; a loosely-typed JSON blob per the approved
   *  schema (references to real catalogue rows are deferred to V1.1). */
  @IsOptional()
  includes?: unknown;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  included?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  excluded?: string[];

  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  destinationIds!: string[];
}

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationNights?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsIn(BUDGET_TIERS)
  budgetTier?: (typeof BUDGET_TIERS)[number];

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  singleSupplement?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  childPrice?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  extraPersonPrice?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  minTravellers?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  maxTravellers?: number;

  @IsOptional()
  @IsUUID()
  cancellationPolicyId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItineraryDayDto)
  itinerary?: ItineraryDayDto[];

  @IsOptional()
  includes?: unknown;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  included?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  excluded?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  destinationIds?: string[];
}
