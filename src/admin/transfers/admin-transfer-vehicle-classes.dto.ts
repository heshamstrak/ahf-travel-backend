import { Transform } from "class-transformer";
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { toBoolean, toInt } from "../../catalog/common/query";
import { toStringList } from "../../catalog/common/lists";

const VEHICLE_TYPES = ["SEDAN", "SUV", "PREMIUM", "VAN", "MINIBUS"] as const;

export class CreateVehicleClassDto {
  @IsIn(VEHICLE_TYPES)
  code!: (typeof VEHICLE_TYPES)[number];

  @IsString()
  @Length(1, 120)
  name!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  passengersMax!: number;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  luggageMax!: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  features?: string[];
}

export class UpdateVehicleClassDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  passengersMax?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  luggageMax?: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  features?: string[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
