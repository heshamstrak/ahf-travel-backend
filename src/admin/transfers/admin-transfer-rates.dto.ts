import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Matches, Min } from "class-validator";
import { toBoolean, toInt, toNumber, toTrimmed } from "../../catalog/common/query";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTransferRateDto {
  @IsUUID()
  originLocationId!: string;

  @IsUUID()
  destinationLocationId!: string;

  @IsUUID()
  vehicleClassId!: string;

  @Transform(toNumber)
  @IsNumber()
  amount!: number;

  @Transform(toTrimmed)
  @Matches(/^[A-Z]{3}$/, { message: "must be a 3-letter ISO currency code" })
  currency!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  validFrom!: string;

  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  validTo?: string;
}

export class UpdateTransferRateDto {
  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  amount?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  validTo?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
