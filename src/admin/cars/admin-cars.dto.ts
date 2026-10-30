import { Transform } from "class-transformer";
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { toBoolean, toInt, toNumber, toTrimmed } from "../../catalog/common/query";
import { toStringList } from "../../catalog/common/lists";

const CAR_CATEGORIES = ["ECONOMY", "COMPACT", "SUV", "PREMIUM_SUV", "LUXURY"] as const;
const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"] as const;

export class CreateCarModelDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 120)
  slug!: string;

  @IsString()
  @Length(1, 60)
  brand!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsIn(CAR_CATEGORIES)
  category!: (typeof CAR_CATEGORIES)[number];

  @IsIn(TRANSMISSIONS)
  transmission!: (typeof TRANSMISSIONS)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasAirConditioning?: boolean;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  passengers!: number;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  bags!: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  doors!: number;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  includedKmPerDay!: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  fuelPolicy?: string;

  @Transform(toInt)
  @IsInt()
  @Min(18)
  @Max(99)
  minDriverAge!: number;

  @Transform(toTrimmed)
  @Length(3, 3)
  currency!: string;

  @Transform(toNumber)
  @IsNumber()
  pricePerDay!: number;

  @Transform(toNumber)
  @IsNumber()
  depositAmount!: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  coverage?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  rentalConditions?: string[];

  @IsOptional()
  @IsString()
  pickupNotes?: string;

  @IsUUID()
  cancellationPolicyId!: string;
}

export class UpdateCarModelDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  brand?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsIn(CAR_CATEGORIES)
  category?: (typeof CAR_CATEGORIES)[number];

  @IsOptional()
  @IsIn(TRANSMISSIONS)
  transmission?: (typeof TRANSMISSIONS)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasAirConditioning?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  passengers?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  bags?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  doors?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  includedKmPerDay?: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  fuelPolicy?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(18)
  @Max(99)
  minDriverAge?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  pricePerDay?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  depositAmount?: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  coverage?: string[];

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  rentalConditions?: string[];

  @IsOptional()
  @IsString()
  pickupNotes?: string;

  @IsOptional()
  @IsUUID()
  cancellationPolicyId?: string;
}
