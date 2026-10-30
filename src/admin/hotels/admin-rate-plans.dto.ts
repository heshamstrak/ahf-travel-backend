import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { toBoolean, toNumber, toTrimmed } from "../../catalog/common/query";

const MEAL_PLANS = ["ROOM_ONLY", "BREAKFAST", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE"] as const;

export class CreateRatePlanDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsIn(MEAL_PLANS)
  mealPlan?: (typeof MEAL_PLANS)[number];

  @Transform(toBoolean)
  @IsBoolean()
  isRefundable!: boolean;

  @IsUUID()
  cancellationPolicyId!: string;

  @Transform(toTrimmed)
  @Length(3, 3)
  currency!: string;

  @Transform(toNumber)
  @IsNumber()
  basePricePerNight!: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  extraAdultPerNight?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  extraChildPerNight?: number;
}

export class UpdateRatePlanDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsIn(MEAL_PLANS)
  mealPlan?: (typeof MEAL_PLANS)[number];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isRefundable?: boolean;

  @IsOptional()
  @IsUUID()
  cancellationPolicyId?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  basePricePerNight?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  extraAdultPerNight?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  extraChildPerNight?: number;
}
